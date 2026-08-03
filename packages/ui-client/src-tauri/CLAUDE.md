# src-tauri/ — 原生薄外壳(Rust,M7 v0 已可双击)

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;生命周期契约变更须与 agent-service 的 supervisor 对齐。

职责(刻意保持极薄,agent 大脑一概不在这里);**壳拥有脑**:
1. 探活 portfile(TCP 真连,防僵尸文件);死了就补拉 node sidecar——**启动 setup + 每次页面加载/Cmd+R 都会 ensure**;
2. 读 `~/.lumen/agent-service.json` 的 {port, token},经 initialization_script / page_load eval 注入
   `window.__LUMEN_WS__/__LUMEN_TOKEN__`(**打包态没有 vite 注入插件,这是前端过鉴权的唯一的门**);
3. **真正退出**(Cmd+Q / 菜单「退出 Lumen」)时杀掉**自己拉起的** sidecar(别人的不动);
4. **macOS 关窗 ≠ 退出**:红叉 `CloseRequested` → `prevent_close` + `hide`;Dock 点击 `RunEvent::Reopen` → `show`/`focus`(sidecar 续跑)。

## 成员

- `src/main.rs` — ensure_service / wait_alive / 注入 / macOS 关窗 hide+Reopen(node 路径按 LUMEN_NODE>homebrew>/usr/local;服务目录按 LUMEN_SERVICE_DIR>约定路径)
- `tauri.conf.json` — `productName: Lumen`(打包 `.app` 的显示名);窗口由代码创建(windows:[]);CSP 放行 127.0.0.1 的 ws/http、data: 图、字体 CDN
- `Cargo.toml` — crate=`lumen-ui`,二进制=`Lumen`(`tauri:dev` Dock 气泡跟二进制名走,勿改回 `lumen-ui`)
- `icons/` — 由 `tauri icon` 从 1024 青瓷图标生成;`build.rs` — 脚手架

## 构建与 M7.1 待办

- 构建:`npm run tauri:build` → `target/release/bundle/{macos/Lumen.app, dmg/*.dmg}`(target/ 不入库,Cargo.lock 入库)。
- M7.1:bundle node+service(分发级,注意 better-sqlite3 Node ABI);字体本地化(CSP 里的 CDN 白名单随之移除)。
