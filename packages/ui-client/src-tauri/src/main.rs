/**
 * [INPUT]: Tauri 主窗口、透明桌面精灵窗口、外观明暗、窗口标题、界面语言（locale::set_locale，原生标题随之切换）、文件/完整技能选择、受控系统打开、外链、widget脚本与Mastra服务连接
 * [OUTPUT]: 主窗口原生生命周期与显式命令；桌面能力默认隐藏，位置/菜单代码保留；不持有 Agent 服务进程
 * [POS]: 原生薄壳；研究生命周期归 launchd/Mastra，窗口层只判定显示形态与用户文件动作，桌面精灵不接服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
mod locale;
mod mastra;
mod files;
mod skills;
mod sprite;
mod sprite_model;
#[cfg(debug_assertions)]
#[path = "../../scripts/sprite/trace/native.rs"]
mod sprite_trace;
#[cfg(target_os = "macos")]
mod sprite_macos;

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

// --- 应用窗口沿用外观模式，不修改系统全局主题 ---
#[tauri::command]
fn set_window_theme(window: tauri::WebviewWindow, dark: bool) -> Result<(), String> {
    let theme = if dark { tauri::Theme::Dark } else { tauri::Theme::Light };
    window.set_theme(Some(theme)).map_err(|error| error.to_string())
}

// --- 窗口标题跟当前主题（主题名不写在中栏头部，切窗口时靠它认） ---
#[tauri::command]
fn set_window_title(window: tauri::WebviewWindow, title: String) -> Result<(), String> {
    let title: String = title.chars().take(120).collect();
    window.set_title(&title).map_err(|error| error.to_string())
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
        .set_title(locale::text(locale::Text::PickFolder))
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
        .manage(sprite::Runtime::default())
        .invoke_handler(tauri::generate_handler![
            pick_folder, open_external_url, widget_put_script, set_window_theme, set_window_title, locale::set_locale,
            sprite::sprite_snapshot, sprite::publish_sprite_state,
            #[cfg(debug_assertions)]
            sprite_trace::record_sprite_trace,
            sprite::set_desktop_sprite_enabled, sprite::sprite_ready, sprite::sprite_action, sprite::show_sprite_menu,
            mastra::refresh_mastra_connection, mastra::save_diagnostic_file, mastra::save_workspace_file,
            files::open_workspace_file, files::open_library_item, skills::pick_skill_package
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
            // --- 窗口透明 + 系统侧栏毛玻璃：网页只在主题声明透明的区域透出，实色区域外观不变 ---
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default());
            #[cfg(target_os = "macos")]
            let builder = builder
                .transparent(true)
                .effects(tauri::utils::config::WindowEffectsConfig {
                    effects: vec![tauri::window::Effect::Sidebar],
                    state: Some(tauri::window::EffectState::FollowsWindowActiveState),
                    radius: None,
                    color: None,
                })
                .initialization_script("document.documentElement.dataset.vibrancy = 'sidebar'");
            sprite::isolate(builder, app.handle())
                .title("Lumen")
                .inner_size(1160.0, 800.0)
                .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
                .min_inner_size(720.0, 480.0)
                .disable_drag_drop_handler()
                .on_navigation(mastra::trusted_origin)
                .initialization_script(&script)
                .build()?;
            sprite::setup(app)?;
            #[cfg(debug_assertions)]
            sprite_trace::window_inventory(app.handle());
            mastra::refresh(app.handle(), Duration::ZERO);
            Ok(())
        })
        .on_window_event(|window, event| {
            sprite::window_event(window, event);
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Focused(true)) {
                mastra::refresh(window.app_handle(), Duration::from_secs(2));
            }
        })
        .on_menu_event(|app, event| sprite::menu_action(app, event.id().as_ref()))
        .build(tauri::generate_context!())
        .expect("error building tauri app")
        .run(|app, event| {
            match event {
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { .. } => {
                    mastra::refresh(app, Duration::from_millis(500));
                    sprite::open_main(app, false);
                }
                tauri::RunEvent::ExitRequested { .. } => sprite::exiting(app),
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Exit => sprite_macos::stop(),
                _ => {}
            }
        });
}
