/**
 * [INPUT]: 私有服务发现、已授权文件位置接口（工作区文件、资料库原件）、系统默认文档应用
 * [OUTPUT]: open_workspace_file：按项目/会话/范围打开真实文件并保留相对资源；open_library_item：按资料条目 id 用系统默认应用打开原件
 * [POS]: 原生文件动作；路径只来自受信本机服务，二次核对根内普通文件，不接受页面绝对路径
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
use std::path::{Path, PathBuf};
use std::time::Duration;
use crate::mastra::ServiceConnection;

#[derive(serde::Deserialize)]
struct FileLocation { root: PathBuf, path: PathBuf }

fn readable_file(location: FileLocation) -> Result<PathBuf, String> {
    if !location.root.is_absolute() || !location.path.is_absolute() { return Err("文件位置无效".into()); }
    let root = location.root.canonicalize().map_err(|_| "工作区不可访问")?;
    let path = location.path.canonicalize().map_err(|_| "文件不存在")?;
    if !path.starts_with(root) || !path.is_file() { return Err("文件不在可访问的工作区内".into()); }
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_lowercase();
    if !["pdf", "md", "markdown", "txt", "json", "csv", "html", "htm", "png", "jpg", "jpeg", "gif", "webp", "svg", "docx"].contains(&extension.as_str()) {
        return Err("此类型请保存到本机后打开".into());
    }
    Ok(path)
}

fn open_document(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("/usr/bin/open").arg("--").arg(path).status();
    #[cfg(target_os = "linux")]
    let status = std::process::Command::new("xdg-open").arg(path).status();
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    return Err("当前平台不支持系统打开".into());
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    if status.map_err(|_| "无法启动系统文档应用")?.success() { Ok(()) } else { Err("系统打开失败".into()) }
}

/// 资料库原件：服务给的位置再核一遍——根就是 library/，路径正好是 library/<id>/<文件>，不含 ..、本身不是符号链接、是普通文件
fn library_file(item_id: &str, location: FileLocation) -> Result<PathBuf, String> {
    if !location.root.is_absolute() || !location.path.is_absolute() || location.root.file_name().and_then(|name| name.to_str()) != Some("library") {
        return Err("原件位置无效".into());
    }
    if location.path.components().any(|part| matches!(part, std::path::Component::ParentDir | std::path::Component::CurDir)) { return Err("原件位置无效".into()); }
    let meta = std::fs::symlink_metadata(&location.path).map_err(|_| "原件不存在")?;
    if meta.file_type().is_symlink() || !meta.is_file() { return Err("原件不是普通文件".into()); }
    let root = location.root.canonicalize().map_err(|_| "资料库不可访问")?;
    let path = location.path.canonicalize().map_err(|_| "原件不存在")?;
    let folder = path.parent().filter(|folder| folder.parent() == Some(root.as_path()) && folder.file_name().and_then(|name| name.to_str()) == Some(item_id));
    if folder.is_none() { return Err("原件不在资料库里".into()); }
    readable_file(FileLocation { root, path })
}

fn valid_item_id(item_id: &str) -> bool {
    !item_id.is_empty() && item_id.len() <= 64 && item_id.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

async fn service_location(state: &ServiceConnection, url: impl FnOnce(&str) -> Result<tauri::Url, String>) -> Result<FileLocation, String> {
    let (base, token) = state.endpoint()?;
    let url = url(&base)?;
    let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(5)).build().map_err(|_| "无法连接文件服务")?;
    let mut response = client.get(url).bearer_auth(token).send().await.map_err(|_| "文件服务连接失败")?;
    if !response.status().is_success() { return Err("文件不可访问，请刷新后重试".into()); }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "无法读取文件位置")? {
        if body.len() + chunk.len() > 16384 { return Err("文件位置响应过大".into()); }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body).map_err(|_| "文件位置响应无效".into())
}

#[tauri::command]
pub async fn open_workspace_file(state: tauri::State<'_, ServiceConnection>, topic_id: String, task_id: String, path: String, scope: String) -> Result<(), String> {
    let location = service_location(&state, |base| {
        let mut url = tauri::Url::parse(&format!("{base}/lumen/files/location")).map_err(|_| "服务地址无效")?;
        url.query_pairs_mut().extend_pairs([("topicId", topic_id), ("taskId", task_id), ("path", path), ("scope", scope)]);
        Ok(url)
    }).await?;
    let file = readable_file(location)?;
    tauri::async_runtime::spawn_blocking(move || open_document(&file)).await.map_err(|_| "系统打开失败")?
}

/// 页面只给条目 id：服务按 id 查出原件真实路径，原生层再核对后交系统默认应用（PDF 即「预览」）
#[tauri::command]
pub async fn open_library_item(state: tauri::State<'_, ServiceConnection>, item_id: String) -> Result<(), String> {
    if !valid_item_id(&item_id) { return Err("资料条目无效".into()); }
    let id = item_id.clone();
    let location = service_location(&state, move |base| tauri::Url::parse(&format!("{base}/lumen/library/{id}/location")).map_err(|_| "服务地址无效".into())).await?;
    let file = library_file(&item_id, location)?;
    tauri::async_runtime::spawn_blocking(move || open_document(&file)).await.map_err(|_| "系统打开失败")?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn opener_rejects_escape_and_executable_files() {
        let root = std::env::temp_dir().join(format!("lumen-open-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("report.md"); std::fs::write(&path, "report").unwrap();
        assert!(readable_file(FileLocation { root: root.clone(), path }).is_ok());
        let script = root.join("run.command"); std::fs::write(&script, "echo no").unwrap();
        assert!(readable_file(FileLocation { root: root.clone(), path: script }).is_err());
        assert!(readable_file(FileLocation { root: root.join("nested"), path: root.join("report.md") }).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn library_opener_accepts_only_regular_files_inside_item_folder() {
        let base = std::env::temp_dir().join(format!("lumen-library-open-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let root = base.join("library"); let item = root.join("item-1");
        std::fs::create_dir_all(&item).unwrap();
        let pdf = item.join("paper.pdf"); std::fs::write(&pdf, "%PDF-").unwrap();
        let at = |path: PathBuf| FileLocation { root: root.clone(), path };
        assert_eq!(library_file("item-1", at(pdf.clone())).unwrap(), pdf.canonicalize().unwrap());
        // 条目 id 对不上、根不是 library/、含 ..
        assert!(library_file("item-2", at(pdf.clone())).is_err());
        assert!(library_file("item-1", FileLocation { root: item.clone(), path: pdf.clone() }).is_err());
        assert!(library_file("item-1", at(item.join("..").join("item-1").join("paper.pdf"))).is_err());
        // 库外文件、直接放在 library/ 下的文件、目录
        let outside = base.join("secret.pdf"); std::fs::write(&outside, "%PDF-").unwrap();
        assert!(library_file("item-1", at(outside.clone())).is_err());
        let loose = root.join("loose.pdf"); std::fs::write(&loose, "%PDF-").unwrap();
        assert!(library_file("library", FileLocation { root: root.clone(), path: loose }).is_err());
        std::fs::create_dir_all(item.join("folder.pdf")).unwrap();
        assert!(library_file("item-1", at(item.join("folder.pdf"))).is_err());
        // 符号链接：指向库外，或指向同一条目里的普通文件，都不跟
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&outside, item.join("link.pdf")).unwrap();
            assert!(library_file("item-1", at(item.join("link.pdf"))).is_err());
            std::os::unix::fs::symlink(&pdf, item.join("same.pdf")).unwrap();
            assert!(library_file("item-1", at(item.join("same.pdf"))).is_err());
        }
        assert!(valid_item_id("6c0e1f2a-0b4d-4f6e-9a51-3f0d2b7c9e10"));
        for bad in ["", "../catalog.sqlite", "a/b", "a%2Fb", "a b", &"x".repeat(65)] { assert!(!valid_item_id(bad), "{bad}"); }
        std::fs::remove_dir_all(base).unwrap();
    }
}
