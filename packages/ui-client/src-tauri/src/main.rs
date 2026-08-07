// Lumen Tauri 薄外壳(M7 v0:本机可双击运行)。职责:
//   ① 探活 portfile;必要时补拉
//      - 已装 LaunchAgent:只等待 launchd KeepAlive,不 spawn、退出不杀
//      - 未装:临时 sidecar(开发兜底);聚焦/Reopen/前端 invoke 可补拉
//   ② 读 ~/.lumen/agent-service.json 注入 window.__LUMEN_WS__ / __LUMEN_TOKEN__
//   ③ Cmd+Q 只杀壳自己 spawn 的 Child(LaunchAgent 进程留给 launchd)
//   ④ macOS:红叉 = hide;Dock Reopen = show + ensure
//   ⑤ 首次启动若无 LaunchAgent → 自动 install(用户级 KeepAlive)
//
// v0 已知取舍:sidecar/LaunchAgent 仍用本机 node 跑 TS 源(LUMEN_NODE / LUMEN_SERVICE_DIR)

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::webview::PageLoadEvent;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const LAUNCH_AGENT_LABEL: &str = "com.lumen.agent-service";
const LAUNCH_AGENT_FILENAME: &str = "com.lumen.agent-service.plist";

struct Sidecar(Mutex<Option<Child>>);
struct EnsureGate(Mutex<Option<Instant>>);

#[tauri::command]
fn pick_folder() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("选择项目源文件夹")
        .pick_folder()
        .map(|p| p.to_string_lossy().into_owned())
}

/// 安装 Skill:选含 SKILL.md 的文件夹
#[tauri::command]
fn pick_skill_folder() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("选择 Skill 文件夹(须含 SKILL.md)")
        .pick_folder()
        .map(|p| p.to_string_lossy().into_owned())
}

/// 安装 Skill:选单个 SKILL.md
#[tauri::command]
fn pick_skill_file() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("选择 SKILL.md")
        .add_filter("Markdown", &["md"])
        .pick_file()
        .map(|p| p.to_string_lossy().into_owned())
}

/// 前端断线重连前:探活;无 LaunchAgent 时才临时 spawn
#[tauri::command]
fn ensure_agent_service(
    sidecar: tauri::State<'_, Sidecar>,
    gate: tauri::State<'_, EnsureGate>,
) -> bool {
    ensure_service_throttled(&sidecar, &gate, Duration::from_millis(400));
    wait_alive(40)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchdStatusDto {
    plist_installed: bool,
    portfile_alive: bool,
    port: Option<u16>,
    label: String,
}

#[tauri::command]
fn launchd_status() -> LaunchdStatusDto {
    let alive = portfile_alive();
    LaunchdStatusDto {
        plist_installed: launch_agent_installed(),
        portfile_alive: alive.is_some(),
        port: alive.map(|(p, _)| p),
        label: LAUNCH_AGENT_LABEL.into(),
    }
}

#[tauri::command]
fn launchd_install() -> Result<LaunchdStatusDto, String> {
    run_launchd_cli("install")?;
    let _ = wait_alive(40);
    Ok(launchd_status())
}

#[tauri::command]
fn launchd_uninstall() -> Result<LaunchdStatusDto, String> {
    run_launchd_cli("uninstall")?;
    Ok(launchd_status())
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default())
}

fn find_node() -> String {
    if let Ok(p) = std::env::var("LUMEN_NODE") {
        return p;
    }
    for c in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] {
        if std::path::Path::new(c).exists() {
            return c.into();
        }
    }
    "node".into()
}

fn service_dir() -> PathBuf {
    if let Ok(p) = std::env::var("LUMEN_SERVICE_DIR") {
        return PathBuf::from(p);
    }
    home().join("Workspace/Projects/lumen/packages/agent-service")
}

fn launch_agent_plist_path() -> PathBuf {
    home().join("Library/LaunchAgents").join(LAUNCH_AGENT_FILENAME)
}

