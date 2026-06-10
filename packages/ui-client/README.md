# @lumen/ui-client

Lumen 的 UI 客户端。**外壳是薄的**：它不承载 agent，只连接无头 agent-service（localhost WebSocket）渲染 LUI。

## 现状（诚实标注）

- ✅ **可作为浏览器 Web 客户端运行并验证**：`npm install && npm run dev`，先起 agent-service，UI 即可 submit 并看事件流。这一层（React LUI + WS 客户端 + 协议）是真实、可跑的。
- ✅ **进程生命周期已无头验证**：`agent-service/src/supervisor.ts` + `supervisor.test.ts` 证明了"service 作为独立子进程启动 → 写 portfile → 客户端连接 → 停止"。这是"关窗口 agent 照跑"的内核。
- 🟡 **Tauri 原生外壳已脚手架（`src-tauri/`）但未本机编译验证**（无 Rust/Tauri 工具链）。其 `main.rs` 的 sidecar 生命周期逻辑镜像已测通的 `supervisor.ts`；需 `npm i && npm run tauri:dev` 在装好工具链的机器上跑通。打包（bundle node + service）是后续。

## 跑起来（Web 客户端模式）

```bash
# 终端 1：起无头 agent-service（见 packages/agent-service）
ANTHROPIC_API_KEY=sk-... node --experimental-strip-types ../agent-service/src/service.ts
# 它会打印 ws 端口，并写 ~/.lumen/agent-service.json

# 终端 2：起 UI（把端口塞进 window.__LUMEN_WS__，或改 App.tsx 默认值）
npm install && npm run dev
```

## Tauri 原生外壳的落地契约（M7 剩余）

1. `src-tauri/` Rust main 启动时：以 **sidecar** 方式拉起 `agent-service`（`node --experimental-strip-types service.ts` 或打包后的二进制），并监督/重启。
2. service 把端口写进 `~/.lumen/agent-service.json`；Rust 读它，通过注入 `window.__LUMEN_WS__` 或命令告诉前端。
3. **关闭窗口 ≠ 退出**：窗口关到 tray/dock，sidecar 继续跑 → 后台自治成立。完全退出 app 时再杀 sidecar。
4. 文件对话框（导入 PDF）、PDF 渲染（pdf.js v4）留在外壳侧。

## 结构

```
src/
  agent-client.ts   # 浏览器 WS 客户端 + 协议类型（正式版从 @lumen/shared 导入）
  useAgent.ts       # React hook：事件流 → LUI 消息
  App.tsx           # 主屏 = 聊天（user/assistant/error 气泡 + 输入框）
  styles.css        # 占位，待接 Lumen_Design_System CSS 变量
```
