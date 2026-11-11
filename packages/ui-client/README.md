# @lumen/ui-client

Lumen 的研究工作台客户端：React 19 + Vite 浏览器入口，外加 Tauri 2 桌面薄壳。它不运行 agent，只通过官方 HTTP/SSE 接口连接本机的 `@lumen/mastra-service`；消息、运行状态和子任务都来自服务端的原生接口。

职责边界、目录地图和开发纪律以 [`CLAUDE.md`](CLAUDE.md) 为准，本文只说明怎么跑起来。

## 浏览器开发

在仓库根目录执行：

```bash
npm install
npm run dev   # 同时启动服务与 Vite；数据根默认 ~/.lumen-mastra-dev，浏览器打开 http://localhost:5180
```

`LUMEN_MASTRA_HOME=/绝对路径` 可以换成别的隔离数据根。开发模式不会碰正式数据根 `~/.lumen-mastra`。

## 验证

```bash
npm run typecheck -w @lumen/ui-client
npm test -w @lumen/ui-client        # 含真实 HTTP/SSE 客户端回归
npm run check:theme -w @lumen/ui-client
npm run build -w @lumen/ui-client
```

Node 回归不能证明 WebKit 中的交互正确；桌面改动交付前须构建、重装并打开 `/Applications/Lumen.app`，流程见仓库根 `AGENTS.md` 的交付闭环。

## 桌面应用

```bash
npm run tauri:build -w packages/ui-client
```

桌面壳默认从 `~/.lumen-mastra/mastra-service.json` 发现正式服务（由 launchd 的 `com.lumen.mastra` 常驻），不负责拉起服务。服务安装与重启见 `packages/mastra-service/scripts/CLAUDE.md`。
