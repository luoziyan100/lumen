/**
 * [INPUT]: 调试构建、显式 LUMEN_SPRITE_TRACE 输出路径与测试注入脚本
 * [OUTPUT]: 只在 debug_assertions 下编译的真实WebView清单、主窗投影与桌面DOM提交时延
 * [POS]: 仓库验收代码；原生主窗命令记录起点，桌面初始化脚本记录终点，正式构建不编译此模块或命令
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
use std::io::Write;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

pub fn window_inventory(app: &tauri::AppHandle) {
    let labels: Vec<_> = app.webview_windows().into_keys().collect();
    append(serde_json::json!({"kind": "windows", "labels": labels}));
}

pub fn projected(state: crate::sprite::SpriteState) {
    let at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis();
    append(serde_json::json!({"window": "main", "kind": "projected", "state": state, "at": at}));
}

pub fn instrument<'a, M: Manager<tauri::Wry>>(builder: WebviewWindowBuilder<'a, tauri::Wry, M>) -> WebviewWindowBuilder<'a, tauri::Wry, M> {
    if std::env::var_os("LUMEN_SPRITE_TRACE").is_some() {
        builder.initialization_script(include_str!("inject.js"))
    } else { builder }
}

#[tauri::command]
pub fn record_sprite_trace(window: WebviewWindow, kind: String, state: String, at: u64) {
    append(serde_json::json!({"window": window.label(), "kind": kind, "state": state, "at": at}));
}

fn append(row: serde_json::Value) {
    let Some(path) = std::env::var_os("LUMEN_SPRITE_TRACE") else { return; };
    if let Ok(mut file) = std::fs::OpenOptions::new().append(true).create(true).open(path) {
        let _ = writeln!(file, "{row}");
    }
}
