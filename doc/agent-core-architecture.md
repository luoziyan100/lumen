# Lumen 架构

> 本文描述当前实现。系统由两个包组成:`agent-service`(无头 Node 服务)与 `ui-client`(React 薄客户端,运行于浏览器或 Tauri 原生壳),二者以 WebSocket + JSON 通信。

## 总览

```
┌─ macOS 原生壳(Tauri)─── 或 ─── 浏览器 ─────┐
│  ui-client · React + Vite                    │
│  三栏:会话列表 / 对话 / 工作区+阅读器       │
└───────────────┬──────────────────────────────┘
                │ WebSocket(JSON · LumenClient)
┌───────────────┴──────────────────────────────┐
│  agent-service · Node                        │
│                                              │
│  protocol/   WS 服务:任务·事件订阅·资产·设置 │
│  runtime/    任务生命周期:建线程→跑内核→发事件│
│  core/       agent 内核:循环·线程·工具·预算  │
│  agents/     系统提示词与 worker 角色         │
│  tools/      研究工具 + 环境工具              │
│  adapters/   模型适配:Anthropic / OpenAI 兼容 │
│  storage/    SQLite 事件溯源·设置·用量计量    │
│  workspace/  项目工作区(真实文件系统)       │
└───────────────┬──────────────────────────────┘
                │ HTTPS
      DeepSeek / Claude / 任意 OpenAI 兼容端点
```

## 内核(core/)

一条铁律贯穿全部设计:**agent 是一条只增不减的消息线程上的循环;每个 tool_call 的结果必须回灌同一条线程**——模型每一轮都看见自己行为的后果,任何动作都不会"凭空消失"。

- **`thread.ts` · Thread** — 状态载体。`append` 是唯一写入口;`forModel()` 产出给模型的视图:超长的老 `tool_result` 内容折叠为占位符,但保留该消息的存在(工具确实执行过),最近 N 条豁免。生产默认:单条超 8000 字符折叠、豁免最近 6 条。
- **`loop.ts` · runAgent** — 唯一的循环。模型走一步 → 顺序执行其 tool_calls → 结果逐条回灌线程 → 下一轮把最新线程喂回模型。模型不再调用工具即为回复,状态 `done`;超步数/超时 `exhausted`;取消 `aborted`;模型层错误 `error`。工具抛错不打断循环——错误文本作为 tool_result 回灌,模型自行恢复。
- **`spawn.ts`** — sub-agent 是对 runAgent 的递归调用(同一内核)。worker 在自己的子线程里干活,父线程只收它的最终回复。
- **`limits.ts`** — 预算原语:maxSteps(默认 30)/ maxDepth(默认 3)/ 可选墙钟秒数。
- **`model-port.ts` · ModelPort** — 内核对模型的全部认知:`chat(messages, tools, signal)`,提供商细节到不了内核。
- **`guard.ts` · withGuard** — 工具派发的横切守卫:统一超时兜底 + 遥测钩子。
- **`tool.ts`** — Tool 接口:`spec`(名字/描述/参数 schema)+ `run(args, ctx, signal) → { llmContent }`。

## 工具(tools/)

- **研究**:`extract_pdf`(PDF → 文本,产物进会话 `cache/`)、`search_papers` / `get_citations`(OpenAlex 检索与引文,期刊分级参与排序)、`search_web`、`fetch_url`
- **环境**:`read_file` / `write_file` / `edit_file` / `list_dir` / `grep` / `glob`(全部限定在工作区内)、`run_code`(沙箱执行)
- **记忆**:`read_memory` / `write_memory` —— 项目级跨会话记忆:`memory/` 目录一条事实一个文件 + `MEMORY.md` 索引开局注入系统提示词;对用户完全透明

约定:工具结果一律回灌线程;长交付物(报告、笔记)写成工作区文件,对话里只留指针。

## 运行时(runtime/)

`agent-runtime.ts` 管任务生命周期:

- `create_task` 建**草稿任务**:有会话、未起跑(支持先上传文件再开聊)
- `submit` 起跑:系统提示词 + 用户消息构成初始线程,进内核循环
- `continue` 续跑:从事件表重建线程(见存储层)后追加新消息继续
- 内核发出的每个事件(model_step / tool_call / tool_result / reply / status_change / error)都持久化并广播给订阅的客户端
- 资产视图:项目工作区文件列表,过滤 `cache/` 与 `sessions/`,只展示用户要的交付物

## 存储(storage/)

**事件溯源**是持久化的根:

- `db.ts` / `task-store.ts` — SQLite(`~/.lumen/lumen.sqlite`):`tasks` 与 `task_events`(按 seq 有序的全量事件)
- `resume.ts` · rebuildThread — 从事件重建可续跑线程,悬空 tool_call 自动修复;任何会话任意时刻可恢复
- `settings.ts` — 模型 profiles(provider / baseUrl / model / apiKey),界面内增改切换
- `budget.ts` — 基于事件的用量计量(token usage 随 model_step 入库)
- `session-file.ts` — 每会话 append-only JSONL trace,便于人工检查
- `evidence-index.ts` — 工作区产物之上的结构化索引(去重 / 范围查询)

## 协议(protocol/)

WebSocket + JSON:

| 类别 | 动作 |
|---|---|
| 任务 | `create_task` · `submit` · `continue` · `cancel` · `resume` · `list` |
| 事件流 | `subscribe`(附事件重放;客户端按事件 id 去重) |
| 资产 | `list_assets` · `read_asset` |
| 设置 | `get_settings` · `update_settings` |

UI 状态是事件流的纯函数:界面不持有私有真相,重放同一批事件必然得到同一个界面。`client/agent-client.ts`(LumenClient)是类型化客户端,浏览器与 Node 测试共用。

## 模型接入(adapters/)

- `claude.ts`(Anthropic Messages API)与 `openai.ts`(OpenAI 兼容:DeepSeek、各类中转端点)
- `retry.ts` 统一重试;`record-replay.ts` 录制/回放网络字节——验收测试的请求构造、响应解析与循环全走真实路径
- 内核经由 ModelPort 使用模型,对提供商无感知;切换模型 = 换 profile,不动代码

## 工作区(workspace/)

`fs-workspace.ts`:项目目录就是真实文件系统。用户上传的文献、模型写的报告都是磁盘上的真实文件——**文件即记忆**,跨会话共享。项目级 `memory/` 目录是模型的长期记忆(索引 + 事实文件),用户可随时查看修改。会话私有目录在 `sessions/<taskId>/`;PDF 提取等中间产物进 `cache/`,不进资产列表。

## 服务与外壳

- `service.ts` — 进程入口:起 WS 服务,写 portfile(`~/.lumen/agent-service.json`:端口 / token)
- `supervisor.ts` — 把服务作为子进程拉起、等 portfile 就绪(Node 侧;Tauri 的 Rust 壳镜像同一套逻辑)
- **Tauri 壳(macOS)**:启动 sidecar → 等 portfile → 注入 WS 地址并开窗口
- **浏览器形态**:`npm run dev` 同时起服务(8787)与 Vite 开发页;客户端默认连 `ws://localhost:8787`

## ui-client

React + Vite。三栏工作台:会话列表 / 对话(全幅消息流,输入卡片悬浮其上)/ 工作区+阅读器(分栏可拖宽,工作区随产物自动展开)。`useAgent` 持有 WS 连接,把事件流 reduce 成界面状态;上传文件先在输入区暂存,发送时才进入工作区。
