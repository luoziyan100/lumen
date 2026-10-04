/**
 * [INPUT]: Tauri 窗口、文件/完整技能选择、受控系统打开、外链、widget脚本与Mastra服务连接
 * [OUTPUT]: 唯一桌面窗口和显式原生命令，不持有 Agent 服务进程
 * [POS]: 原生薄壳；研究生命周期归 launchd/Mastra，窗口只负责发现、展示和用户文件动作
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
mod mastra;
mod files;
mod skills;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::webview::PageLoadEvent;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// 对话 widget 内联脚本:宿主 invoke 登记,iframe 用 lumenwidget:// 当 src 拉。
/// 父 CSP 仍无 unsafe-inline/eval;scheme 只吐登记过的字节。
struct WidgetScripts {
    map: Mutex<HashMap<String, String>>,
    seq: AtomicU64,
}

#[tauri::command]
fn widget_put_script(code: String, store: tauri::State<WidgetScripts>) -> Result<String, String> {
    if code.len() > 256 * 1024 {
        return Err("script too large".into());
    }
    let id = store.seq.fetch_add(1, Ordering::Relaxed).to_string();
    let mut map = store.map.lock().unwrap();
    if map.len() >= 64 {
        if let Some(old) = map.keys().next().cloned() {
            map.remove(&old);
        }
    }
    map.insert(id.clone(), code);
    Ok(id)
}

#[tauri::command]
fn pick_folder() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("选择项目源文件夹")
        .pick_folder()
        .map(|p| p.to_string_lossy().into_owned())
}

/// 用系统默认浏览器打开 http(s)。WKWebView 的 window.open 会被吞掉,不能当外链。
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let url = url.trim();
    if url.contains('\n') || url.contains('\r') || url.contains('\0') {
        return Err("invalid url".into());
    }
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("only http(s)".into());
    }
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .arg(url)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(format!("open failed: {status}"));
        }
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        let status = std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(format!("open failed: {status}"));
        }
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        let status = std::process::Command::new("xdg-open")
            .arg(url)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(format!("open failed: {status}"));
        }
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("unsupported platform".into())
}

fn main() {
    tauri::Builder::default()
        .manage(mastra::ServiceConnection::from_process())
        .manage(WidgetScripts { map: Mutex::new(HashMap::new()), seq: AtomicU64::new(1) })
        .invoke_handler(tauri::generate_handler![
            pick_folder, open_external_url, widget_put_script,
            mastra::refresh_mastra_connection, mastra::save_diagnostic_file, mastra::save_workspace_file,
            files::open_workspace_file, skills::pick_skill_package
        ])
        .register_uri_scheme_protocol("lumenwidget", |ctx, request| {
            let path = request.uri().path().trim_start_matches('/');
            let id = path.strip_suffix(".js").unwrap_or(path);
            let store = ctx.app_handle().state::<WidgetScripts>();
            let body = store.map.lock().unwrap().get(id).cloned();
            match body {
                Some(code) => tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", "text/javascript; charset=utf-8")
                    .header("Cache-Control", "no-store")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(code.into_bytes())
                    .unwrap(),
                None => tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap(),
            }
        })
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), PageLoadEvent::Started) { mastra::page_load(&webview, payload.url()); }
        })
        .setup(|app| {
            let script = mastra::startup(app.handle());
            // --- 文件拖放交给网页附件入口；原生层不截留 OS drop ---
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Lumen")
                .inner_size(1160.0, 800.0)
                .min_inner_size(720.0, 480.0)
                .disable_drag_drop_handler()
                .on_navigation(mastra::trusted_origin)
                .initialization_script(&script)
                .build()?;
            mastra::refresh(app.handle(), Duration::ZERO);
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
            if let tauri::WindowEvent::Focused(true) = event {
                mastra::refresh(window.app_handle(), Duration::from_secs(2));
            }
        })
        .build(tauri::generate_context!())
        .expect("error building tauri app")
        .run(|app, event| {
            match event {
                #[cfg(target_os = "macos")]
                tauri::RunEvent::ExitRequested { api, code: None, .. } => api.prevent_exit(),
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { has_visible_windows, .. } => {
                    mastra::refresh(app, Duration::from_millis(500));
                    if !has_visible_windows {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                }
                _ => {}
            }
        });
}