fn launch_agent_installed() -> bool {
    launch_agent_plist_path().is_file()
}

fn run_launchd_cli(cmd: &str) -> Result<(), String> {
    let cli = service_dir().join("scripts/launchd-cli.ts");
    if !cli.is_file() {
        return Err(format!("找不到 launchd CLI: {}", cli.display()));
    }
    let out = Command::new(find_node())
        .arg("--experimental-strip-types")
        .arg(&cli)
        .arg(cmd)
        .current_dir(service_dir())
        .output()
        .map_err(|e| format!("无法执行 launchd CLI: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        return Err(format!(
            "launchd {cmd} 失败: {}",
            if !err.trim().is_empty() {
                err.trim()
            } else {
                stdout.trim()
            }
        ));
    }
    Ok(())
}

/// 首次打开:未装 LaunchAgent 则自动安装(用户级 KeepAlive)
fn ensure_launch_agent_once() {
    if launch_agent_installed() {
        return;
    }
    match run_launchd_cli("install") {
        Ok(()) => eprintln!("[lumen] 已自动安装 LaunchAgent {LAUNCH_AGENT_LABEL}"),
        Err(e) => eprintln!("[lumen] 自动安装 LaunchAgent 失败(仍可用临时 sidecar): {e}"),
    }
}

fn portfile_alive() -> Option<(u16, String)> {
    let data = std::fs::read_to_string(home().join(".lumen/agent-service.json")).ok()?;
    let v: serde_json::Value = serde_json::from_str(&data).ok()?;
    let port = v.get("port")?.as_u64()? as u16;
    let token = v.get("token")?.as_str()?.to_string();
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(300)).ok()?;
    Some((port, token))
}

fn spawn_service() -> std::io::Result<Child> {
    let dir = service_dir();
    Command::new(find_node())
        .arg("--experimental-strip-types")
        .arg(dir.join("src/service.ts"))
        .current_dir(&dir)
        .env("LUMEN_PORT", "8787")
        .spawn()
}

