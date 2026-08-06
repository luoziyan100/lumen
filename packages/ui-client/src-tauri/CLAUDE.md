# src-tauri/ — 原生薄外壳(Rust,M7 v0 已可双击)

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;生命周期契约变更须与 agent-service 的 supervisor 对齐。

职责(刻意保持极薄,agent 大脑一概不在这里);**壳连脑,launchd 养脑**:
1. 探活 portfile(TCP 真连);死了则——**已装 LaunchAgent 只等 KeepAlive**;未装才临时 sidecar;
2. 读 `~/.lumen/agent-service.json` 注入 `window.__LUMEN_WS__/__LUMEN_TOKEN__`;
3. **真正退出**(Cmd+Q)只杀壳自己 spawn 的 Child;**绝不杀** LaunchAgent 进程;
4. **macOS 关窗 ≠ 退出**:红叉 hide;Dock Reopen → ensure + show;
5. **首次启动**自动 `launchd install`(用户级);设置页可关常驻;
6. 前端 `ensure_agent_service` / `launchd_*` invoke 供断线自愈与开关。

## 成员

- `src/main.rs` — ensure / LaunchAgent 探测 / launchd_* / 注入 / Focused+Reopen;`disable_drag_drop_handler` 让前端 HTML5 文件拖放生效(与 Tauri 原生 drop 互斥)
- `tauri.conf.json` — `productName: Lumen`;窗口由代码创建;CSP 放行 127.0.0.1
- `Cargo.toml` — crate=`lumen-ui`,二进制=`Lumen`
- `icons/` / `build.rs`

## 构建与 M7.1 待办

- 构建:`npm run tauri:build` → `target/release/bundle/{macos/Lumen.app, dmg/*.dmg}`。
- M7.1:bundle node+service(分发级,注意 better-sqlite3 Node ABI);字体本地化。
