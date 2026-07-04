# src-tauri/ — 原生薄外壳(Rust)

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;生命周期契约变更须与 agent-service 的 supervisor 对齐。

职责只有三件(刻意保持极薄,agent 大脑一概不在这里):
1. 起 agent-service sidecar(镜像 `agent-service/src/supervisor.ts` 的 portfile 契约);
2. 退出 app 时杀掉 sidecar(**关窗口不杀**——后台自治由此成立);
3. 渲染 UI(WebView 连 `ws://127.0.0.1:<port>`)。

## 成员

- `src/main.rs` — 上述三职责;`tauri.conf.json` / `build.rs` / `Cargo.toml` — 脚手架

## 状态与注意

- ⚠ 本目录尚未在本机工具链编译验证(无 Rust/Tauri toolchain);生命周期逻辑已由
  `agent-service/tests/service/supervisor.test.ts` 以真实子进程测试证明。
- dev 固定 `LUMEN_PORT=8787` 与前端默认 WS 对上;prod 打包需 bundle node + service,且注意 better-sqlite3 的 Node ABI 匹配。
