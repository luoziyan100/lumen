/**
 * [INPUT]: 私有服务发现、已授权文件位置接口、系统默认文档应用
 * [OUTPUT]: open_workspace_file：按项目/会话/范围打开真实文件并保留相对资源
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

#[tauri::command]
pub async fn open_workspace_file(state: tauri::State<'_, ServiceConnection>, project_id: String, task_id: String, path: String, scope: String) -> Result<(), String> {
    let (base, token) = state.endpoint()?;
    let mut url = tauri::Url::parse(&format!("{base}/lumen/files/location")).map_err(|_| "服务地址无效")?;
    url.query_pairs_mut().extend_pairs([("projectId", project_id), ("taskId", task_id), ("path", path), ("scope", scope)]);
    let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(5)).build().map_err(|_| "无法连接文件服务")?;
    let mut response = client.get(url).bearer_auth(token).send().await.map_err(|_| "文件服务连接失败")?;
    if !response.status().is_success() { return Err("文件不可访问，请刷新工作区后重试".into()); }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "无法读取文件位置")? {
        if body.len() + chunk.len() > 16384 { return Err("文件位置响应过大".into()); }
        body.extend_from_slice(&chunk);
    }
    let location = serde_json::from_slice(&body).map_err(|_| "文件位置响应无效")?;
    let file = readable_file(location)?;
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
}
