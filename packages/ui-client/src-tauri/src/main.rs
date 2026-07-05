// Lumen Tauri 薄外壳(M7 v0:本机可双击运行)。职责仅三件:
//   ① 起 agent-service sidecar(若 portfile 探活失败才拉起;已有活服务则直接连)
//   ② 读 ~/.lumen/agent-service.json 拿 {port, token},经 initialization_script
//      注入 window.__LUMEN_WS__ / __LUMEN_TOKEN__(打包态没有 vite 注入插件,这是唯一的门)
//   ③ 退出 app 时杀掉自己拉起的 sidecar(不是自己拉起的不动)
//
// v0 已知取舍(M7.1 再收):
//   - sidecar 用本机 node 跑 TS 源(node 路径按 LUMEN_NODE > homebrew > /usr/local 探测;
//     服务目录按 LUMEN_SERVICE_DIR > ~/Workspace/Projects/lumen/... 探测)——分发级打包需 bundle node+service。
//   - 关窗即退出并杀 sidecar;「关窗留 dock 续跑」需 tray/Reopen 常驻,留 M7.1。

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct Sidecar(Mutex<Option<Child>>);

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

/// portfile 存在且端口真能连上才算活着(防旧文件残留误判)
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

fn main() {
    tauri::Builder::default()
        .manage(Sidecar(Mutex::new(None)))
        .setup(|app| {
            if portfile_alive().is_none() {
                match spawn_service() {
                    Ok(child) => {
                        *app.state::<Sidecar>().0.lock().unwrap() = Some(child);
                    }
                    Err(err) => eprintln!("[lumen] 无法启动 agent-service sidecar: {err}"),
                }
            }
            // 等 portfile 就绪(最多 8s);拿不到也开窗,前端会明确提示连不上
            let mut conn: Option<(u16, String)> = None;
            for _ in 0..32 {
                if let Some(c) = portfile_alive() {
                    conn = Some(c);
                    break;
                }
                std::thread::sleep(Duration::from_millis(250));
            }
            let script = match &conn {
                Some((port, token)) => format!(
                    "window.__LUMEN_WS__='ws://127.0.0.1:{port}';window.__LUMEN_TOKEN__={};",
                    serde_json::to_string(token).unwrap()
                ),
                None => String::from("/* portfile 未就绪:前端将提示连不上 */"),
            };
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Lumen")
                .inner_size(1080.0, 760.0)
                .min_inner_size(720.0, 480.0)
                .initialization_script(&script)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri app")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(mut child) = app_handle.state::<Sidecar>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
