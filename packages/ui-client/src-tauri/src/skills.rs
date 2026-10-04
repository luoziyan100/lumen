/**
 * [INPUT]: 用户通过原生对话框选中的技能目录或 Markdown 文件
 * [OUTPUT]: pick_skill_package：有限目录包的相对路径、字节和脚本执行位
 * [POS]: 页面没有任意磁盘读取能力；只读取显式选择，拒绝链接与越界，安装交给服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use base64::{engine::general_purpose::STANDARD, Engine};

const LIMIT: usize = 32 * 1024 * 1024;
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageFile { path: String, content_base64: String, executable: bool, directory: bool }

fn read_file(file: &Path, relative: String, remaining: usize) -> Result<(PackageFile, usize), String> {
    let before = fs::symlink_metadata(file).map_err(|_| "无法读取技能文件")?;
    if !before.is_file() || before.file_type().is_symlink() { return Err("技能包不得包含链接或特殊文件".into()); }
    if before.len() > remaining as u64 { return Err("技能包超过 32 MiB".into()); }
    let opened = File::open(file).map_err(|_| "无法打开技能文件")?;
    let metadata = opened.metadata().map_err(|_| "无法核对技能文件")?;
    #[cfg(unix)]
    let executable = {
        use std::os::unix::fs::MetadataExt;
        if before.ino() != metadata.ino() || before.dev() != metadata.dev() { return Err("技能文件在读取期间发生变化".into()); }
        metadata.mode() & 0o100 != 0
    };
    #[cfg(not(unix))]
    let executable = false;
    let mut bytes = Vec::new();
    opened.take((remaining + 1) as u64).read_to_end(&mut bytes).map_err(|_| "技能文件读取失败")?;
    if bytes.len() > remaining { return Err("技能包超过 32 MiB".into()); }
    let size = bytes.len();
    Ok((PackageFile { path: relative, content_base64: STANDARD.encode(bytes), executable, directory: false }, size))
}

fn walk(root: &Path, path: &Path, name: &str, depth: usize, files: &mut Vec<PackageFile>, bytes: &mut usize, entries: &mut usize) -> Result<(), String> {
    *entries += 1;
    if *entries > 4096 || depth > 32 { return Err("技能包目录规模超过上限".into()); }
    let stat = fs::symlink_metadata(path).map_err(|_| "无法读取技能目录")?;
    if stat.file_type().is_symlink() || !path.canonicalize().map_err(|_| "技能路径不可访问")?.starts_with(root) { return Err("技能包不得包含链接或越界路径".into()); }
    if stat.is_dir() {
        if path != root {
            let relative = path.strip_prefix(root).map_err(|_| "技能目录路径越界")?.to_str().ok_or("技能目录名需为 UTF-8")?;
            files.push(PackageFile { path: format!("{name}/{relative}"), content_base64: String::new(), executable: false, directory: true });
        }
        for entry in fs::read_dir(path).map_err(|_| "无法列举技能目录")? {
            let entry = entry.map_err(|_| "无法读取技能目录项")?;
            walk(root, &entry.path(), name, depth + 1, files, bytes, entries)?;
        }
        return Ok(());
    }
    let relative = path.strip_prefix(root).map_err(|_| "技能文件路径越界")?.to_str().ok_or("技能文件名需为 UTF-8")?;
    let (file, size) = read_file(path, format!("{name}/{relative}"), LIMIT - *bytes)?;
    *bytes += size; files.push(file);
    Ok(())
}

#[tauri::command]
pub fn pick_skill_package(directory: bool) -> Result<Option<Vec<PackageFile>>, String> {
    let dialog = rfd::FileDialog::new().set_title(if directory { "选择包含 SKILL.md 的技能文件夹" } else { "选择技能 Markdown" });
    let selected = if directory { dialog.pick_folder() } else { dialog.add_filter("Markdown", &["md"]).pick_file() };
    let Some(selected) = selected else { return Ok(None); };
    if directory {
        if fs::symlink_metadata(&selected).map_err(|_| "技能目录不可访问")?.file_type().is_symlink() { return Err("请选择普通技能目录".into()); }
        let root = selected.canonicalize().map_err(|_| "技能目录不可访问")?;
        let name = root.file_name().and_then(|value| value.to_str()).ok_or("技能目录名无效")?;
        if !root.join("SKILL.md").is_file() { return Err("技能目录根部缺少 SKILL.md".into()); }
        let mut files = Vec::new();
        walk(&root, &root, name, 0, &mut files, &mut 0, &mut 0)?;
        return Ok(Some(files));
    }
    let name = selected.file_stem().and_then(|value| value.to_str()).ok_or("技能文件名无效")?;
    let name = if name.eq_ignore_ascii_case("skill") { selected.parent().and_then(Path::file_name).and_then(|value| value.to_str()).unwrap_or("local-skill") } else { name };
    Ok(Some(vec![read_file(&selected, format!("{name}/SKILL.md"), LIMIT)?.0]))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::{symlink, PermissionsExt};
    #[test]
    fn selected_package_keeps_nested_binary_resources_and_rejects_links() {
        let root = std::env::temp_dir().join(format!("lumen-skills-{}", std::process::id()));
        fs::create_dir_all(root.join("scripts")).unwrap();
        fs::create_dir_all(root.join("empty-output")).unwrap();
        fs::write(root.join("SKILL.md"), "# Complete skill").unwrap();
        fs::write(root.join("scripts/run.py"), "print(1)").unwrap();
        fs::set_permissions(root.join("scripts/run.py"), fs::Permissions::from_mode(0o700)).unwrap();
        fs::write(root.join("source.bin"), [0, 128, 255]).unwrap();
        let root = root.canonicalize().unwrap();
        let mut files = Vec::new();
        walk(&root, &root, "research", 0, &mut files, &mut 0, &mut 0).unwrap();
        assert_eq!(files.len(), 5);
        assert!(files.iter().any(|file| file.path == "research/empty-output" && file.directory));
        assert!(files.iter().any(|file| file.path == "research/scripts/run.py" && file.executable));
        let binary = files.iter().find(|file| file.path == "research/source.bin").unwrap();
        assert_eq!(STANDARD.decode(&binary.content_base64).unwrap(), [0, 128, 255]);
        symlink("/etc/passwd", root.join("escaped.md")).unwrap();
        assert!(walk(&root, &root, "research", 0, &mut Vec::new(), &mut 0, &mut 0).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
