# Lumen — 本机论文研究工作台

Mastra 1.67.0 + Memory 1.30.0 + LibSQL 1.23.0 + Hono + React 19 + Vite + Tauri 2

产物是可审阅的文件。Mastra 管执行、消息和恢复；Lumen 管项目、研究工具、材料边界与桌面交互。

```text
packages/
├── mastra-service/  # 唯一服务：原生 Controller/Agent/Memory 与研究领域
└── ui-client/       # 官方 HTTP/SSE 客户端与 Tauri 薄壳
doc/                 # 架构与设计决策，mastra/ 为当前运行架构
briefs/              # 实施记录与历史工作线
scripts/             # 开发进程组合；旧测试矩阵脚本只保留历史核查
```

- `package.json`：两个 workspace 与统一开发、类型、行为验证命令，Node 24 起。
- `package-lock.json`：精确依赖解析；框架升级须验证 Controller 与 processor 的实际行为。
- `AGENTS.md`：协作与分形文档约束。

## 运行边界

- `~/.lumen-mastra` 是正式数据根，`com.lumen.mastra` 是正式 LaunchAgent；旧 `~/.lumen` 保留为迁移来源，服务拒绝直接打开。
- 桌面默认发现新服务；缺服务可重试，任何失败都不回旧 WS。显式 `--mastra-data-root` 只选择独立根。
- 会话身份固定 `projectId:taskId`。原生 Memory 是消息真源，SSE 断线后补取持久历史。
- 项目和阅读游标在 `catalog.sqlite`；游标不改框架 thread 时间。设置/凭证只存私有文件，HTTP 只返回掩码。
- 主任务写自身目录；只读角色不能写；可写专家各有独立 `workers/` 子目录。箱内代码、合法专家委派和工作区技能安装默认自动执行；显式权限保留，Seatbelt 和网络白名单始终生效。
- 角色、资料与完整模型配置变更串行且与执行互斥；纯模型选择可在运行中保存，只对新对话生效，当前会话沿用启动时模型。停止先取消父子运行，再等待实际输出落盘，最后关闭存储。
- 主运行默认最多 100 步、1200 秒活动时间，问答/审批等待暂停计时。输入裁剪不删历史，模型可用 `read_history` 找回原文。

## 开发与交付

```sh
npm install
npm run dev          # 默认 ~/.lumen-mastra-dev；浏览器 localhost:5180
npm run typecheck
npm test
npm run verify       # 当前两包行为验证 + 主题合同
npm run tauri:build -w packages/ui-client
```

服务安装使用显式 Node/工程/数据根，见 `packages/mastra-service/scripts/CLAUDE.md`。正式常驻使用 launchd，禁止 nohup。桌面改动交付前必须重装并打开 `/Applications/Lumen.app`，以构建日志实际 bundle 路径为准并比对二进制摘要。

## 维护法则

- 源文件保留 INPUT/OUTPUT/POS；结构变化同步所在目录和父级 `CLAUDE.md`。
- UI 使用现有 Kumo 与 tokens，不引入第二套主题。PDF 固定 4.10.38，保留 WebKit 可用的资源配置。
- Node 直接运行 TypeScript，只使用可擦除语法；不引入 enum 或构造器参数属性。
- 不建立第二套调度、消息库或执行事件协议。领域算法可以独立，原生生命周期差异用有证据的窄适配修正。
- 测试经过实际 Controller、存储、文件和 HTTP；可控模型网络用来验证机制，不能冒充真实模型研究验收。
- 旧 WS/core/runtime 与旧测试已退役，原用户基线的删除前文件有逐项 SHA256 备份。历史设计文档不作为当前执行合同。

当前架构：`doc/mastra/architecture.md`；迁移状态与切换证据：`briefs/archive/mastra/plan.md`。正式切换和真实专家停止/继续/重启/修订证据见计划第9节；2026-09-20用户复核发现的输入菜单与工作目录恢复缺口单列第10节，不能以此前验收替代本次修正。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
