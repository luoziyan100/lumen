/**
 * [INPUT]: sprite_model 的原生形态、主窗口唯一订阅投影、Tauri 窗口与本机位置文件
 * [OUTPUT]: 桌面精灵窗口、原生菜单、显示切换和带序号的单向状态投影
 * [POS]: 原生动作层；不读取服务身份、不创建 HTTP/SSE，系统通知由 sprite_macos 接入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
use crate::sprite_model::{self, Action, Event, Form, Model, Position, WorkArea};
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex, time::Duration};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WebviewWindowBuilder, WebviewUrl};
use tauri::menu::MenuBuilder;

pub const LABEL: &str = "sprite-desktop";
pub const WIDTH: f64 = 156.0;
pub const HEIGHT: f64 = 238.0;

#[derive(Clone, Copy, Default, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SpriteState { #[default] Idle, Running, Waiting, Speaking }

#[derive(Clone, Default, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Projection { state: SpriteState, sequence: u64, sent_at: u64 }

#[derive(Default)]
pub struct Runtime { inner: Mutex<Inner> }
#[derive(Default)]
struct Inner { model: Model, ready: bool, projection: Projection, generation: u64 }

pub fn diagnostic(app: &AppHandle, kind: &str, value: serde_json::Value) {
    #[cfg(debug_assertions)]
    if let Some(path) = std::env::var_os("LUMEN_SPRITE_LOG") {
        use std::io::Write;
        let line = serde_json::json!({"at": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis(), "kind": kind, "value": value});
        if let Ok(mut file) = std::fs::OpenOptions::new().append(true).create(true).open(path) {
            let _ = writeln!(file, "{line}");
        }
    }
    let _ = (app, kind, value);
}

fn desktop(app: &AppHandle) -> Option<WebviewWindow> { app.get_webview_window(LABEL) }

pub fn transition(app: &AppHandle, event: Event) {
    let (before, after, ready, generation) = {
        let runtime = app.state::<Runtime>();
        let mut inner = runtime.inner.lock().unwrap();
        let before = inner.model.form();
        let after = inner.model.apply(event);
        if before != after { inner.generation += 1; }
        (before, after, inner.ready, inner.generation)
    };
    if before == after { return; }
    diagnostic(app, "form", serde_json::json!({"event": format!("{event:?}"), "form": after}));
    let _ = app.emit_to("main", "sprite-main-visible", false);
    if after == Form::Desktop && ready {
        restore_position(app);
        if let Some(window) = desktop(app) {
            let _ = window.show();
            let _ = window.emit("sprite-presence", true);
        }
        return;
    }
    let visible = desktop(app).is_some_and(|w| w.is_visible().unwrap_or(false));
    if let Some(window) = desktop(app) { let _ = window.emit("sprite-presence", false); }
    if !visible {
        let _ = app.emit_to("main", "sprite-main-visible", after == Form::App);
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio_free_delay().await;
        let runtime = app.state::<Runtime>();
        let current = runtime.inner.lock().unwrap();
        if current.generation != generation { return; }
        if let Some(window) = desktop(&app) { let _ = window.hide(); }
        let _ = app.emit_to("main", "sprite-main-visible", current.model.form() == Form::App);
    });
}

async fn tokio_free_delay() {
    // 最长 180ms 淡出后再隐藏原生窗口；不占用 AppKit 主线程。
    let _ = tauri::async_runtime::spawn_blocking(|| std::thread::sleep(Duration::from_millis(200))).await;
}

pub fn open_main(app: &AppHandle, conversation: bool) {
    transition(app, Event::Main(true));
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if conversation { let _ = window.emit("sprite-open", ()); }
    }
}

pub fn exiting(app: &AppHandle) { transition(app, Event::Quit); }

pub fn menu_action(app: &AppHandle, id: &str) {
    if let Some(action) = sprite_model::menu_action(id) { perform(app, action); }
}

fn perform(app: &AppHandle, action: Action) {
    match action {
        Action::Open => open_main(app, true),
        Action::HideOnce => transition(app, Event::HideOnce),
        Action::Quit => { exiting(app); app.exit(0); }
    }
}

#[tauri::command]
pub fn sprite_action(app: AppHandle, action: Action) { perform(&app, action); }

#[tauri::command]
pub fn show_sprite_menu(window: WebviewWindow) -> Result<(), String> {
    if window.label() != LABEL { return Err("desktop window required".into()); }
    let menu = MenuBuilder::new(window.app_handle())
        .text("sprite-open", "打开 Lumen")
        .text("sprite-hide-once", "这次先藏起来")
        .text("sprite-quit", "退出 Lumen")
        .build().map_err(|error| error.to_string())?;
    window.popup_menu(&menu).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_desktop_sprite_enabled(window: WebviewWindow, enabled: bool) {
    if window.label() == "main" { transition(window.app_handle(), Event::Enabled(enabled)); }
}

#[tauri::command]
pub fn publish_sprite_state(window: WebviewWindow, state: SpriteState, sent_at: u64) -> Result<(), String> {
    if window.label() != "main" { return Err("main projection required".into()); }
    let app = window.app_handle();
    let projection = {
        let runtime = app.state::<Runtime>();
        let mut inner = runtime.inner.lock().unwrap();
        inner.projection = Projection { state, sequence: inner.projection.sequence + 1, sent_at };
        inner.projection.clone()
    };
    diagnostic(app, "project", serde_json::to_value(&projection).unwrap());
    app.emit_to(LABEL, "sprite-state", projection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn sprite_snapshot(app: AppHandle) -> Projection { app.state::<Runtime>().inner.lock().unwrap().projection.clone() }

#[cfg(debug_assertions)]
#[tauri::command]
pub fn sprite_received(window: WebviewWindow, sequence: u64, received_at: u64, detail: Option<String>) {
    if window.label() != LABEL { return; }
    diagnostic(window.app_handle(), "received", serde_json::json!({"sequence": sequence, "receivedAt": received_at, "detail": detail}));
}

#[tauri::command]
pub fn sprite_ready(window: WebviewWindow) {
    if window.label() != LABEL { return; }
    let app = window.app_handle();
    let form = {
        let runtime = app.state::<Runtime>();
        let mut inner = runtime.inner.lock().unwrap();
        inner.ready = true;
        inner.model.form()
    };
    if form == Form::Desktop {
        let _ = window.show();
        let _ = window.emit("sprite-presence", true);
    }
}

pub fn window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() == "main" {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window.hide();
            transition(window.app_handle(), Event::Main(false));
        }
    } else if window.label() == LABEL && matches!(event, tauri::WindowEvent::Moved(_)) {
        remember_position(window.app_handle());
    }
}

fn position_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = crate::mastra::isolated_root(app).unwrap_or_else(|| app.path().app_local_data_dir().unwrap()).join("desktop-ui");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("sprite-position.json"))
}

fn monitor_id(monitor: &tauri::Monitor) -> String { monitor.name().cloned().unwrap_or_else(|| format!("{:?}", monitor.position())) }

pub fn restore_position(app: &AppHandle) {
    let Some(window) = desktop(app) else { return; };
    let saved: Option<Position> = position_path(app).and_then(|path| std::fs::read(path).ok()).and_then(|raw| serde_json::from_slice(&raw).ok());
    let monitors = window.available_monitors().unwrap_or_default();
    let primary = window.primary_monitor().ok().flatten().map(|m| monitor_id(&m));
    let areas: Vec<_> = monitors.iter().map(|monitor| {
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let id = monitor_id(monitor);
        WorkArea { primary: primary.as_ref() == Some(&id), id,
            x: f64::from(area.position.x) / scale, y: f64::from(area.position.y) / scale,
            w: f64::from(area.size.width) / scale, h: f64::from(area.size.height) / scale }
    }).collect();
    if let Some(position) = sprite_model::position_in(saved.as_ref(), &areas, WIDTH, HEIGHT) {
        let _ = window.set_position(tauri::LogicalPosition::new(position.x, position.y));
    }
}

fn remember_position(app: &AppHandle) {
    let Some(window) = desktop(app) else { return; };
    let Ok(point) = window.outer_position() else { return; };
    let Ok(Some(monitor)) = window.current_monitor() else { return; };
    let logical = point.to_logical::<f64>(monitor.scale_factor());
    let position = Position { x: logical.x, y: logical.y, monitor: monitor_id(&monitor) };
    let Some(path) = position_path(app) else { return; };
    let temp = path.with_extension("tmp");
    if let Ok(bytes) = serde_json::to_vec(&position) {
        if std::fs::write(&temp, bytes).is_ok() { let _ = std::fs::rename(temp, path); }
    }
}

pub fn setup(app: &mut tauri::App) -> tauri::Result<()> {
    let builder = WebviewWindowBuilder::new(&*app, LABEL, WebviewUrl::App("index.html?sprite-desktop=1".into()))
        .title("Lumen 精灵").inner_size(WIDTH, HEIGHT)
        .resizable(false).decorations(false).transparent(true).always_on_top(true)
        .visible_on_all_workspaces(true).skip_taskbar(true).shadow(false)
        .focused(false).focusable(true).accept_first_mouse(true).visible(false)
        .initialization_script("document.documentElement.dataset.spriteDesktop = 'true'");
    isolate(builder, app.handle()).build()?;
    restore_position(app.handle());
    #[cfg(target_os = "macos")]
    crate::sprite_macos::observe(app.handle());
    Ok(())
}

pub fn isolate<'a, M: Manager<tauri::Wry>>(builder: WebviewWindowBuilder<'a, tauri::Wry, M>, app: &AppHandle) -> WebviewWindowBuilder<'a, tauri::Wry, M> {
    if let Some(root) = crate::mastra::isolated_root(app) {
        use std::hash::{Hash, Hasher};
        let mut a = std::collections::hash_map::DefaultHasher::new();
        root.hash(&mut a);
        let mut id = [0u8; 16];
        id[..8].copy_from_slice(&a.finish().to_be_bytes());
        "sprite-ui".hash(&mut a);
        id[8..].copy_from_slice(&a.finish().to_be_bytes());
        builder.data_store_identifier(id)
    } else { builder }
}