fn wait_alive(iters: u32) -> bool {
    for _ in 0..iters {
        if portfile_alive().is_some() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    false
}

/// TCP 不通时:有 LaunchAgent → 只等 launchd;无 → 临时 sidecar
fn ensure_service(sidecar: &Sidecar) {
    if portfile_alive().is_some() {
        return;
    }

    {
        let mut guard = sidecar.0.lock().unwrap();
        if let Some(child) = guard.as_mut() {
            match child.try_wait() {
                Ok(None) => return,
                Ok(Some(_)) | Err(_) => {
                    *guard = None;
                }
            }
        }
    }

    if portfile_alive().is_some() {
        return;
    }

    if launch_agent_installed() {
        eprintln!("[lumen] LaunchAgent 已装,等待 KeepAlive 拉起(不临时 spawn)");
        return;
    }

    match spawn_service() {
        Ok(child) => {
            eprintln!("[lumen] agent-service sidecar 已补拉");
            *sidecar.0.lock().unwrap() = Some(child);
        }
        Err(err) => eprintln!("[lumen] 无法启动 agent-service sidecar: {err}"),
    }
}

fn ensure_service_throttled(sidecar: &Sidecar, gate: &EnsureGate, min_gap: Duration) {
    {
        let mut last = gate.0.lock().unwrap();
        if let Some(t) = *last {
            if t.elapsed() < min_gap {
                return;
            }
        }
        *last = Some(Instant::now());
    }
    ensure_service(sidecar);
}

fn conn_script() -> Option<String> {
    let (port, token) = portfile_alive()?;
    Some(format!(
        "window.__LUMEN_WS__='ws://127.0.0.1:{port}';window.__LUMEN_TOKEN__={};",
        serde_json::to_string(&token).unwrap()
    ))
}

fn ensure_and_inject(webview: &tauri::Webview, sidecar: &Sidecar) {
    ensure_service(sidecar);
    let wait = if launch_agent_installed() { 48 } else { 32 };
    let _ = wait_alive(wait);
    if let Some(script) = conn_script() {
        let _ = webview.eval(&script);
    } else {
        eprintln!("[lumen] agent-service 未就绪:前端将显示未连接");
    }
}

fn kill_owned_sidecar(app: &tauri::AppHandle) {
    // 只杀壳自己 spawn 的;LaunchAgent 管的进程绝不杀
    if let Some(mut child) = app.state::<Sidecar>().0.lock().unwrap().take() {
        let _ = child.kill();
        eprintln!("[lumen] 已停止壳自有 sidecar(LaunchAgent 不受影响)");
    }
}

fn main() {
    tauri::Builder::default()
        .manage(Sidecar(Mutex::new(None)))
        .manage(EnsureGate(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            pick_folder,
            pick_skill_folder,
            pick_skill_file,
            ensure_agent_service,
            launchd_status,
            launchd_install,
            launchd_uninstall
        ])
        .on_page_load(|webview, payload| {
            if !matches!(payload.event(), PageLoadEvent::Started) {
                return;
            }
            let app = webview.app_handle().clone();
            let sidecar = app.state::<Sidecar>();
            ensure_and_inject(&webview, &sidecar);
        })
        .setup(|app| {
            ensure_launch_agent_once();
            {
                let sidecar = app.state::<Sidecar>();
                ensure_service(&sidecar);
            }
            let _ = wait_alive(if launch_agent_installed() { 48 } else { 32 });
            let script = conn_script().unwrap_or_else(|| {
                String::from("/* agent-service 未就绪:前端将显示未连接 */")
            });
            // 默认 Tauri 原生拖放会截走 OS 文件 drop,前端 HTML5 onDrop 永不触发;
            // 关掉后交给 ComposerCard 的 drag/drop(与 @ 选文件同路径)。
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Lumen")
                .inner_size(1080.0, 760.0)
                .min_inner_size(720.0, 480.0)
                .disable_drag_drop_handler()
                .initialization_script(&script)
                .build()?;
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                eprintln!("[lumen] 关窗 → hide(留 Dock;Cmd+Q 才退出)");
            }
            if let tauri::WindowEvent::Focused(true) = event {
                let app = window.app_handle();
                ensure_service_throttled(
                    app.state::<Sidecar>().inner(),
                    app.state::<EnsureGate>().inner(),
                    Duration::from_secs(2),
                );
                if portfile_alive().is_some() {
                    if let Some(script) = conn_script() {
                        if let Some(wv) = app.get_webview_window("main") {
                            let _ = wv.eval(&script);
                        }
                    }
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (window, event);
        })
        .build(tauri::generate_context!())
        .expect("error building tauri app")
        .run(|app_handle, event| {
            match event {
                tauri::RunEvent::ExitRequested { api, code, .. } => {
                    #[cfg(target_os = "macos")]
                    if code.is_none() {
                        api.prevent_exit();
                        eprintln!("[lumen] 拦截软退出(点 Dock 可回)");
                        return;
                    }
                    #[cfg(not(target_os = "macos"))]
                    let _ = api;

                    kill_owned_sidecar(&app_handle);
                }
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { has_visible_windows, .. } => {
                    {
                        ensure_service_throttled(
                            app_handle.state::<Sidecar>().inner(),
                            app_handle.state::<EnsureGate>().inner(),
                            Duration::from_millis(500),
                        );
                        let _ = wait_alive(24);
                    }
                    if !has_visible_windows {
                        if let Some(win) = app_handle.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.unminimize();
                            let _ = win.set_focus();
                        }
                    }
                    if let Some(script) = conn_script() {
                        if let Some(wv) = app_handle.get_webview_window("main") {
                            let _ = wv.eval(&script);
                        }
                    }
                }
                _ => {}
            }
        });
}
