/**
 * [INPUT]: the Tauri main window, the transparent desktop sprite window, the light/dark appearance, the window title, the UI language (locale::set_locale switches native titles with it), file/whole-skill picking, the controlled system open, external links, widget scripts and the Mastra service connection
 * [OUTPUT]: the main window's native lifecycle and explicit commands; desktop capability hidden by default with its placement/menu code kept; never owns the agent service process
 * [POS]: the thin native shell; the research lifecycle belongs to launchd/Mastra, and the window layer only decides display form and user file actions — the desktop sprite takes no service
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

/// Inline scripts for conversation widgets: the host registers them through invoke and the iframe pulls them from a lumenwidget:// src.
/// The parent CSP still has no unsafe-inline/eval; the scheme serves only registered bytes.
struct WidgetScripts {
    map: Mutex<HashMap<String, String>>,
    seq: AtomicU64,
}

// --- The app window follows the appearance mode; the system-wide theme is never touched ---
#[tauri::command]
fn set_window_theme(window: tauri::WebviewWindow, dark: bool) -> Result<(), String> {
    let theme = if dark { tauri::Theme::Dark } else { tauri::Theme::Light };
    window.set_theme(Some(theme)).map_err(|error| error.to_string())
}

// --- The window title follows the current topic (the name stays out of the center header, so windows are told apart by it) ---
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

/// Open http(s) in the system browser: WKWebView swallows window.open, so it cannot carry external links.
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
            open_external_url, widget_put_script, set_window_theme, set_window_title, locale::set_locale,
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
            // --- File drops go to the page's attachment entry; the native layer never intercepts OS drops ---
            // --- Transparent window + system material: the page shows through only where the theme declares transparency, solid areas stay as drawn ---
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
