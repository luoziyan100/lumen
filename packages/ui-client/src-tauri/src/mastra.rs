/**
 * [INPUT]: 正式或显式数据根、私有 Mastra discovery、已注册 LaunchAgent 与 Tauri 生命周期
 * [OUTPUT]: ServiceConnection、可信页面连接注入、后台唤醒和用户选择的诊断/工作区文件保存
 * [POS]: 唯一服务发现边界；默认 ~/.lumen-mastra，隔离根只读，任何错误均不连接旧服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
use std::ffi::OsString;
use std::fs::{self, File, Metadata};
use std::io::Read;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;

const SERVICE_LABEL: &str = "com.lumen.mastra";
#[derive(Default)]
struct RefreshState { last: Option<Instant>, running: bool }
pub struct ServiceConnection {
    root: Result<PathBuf, String>,
    wake_installed: bool,
    refresh: Mutex<RefreshState>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Discovery { version: u32, engine: String, base_url: String, token: String }

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Connection {
    base_url: String,
    token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl ServiceConnection {
    pub(crate) fn endpoint(&self) -> Result<(String, String), String> {
        let connection = self.connection();
        if let Some(error) = connection.error { return Err(error); }
        Ok((connection.base_url, connection.token))
    }
    pub fn from_process() -> Self {
        Self::from_options(std::env::args_os().skip(1), std::env::var_os("LUMEN_MASTRA_HOME"), std::env::var_os("HOME"))
    }

    fn from_options(args: impl Iterator<Item = OsString>, fallback: Option<OsString>, home: Option<OsString>) -> Self {
        let mut args = args;
        let mut selected = fallback.map(PathBuf::from);
        while let Some(argument) = args.next() {
            if argument == "--mastra-data-root" {
                selected = match args.next() {
                    Some(value) if !value.to_string_lossy().starts_with("--") => Some(value.into()),
                    _ => return Self::new(Err("缺少 --mastra-data-root 的目录参数".into()), false),
                };
            } else if let Some(value) = argument.to_string_lossy().strip_prefix("--mastra-data-root=") {
                selected = Some(PathBuf::from(value));
            }
        }
        let wake_installed = selected.is_none();
        let root = selected.or_else(|| home.map(|value| PathBuf::from(value).join(".lumen-mastra")));
        let root = root.ok_or_else(|| "无法确定用户研究数据目录".into()).and_then(|value| {
            if value.is_absolute() { Ok(value) } else { Err("Mastra 数据根必须是绝对路径".into()) }
        });
        Self::new(root, wake_installed)
    }

    fn new(root: Result<PathBuf, String>, wake_installed: bool) -> Self {
        Self { root, wake_installed, refresh: Mutex::new(RefreshState::default()) }
    }

    fn connection(&self) -> Connection {
        let result = self.root.as_ref().map_err(Clone::clone).and_then(|root| read_discovery(root));
        match result {
            Ok(mut connection) => {
                if !endpoint_alive(&connection.base_url) {
                    connection.error = Some("研究服务暂未就绪。可点击重试重新发现服务。".into());
                }
                connection
            }
            Err(error) => Connection { base_url: String::new(), token: String::new(), error: Some(format!("无法连接研究服务：{error}")) },
        }
    }

    fn ready_connection(&self) -> Connection {
        let mut connection = self.connection();
        if connection.error.is_none() || !self.wake_installed || self.root.is_err() { return connection; }
        if let Err(error) = wake_installed_service() { connection.error = Some(error); return connection; }
        for _ in 0..20 {
            connection = self.connection();
            if connection.error.is_none() { return connection; }
            std::thread::sleep(Duration::from_millis(150));
        }
        connection.error = Some("研究服务已请求启动，但尚未就绪。请稍后重试；若持续失败，请检查 Mastra 服务日志。".into());
        connection
    }

    fn begin_refresh(&self, min_gap: Duration) -> bool {
        let mut state = self.refresh.lock().unwrap();
        if state.running || state.last.is_some_and(|last| last.elapsed() < min_gap) { return false; }
        *state = RefreshState { last: Some(Instant::now()), running: true };
        true
    }
}

fn connection_script(connection: &Connection) -> String {
    let serialized = serde_json::to_string(connection).expect("serializable connection");
    format!("(() => {{ if (window !== window.top) return; const c = {serialized}; window.__LUMEN_MASTRA__ = c; window.dispatchEvent(new CustomEvent('lumen-mastra-connection', {{ detail: c }})); }})();")
}

// --- 只唤醒已注册的正式服务；不安装、不重启、不管理进程 PID ---
#[cfg(target_os = "macos")]
fn wake_installed_service() -> Result<(), String> {
    use std::process::{Command, Stdio};
    extern "C" { fn geteuid() -> u32; }
    let target = format!("gui/{}/{SERVICE_LABEL}", unsafe { geteuid() });
    let invoke = |action: &str| Command::new("/bin/launchctl").args([action, &target]).stdout(Stdio::null()).stderr(Stdio::null()).status();
    if !invoke("print").is_ok_and(|status| status.success()) {
        return Err("Mastra 后台服务尚未注册。请完成服务安装后点击重试。".into());
    }
    if !invoke("kickstart").is_ok_and(|status| status.success()) {
        return Err("无法唤醒 Mastra 后台服务，请检查服务状态后重试。".into());
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn wake_installed_service() -> Result<(), String> {
    Err("请先启动此数据目录的 Mastra 服务，再点击重试。".into())
}

fn read_discovery(root: &Path) -> Result<Connection, String> {
    let directory = fs::symlink_metadata(root).map_err(|_| "找不到研究数据目录")?;
    if !directory.is_dir() || directory.file_type().is_symlink() { return Err("数据根必须是普通目录".into()); }
    check_permissions(&directory, true)?;
    let path = root.join("mastra-service.json");
    let before = fs::symlink_metadata(&path).map_err(|_| "未发现 mastra-service.json，请先启动新服务")?;
    if !before.is_file() || before.file_type().is_symlink() { return Err("服务发现文件不得为链接或特殊文件".into()); }
    check_permissions(&before, false)?;
    let file = File::open(path).map_err(|_| "无法打开服务发现文件")?;
    let opened = file.metadata().map_err(|_| "无法验证服务发现文件")?;
    check_permissions(&opened, false)?;
    if !same_file(&before, &opened) { return Err("服务发现文件在读取期间改变".into()); }
    let mut raw = String::new();
    file.take(8193).read_to_string(&mut raw).map_err(|_| "无法读取服务发现文件")?;
    if raw.len() > 8192 { return Err("服务发现文件过大".into()); }
    let discovery: Discovery = serde_json::from_str(&raw).map_err(|_| "服务发现文件格式无效")?;
    validate_discovery(discovery)
}

fn validate_discovery(discovery: Discovery) -> Result<Connection, String> {
    if discovery.version != 1 || discovery.engine != "mastra" { return Err("服务发现版本或引擎不匹配".into()); }
    let url = tauri::Url::parse(&discovery.base_url).map_err(|_| "服务地址无效")?;
    let valid_address = url.scheme() == "http" && url.host_str() == Some("127.0.0.1")
        && url.port().is_some_and(|port| port > 0) && url.username().is_empty() && url.password().is_none()
        && url.path() == "/" && url.query().is_none() && url.fragment().is_none();
    if !valid_address { return Err("服务地址必须是 http://127.0.0.1:<port>".into()); }
    if discovery.token.len() != 64 || !discovery.token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("服务令牌格式无效".into());
    }
    Ok(Connection { base_url: discovery.base_url.trim_end_matches('/').into(), token: discovery.token, error: None })
}

#[cfg(unix)]
fn check_permissions(metadata: &Metadata, directory: bool) -> Result<(), String> {
    use std::os::unix::fs::MetadataExt;
    extern "C" { fn geteuid() -> u32; }
    // 当前用户拥有 token，目录禁止其他用户写入，文件禁止其他用户读写。
    let forbidden = if directory { 0o022 } else { 0o077 };
    if metadata.uid() != unsafe { geteuid() } || metadata.mode() & forbidden != 0 {
        return Err("Mastra 目录或发现文件权限不安全（目录不可他人写入，文件需 0600）".into());
    }
    Ok(())
}

#[cfg(not(unix))]
fn check_permissions(_: &Metadata, _: bool) -> Result<(), String> {
    Err("当前平台尚未实现 Mastra 凭证文件权限验证".into())
}

#[cfg(unix)]
fn same_file(before: &Metadata, opened: &Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    before.dev() == opened.dev() && before.ino() == opened.ino()
}

#[cfg(not(unix))]
fn same_file(_: &Metadata, _: &Metadata) -> bool { false }

fn endpoint_alive(base_url: &str) -> bool {
    let Ok(url) = tauri::Url::parse(base_url) else { return false; };
    let Some(port) = url.port() else { return false; };
    TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], port)), Duration::from_millis(300)).is_ok()
}

pub fn trusted_origin(url: &tauri::Url) -> bool {
    match (url.scheme(), url.host_str(), url.port()) {
        ("tauri", Some("localhost"), None) => true,
        ("http" | "https", Some("tauri.localhost"), None) => true,
        ("http", Some("localhost" | "127.0.0.1"), Some(5180)) => cfg!(debug_assertions),
        _ => false,
    }
}

pub fn startup(app: &tauri::AppHandle) -> String {
    connection_script(&app.state::<ServiceConnection>().connection())
}

pub fn page_load(webview: &tauri::Webview, url: &tauri::Url) {
    if trusted_origin(url) {
        let connection = webview.app_handle().state::<ServiceConnection>().connection();
        let _ = webview.eval(&connection_script(&connection));
    }
}

pub fn refresh(app: &tauri::AppHandle, min_gap: Duration) {
    if !app.state::<ServiceConnection>().begin_refresh(min_gap) { return; }
    let app = app.clone();
    std::thread::spawn(move || {
        let state = app.state::<ServiceConnection>();
        let script = connection_script(&state.ready_connection());
        if let Some(window) = app.get_webview_window("main") {
            if window.url().is_ok_and(|url| trusted_origin(&url)) { let _ = window.eval(&script); }
        }
        state.refresh.lock().unwrap().running = false;
    });
}

#[tauri::command]
pub fn refresh_mastra_connection(app: tauri::AppHandle) {
    refresh(&app, Duration::ZERO);
}

// --- 保存命令只接受内容；目标路径只能来自原生对话框 ---
fn safe_name(name: &str, fallback: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(fallback);
    let mut clean: String = base.chars().filter(|value| !value.is_control() && *value != ':').collect();
    while clean.len() > 180 { clean.pop(); }
    if clean.trim().is_empty() || clean == "." || clean == ".." { fallback.into() } else { clean }
}

fn save_selected_file(name: &str, content: &[u8], json: bool) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new().set_title("保存到本机").set_file_name(name);
    if json { dialog = dialog.add_filter("JSON", &["json"]); }
    let Some(path) = dialog.save_file() else { return Ok(None); };
    fs::write(&path, content).map_err(|_| "无法保存文件，请检查目标目录权限")?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn save_diagnostic_file(name: String, content: String) -> Result<Option<String>, String> {
    if content.len() > 8 * 1024 * 1024 { return Err("诊断包超过 8 MiB".into()); }
    serde_json::from_str::<serde_json::Value>(&content).map_err(|_| "诊断 JSON 无效")?;
    let safe = safe_name(&name, "lumen-diagnostic.json");
    save_selected_file(if safe.ends_with(".json") { &safe } else { "lumen-diagnostic.json" }, content.as_bytes(), true)
}

fn decode_workspace_file(content: &str) -> Result<Vec<u8>, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    const LIMIT: usize = 25 * 1024 * 1024;
    if content.len() > LIMIT.div_ceil(3) * 4 { return Err("文件超过 25 MiB".into()); }
    let bytes = STANDARD.decode(content).map_err(|_| "文件编码无效")?;
    if bytes.len() > LIMIT { return Err("文件超过 25 MiB".into()); }
    Ok(bytes)
}

#[tauri::command]
pub fn save_workspace_file(name: String, content_base64: String) -> Result<Option<String>, String> {
    let bytes = decode_workspace_file(&content_base64)?;
    save_selected_file(&safe_name(&name, "lumen-file"), &bytes, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn discovery(url: &str) -> Discovery {
        Discovery { version: 1, engine: "mastra".into(), base_url: url.into(), token: "a".repeat(64) }
    }

    #[test]
    fn workspace_export_validates_binary_bounds_before_opening_a_dialog() {
        use base64::{engine::general_purpose::STANDARD, Engine};
        assert_eq!(decode_workspace_file("AAECgP8=").unwrap(), vec![0, 1, 2, 128, 255]);
        assert!(decode_workspace_file("not base64").is_err());
        assert!(decode_workspace_file(&"A".repeat((25 * 1024 * 1024_usize).div_ceil(3) * 4 + 1)).unwrap_err().contains("25 MiB"));
        let too_large = STANDARD.encode(vec![0; 25 * 1024 * 1024 + 1]);
        assert!(decode_workspace_file(&too_large).unwrap_err().contains("25 MiB"));
        assert_eq!(safe_name("../../notes.pdf", "file"), "notes.pdf");
        assert_eq!(safe_name("C:\\temp\\笔记.md", "file"), "笔记.md");
        assert_eq!(safe_name("..", "file"), "file");
        assert!(safe_name(&"资料".repeat(100), "file").len() <= 180);
    }

    #[test]
    fn default_root_and_explicit_roots_have_separate_wake_policy() {
        let default = ServiceConnection::from_options(Vec::new().into_iter(), None, Some("/Users/test".into()));
        assert_eq!(default.root.unwrap(), PathBuf::from("/Users/test/.lumen-mastra"));
        assert!(default.wake_installed);
        let explicit = ServiceConnection::from_options(vec!["--mastra-data-root=/tmp/selected".into()].into_iter(), Some("/tmp/fallback".into()), None);
        assert_eq!(explicit.root.unwrap(), PathBuf::from("/tmp/selected"));
        assert!(!explicit.wake_installed);
        let environment = ServiceConnection::from_options(Vec::new().into_iter(), Some("/tmp/preview".into()), None);
        assert_eq!(environment.root.unwrap(), PathBuf::from("/tmp/preview"));
        assert!(!environment.wake_installed);
    }

    #[test]
    fn invalid_selection_stays_unavailable_without_fallback() {
        let absent = ServiceConnection::from_options(vec!["--mastra-data-root".into()].into_iter(), None, Some("/Users/test".into()));
        assert!(absent.connection().error.unwrap().contains("缺少"));
        assert!(!absent.wake_installed);
        let relative = ServiceConnection::from_options(Vec::new().into_iter(), Some("relative".into()), Some("/Users/test".into()));
        assert!(relative.connection().error.unwrap().contains("绝对路径"));
        assert!(!relative.wake_installed);
        let no_home = ServiceConnection::from_options(Vec::new().into_iter(), None, None);
        assert!(no_home.connection().error.unwrap().contains("无法确定"));
    }

    #[test]
    fn discovery_accepts_only_versioned_authenticated_loopback_endpoints() {
        assert!(validate_discovery(discovery("http://127.0.0.1:12345")).is_ok());
        for url in ["https://127.0.0.1:12345", "http://localhost:12345", "http://evil.example:12345", "http://user@127.0.0.1:12345", "http://127.0.0.1:12345/path", "http://127.0.0.1:0"] {
            assert!(validate_discovery(discovery(url)).is_err(), "accepted {url}");
        }
        let mut short_token = discovery("http://127.0.0.1:12345");
        short_token.token = "secret".into();
        assert!(validate_discovery(short_token).is_err());
        let mut wrong_engine = discovery("http://127.0.0.1:12345");
        wrong_engine.engine = "legacy".into();
        assert!(validate_discovery(wrong_engine).is_err());
    }

    #[test]
    fn only_application_origins_receive_connection_credentials() {
        assert!(trusted_origin(&tauri::Url::parse("tauri://localhost/index.html").unwrap()));
        assert!(!trusted_origin(&tauri::Url::parse("https://example.com").unwrap()));
        assert!(!trusted_origin(&tauri::Url::parse("http://127.0.0.1:12345").unwrap()));
        assert!(!trusted_origin(&tauri::Url::parse("http://tauri.localhost:12345").unwrap()));
    }

    #[cfg(unix)]
    #[test]
    fn private_discovery_is_read_only_and_missing_service_stays_in_mastra_mode() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        use std::time::{SystemTime, UNIX_EPOCH};
        let root = std::env::temp_dir().join(format!("lumen-discovery-{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir(&root).unwrap();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
        let mode = ServiceConnection::new(Ok(root.clone()), false);
        assert!(mode.connection().error.unwrap().contains("未发现"));
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let base_url = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
        let file = root.join("mastra-service.json");
        let content = serde_json::json!({"version":1,"engine":"mastra","baseUrl":base_url,"token":"a".repeat(64)}).to_string();
        fs::write(&file, &content).unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o600)).unwrap();
        assert!(mode.connection().error.is_none());
        assert_eq!(fs::read_to_string(&file).unwrap(), content);
        drop(listener);
        assert!(mode.connection().error.unwrap().contains("暂未就绪"));
        fs::set_permissions(&file, fs::Permissions::from_mode(0o644)).unwrap();
        assert!(read_discovery(&root).err().unwrap().contains("权限"));
        fs::rename(&file, root.join("linked.json")).unwrap();
        symlink(root.join("linked.json"), &file).unwrap();
        assert!(read_discovery(&root).err().unwrap().contains("链接"));
        fs::remove_dir_all(root).unwrap();
    }
}
