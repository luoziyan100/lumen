# agent-service — 无头 agent 大脑

> [PROTOCOL] 本包目录增删或职责变更时:先更新本文档与对应子目录 CLAUDE.md,再动代码;完成后自检根 CLAUDE.md 模块表。

职责:内核 + 工具 + 存储 + WS 服务,不依赖任何 WebView 即可端到端跑与测。架构蓝图:`doc/agent-core-architecture.md`(§ 号在各子目录文档中引用)。

## src/ 目录

| 目录 | 职责(详见各自 CLAUDE.md) |
|---|---|
| `core/` | agent 内核:唯一循环 runAgent,只增线程,端口注入,不认识外界 |
| `adapters/` | ModelPort 实现:Claude / OpenAI 兼容 / 录制-重放 / 重试 |
| `agents/` | 人格剧本(persona)与 worker 角色定义(roles) |
| `client/` | LumenClient:类型化 WS 客户端(Node 22+ 与浏览器通用) |
| `protocol/` | WS 协议:消息类型 + server(⚠ 与 ui-client 手工同步,见其文档) |
| `runtime/` | AgentRuntime:把内核/存储/工作区/角色拼成可执行、可订阅、可恢复的任务运行时 |
| `storage/` | SQLite(任务/事件/预算/恢复) + session jsonl + 设置 |
| `tools/` | L1 环境原语(env/) + L2 研究桥接(research/) |
| `workspace/` | FsWorkspace 沙箱文件系统 |

顶层文件:`service.ts`(createService 工厂 + headless main)、`supervisor.ts`(子进程拉起 + portfile 契约)。

## 纪律

- 运行时依赖极简(现仅 better-sqlite3 / unpdf / ws);新增依赖须在本文档记一行理由。
- 测试用 node:test,零框架;纪律见 `tests/CLAUDE.md`(禁全 mock、录制-重放、不变式、交叉矩阵)。
- API key 只走 `.env`(gitignored)与 SettingsStore,不入库不入代码。
