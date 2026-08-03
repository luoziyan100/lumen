// Lumen Tauri 薄外壳(M7 v0:本机可双击运行)。职责:
//   ① 壳拥有脑:探活 portfile;死了就补拉 node sidecar(启动 + 每次页面加载/reload)
//   ② 读 ~/.lumen/agent-service.json 注入 window.__LUMEN_WS__ / __LUMEN_TOKEN__
//   ③ 真正退出(Cmd+Q / 菜单退出)时杀掉自己拉起的 sidecar(别人起的不动)
//   ④ macOS:红叉关窗 = hide,进程与 sidecar 留在 Dock;点 Dock 再 show(RunEvent::Reopen)
//
// v0 已知取舍(M7.1 再收):
//   - sidecar 用本机 node 跑 TS 源(LUMEN_NODE / LUMEN_SERVICE_DIR 可覆写)

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::webview::PageLoadEvent;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct Sidecar(Mutex<Option<Child>>);

/// 选本机文件夹(新建项目可选源目录);取消返回 null
#[tauri::command]
fn pick_folder() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("选择项目源文件夹")
        .pick_folder()
        .map(|p| p.to_string_lossy().into_owned())
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

/// portfile 存在且端口真能连上才算活着(防僵尸 portfile 误判)
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

/// 壳拥有脑:TCP 不通则补拉。若仍持有已退出的 Child 先收尸;若 Child 还在跑则只等待。
fn ensure_service(sidecar: &Sidecar) {
    if portfile_alive().is_some() {
        return;
    }

    {
        let mut guard = sidecar.0.lock().unwrap();
        if let Some(child) = guard.as_mut() {
            match child.try_wait() {
                Ok(None) => {
                    // 子进程还在起,交给 wait_alive
                    return;
                }
                Ok(Some(_)) | Err(_) => {
                    *guard = None;
                }
            }
        }
    }

    if portfile_alive().is_some() {
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

fn conn_script() -> Option<String> {
    let (port, token) = portfile_alive()?;
    Some(format!(
        "window.__LUMEN_WS__='ws://127.0.0.1:{port}';window.__LUMEN_TOKEN__={};",
        serde_json::to_string(&token).unwrap()
    ))
}

fn ensure_and_inject(webview: &tauri::Webview, sidecar: &Sidecar) {
    ensure_service(sidecar);
    let _ = wait_alive(32);
    if let Some(script) = conn_script() {
        let _ = webview.eval(&script);
    } else {
        eprintln!("[lumen] agent-service 未就绪:前端将显示未连接");
    }
}

fn kill_owned_sidecar(app: &tauri::AppHandle) {
    if let Some(mut child) = app.state::<Sidecar>().0.lock().unwrap().take() {
        let _ = child.kill();
    }
}

fn main() {
    tauri::Builder::default()
        .manage(Sidecar(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![pick_folder])
        // 每次页面加载(含 Cmd+R):探活 → 必要时补拉 → 再注入 WS
        .on_page_load(|webview, payload| {
            if !matches!(payload.event(), PageLoadEvent::Started) {
                return;
            }
            let app = webview.app_handle().clone();
            let sidecar = app.state::<Sidecar>();
            ensure_and_inject(&webview, &sidecar);
        })
        .setup(|app| {
            {
                let sidecar = app.state::<Sidecar>();
                ensure_service(&sidecar);
            }
            let _ = wait_alive(32);
            let script = conn_script().unwrap_or_else(|| {
                String::from("/* agent-service 未就绪:前端将显示未连接 */")
            });
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Lumen")
                .inner_size(1080.0, 760.0)
                .min_inner_size(720.0, 480.0)
                .initialization_script(&script)
                .build()?;
            Ok(())
        })
        // macOS:红叉不销毁窗口,只 hide——agent sidecar 继续跑
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                eprintln!("[lumen] 关窗 → hide(留 Dock;Cmd+Q 才退出)");
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (window, event);
        })
        .build(tauri::generate_context!())
        .expect("error building tauri app")
        .run(|app_handle, event| {
            match event {
                // code=None:关窗/软退出;code=Some:AppHandle.exit(Cmd+Q)——后者 ignore prevent_exit
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
                    if !has_visible_windows {
                        if let Some(win) = app_handle.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.unminimize();
                            let _ = win.set_focus();
                        }
                    }
                }
                _ => {}
            }
        });
}
