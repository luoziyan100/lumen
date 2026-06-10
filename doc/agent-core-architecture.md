# Lumen Agent 架构设计（clean-room）

> 版本: v2-draft · 日期: 2026-06-07 · 状态: 设计稿待审
> 本文档是新 Lumen 的架构宪法。`old_lumen/` 是参考与资产来源，**不是代码基线**。
> 任何要从 old_lumen 搬过来的东西，必须先审过、确认满足 §1 不变式，再搬。

---

## 0. 为什么 clean-room + 为什么换拓扑

**为什么 clean-room**（读 old_lumen 代码得到，非文档推断）：它已经写对了一个 agent 循环（主 `task-runtime.ts`），但 worker 没复用它、在 `spawn.ts` 另写了第二个循环且写坏了——worker 每轮把消息从头重建，工具结果从不回传给下一轮，于是 worker 看不见自己搜到了什么，无法"先搜再答"；主 agent 又被砍成只能 spawn，所有真实工作都走那个坏 worker。外层 9 层架构是真的，但承重叶子要么坏要么是桩（意图路由是硬编码关键词正则）。50 个测试全绿没拦住，因为它们全用 scripted adapter / 注入假 stepRunner，结构上绕过了真实内核。

不打补丁，重建一个唯一正确的内核。

**为什么换拓扑（v2 关键决定）**：产品野心确定为**后台自治研究**——甩一个深度任务出去、关上窗口去干别的、回来看结果、可能多任务并跑。这要求 agent 大脑**脱离 UI 窗口独立存活**，不能再当 WebView 的房客。于是架构重排为：

> **一个无头（headless）、长生命周期的本地 agent 服务 + 一个连上它的 Tauri 薄客户端。**

外壳从"agent 宿主"降级为"UI 客户端"。Tauri 留下来做它擅长的事（轻量、原生 PDF、好 UI），不再承载 agent。

---

## 1. 第一性原理：agent 的不可破不变式

一个 agent，剥到底，是**一条只增不减的消息线程上的循环**。它只有一条铁律：

> **模型每一次产生的动作（tool call），其结果必须回灌进同一条线程，再连同完整线程喂回模型。模型必须能看见自己行为的后果。**

参考循环（内核就这么大）：

```
runAgent(thread, tools, limits):
  loop:
    if aborted or over-budget: return partial(thread)
    response = model(thread, tools)          # 一次模型调用
    thread.append(assistant: response)       # ← 动作进线程
    if response has no tool_calls:
      return done(response.text, thread)     # 模型自己决定收尾
    for call in response.tool_calls:
      result = execute(call)                 # 真实执行
      thread.append(tool_result: result)     # ← 后果进同一条线程（铁律）
    # 不 return，继续 loop —— 下一轮模型就看到了 result
```

**这条不变式是验收一切的尺子。** 任何"层"如果让 result 进不了线程、或让模型看不到真实后果（只给摘要、只给 `[ev:N]` 占位、静默截断丢掉 tool_result），它就是错的，无论包装多漂亮。

---

## 2. 总体拓扑

```
┌────────────────────────────────────────────────────────┐
│  ui-client  ——  Tauri 薄客户端（WebView UI）              │
│  LUI 聊天 · PDF reader(pdf.js) · Library · Settings      │   关掉窗口，agent 照跑
│  Rust 侧极薄：窗口管理 + 监督 sidecar + 文件对话框          │
└──────────────────────────┬─────────────────────────────┘
            localhost WebSocket（事件流 + RPC，带本地 token）
┌──────────────────────────┴─────────────────────────────┐
│  agent-service  ——  无头 Node 进程（Tauri sidecar 启动）  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ agent-core 内核（§3）：runAgent 唯一循环，main/worker 递归 │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ 工具（§5）：L1 工作区 fs 原语 · L2 研究桥接            │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ 运行环境（§4）：服务生命周期 · 协议 · 持久化/恢复 · 预算 │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ 存储：SQLite(better-sqlite3) · 工作区文件 · session jsonl │  │
│  └───────────────────────────────────────────────────┘  │
│  可多任务并跑 · 可后台自治 · 可纯无头测试（不需要 WebView）  │
└─────────────────────────────────────────────────────────┘
```

**运行时选型**：agent-service 用 **Node**（稳、打包成熟；Bun 作为后续可选加速）。SQLite 用 **better-sqlite3**（同步、快、本地最优）。HTTP 用内置 `fetch`。协议用 **WebSocket**（单连接双向：UI→submit/cancel/resume，service→事件流）。

**生命周期**：service 是 Tauri 通过 sidecar 机制启动并监督的子进程，绑 localhost 随机端口（端口 + token 写到 UI 能读的本地文件）。关闭窗口时 Tauri 退到 tray/dock，**service 继续跑**——后台自治由此成立。完全退出 app 时默认杀掉 service（"真 daemon 跨重启存活"是后续可选项，不在 v1）。

**这个拓扑的三个红利**：① 后台自治天然成立；② agent 服务**无头可测**，把 §9"测试不准绕过真实路径"的纪律焊进架构；③ 一种语言（TS）贯穿内核+工具+后端，工具是进程内调用没有 IPC 跳，将来上 bash/computer-use 只是 `child_process` 一行。

---

## 3. agent-core 内核（clean-room，全新写）

内核**不认识**任何具体工具、不认识 evidence/intent/hooks/协议/UI。工具与能力全部注入。内核只负责"正确地跑循环"。

```
agent-service/src/core/
  thread.ts        # 消息线程：append（只增）+ forModel（压缩，不截断）
  model-port.ts    # 模型调用端口（adapter 接口，内核只认这个端口）
  tool.ts          # 工具契约：注册 / 派发 / 结果回灌
  loop.ts          # runAgent —— 唯一的循环，main/worker 递归共用
  spawn.ts         # spawn 工具 = 对 runAgent 的递归调用 + 压缩返回
  limits.ts        # step / token / wall-clock 预算与取消、递归深度上限
  types.ts
```

核心契约（落地以此为准）：

```ts
type Role = 'system' | 'user' | 'assistant' | 'tool_result'
interface Message { role: Role; content: string; toolCalls?: ToolCall[]; toolCallId?: string }
interface Thread {
  messages: Message[]
  append(m: Message): void              // 唯一写入口，只增
  forModel(): Message[]                 // 给模型的视图：超窗压缩老内容，但绝不丢 tool_result 的存在
}

interface ModelPort {                   // 内核唯一认识的"模型"
  chat(messages: Message[], tools: ToolSpec[], signal?: AbortSignal): Promise<ModelResponse>
  stream?(messages: Message[], tools: ToolSpec[], opts): Promise<ModelResponse>
}
interface ModelResponse { message: Message; toolCalls: ToolCall[]; usage?: Usage }

interface Tool {
  spec: ToolSpec                        // name / description / json schema
  run(args: unknown, ctx: ToolContext, signal?: AbortSignal): Promise<ToolResult>
}
interface ToolResult { llmContent: string; data?: unknown }   // llmContent 必回灌进线程
interface ToolContext {
  workspace: Workspace                  // 沙箱工作区句柄（§5）
  taskId: string; agentRole: string; depth: number
  spawn: SpawnFn                        // 递归 spawn
  emit: (kind: string, payload: unknown) => Promise<void>     // 事件流（持久化 + 推 UI）
  deps: Record<string, unknown>
}

function runAgent(input: {
  thread: Thread; model: ModelPort; tools: Tool[]; limits: Limits
  ctx: ToolContext; signal?: AbortSignal; onEvent?: (e: AgentEvent) => void
}): Promise<{ status: 'done'|'aborted'|'exhausted'|'error'; reply: string; thread: Thread }>
```

**内核硬边界**：
- 不 import 协议层 / evidence / intent / 任何具体工具 / UI。
- 工具失败 = 返回 `ToolResult`（error 文案进 `llmContent`），**让模型下一轮看到并自行恢复**，不抛出中断循环（除 AbortError）。这是 recovery 的来源。
- 压缩发生在 `Thread.forModel()`：超窗时摘要老的 assistant/tool_result，但**保留其存在事实**（"早先读过 X，正文已写入 workspace/papers/x.md，需要可重读"），绝不静默删除让模型以为没发生过。

---

## 4. agent 服务的运行环境（内核之外）

| 职责 | 正确做法 |
|---|---|
| 服务生命周期 | sidecar 启动 → 绑 localhost + token → 监督/重启；window 关闭不影响 |
| agent↔UI 协议 | 单 WebSocket：UI 发 `submit/cancel/resume/list`，service 推 `event`(model_delta/tool_call/tool_result/reply/error/done) |
| 模型调用 | adapter → `ModelPort`，流式 + 瞬时错误重试 |
| 工具派发 | 结果原样回灌；大结果"可折叠但可经工作区按需取回"（不逼模型瞎猜） |
| 上下文窗口 | 压缩老消息，**绝不丢 tool_result**（old_lumen 暴力截最后 60 条，错） |
| 持久化与恢复 | 事件流（SQLite task_events）→ 重建线程、续跑；服务重启可恢复未完成任务 |
| 取消 / 预算 | abort 贯穿；step/token/时长上限；递归深度上限 |
| 可观测性 | session jsonl（LLM 视角 trace），UI 可 inspect |

**协议要点**：事件流是 source-of-truth task_events 的实时投影；UI 任何时刻可断开重连，靠 `resume(taskId, afterSeq)` 拉齐——这天然支持"关窗口再回来"。

---

## 5. 工具模型：两层 + 沙箱工作区

### 5.1 理念：给 agent 一个真实的"地面"

old_lumen 给 agent 的是一台研究 RPC 自动贩卖机——固定动词、无状态、不可组合、不可累积。Claude Code 强的根因不是工具名字，是它有开放、可组合、有状态的工作环境。Lumen 复制这个**原则**，按研究领域裁剪。agent-service 在 Node 里，工具是**进程内函数**，有完整 OS 能力。

### 5.2 L1 — 环境原语（作用在沙箱工作区上）

```
read_file  write_file  edit_file  list_dir  grep  glob
```

agent **攒状态**的地方：抽取的论文正文、笔记、对比表、综述草稿写成文件，回头能 grep、能重读、能改。**这同时解决上下文问题**——"文件系统即上下文"：不把所有正文塞进线程，agent 把内容写文件，需要时自己决定读哪个、grep 什么，拿到真实正文而非被截断的摘要。比 old_lumen 的 ledger-only 既更强也更正确。

### 5.3 L2 — 研究桥接（把外部世界灌进工作区）

```
search_papers   search_web   fetch_paper   extract_pdf   get_citations
```

shell 干不了的领域能力（grep 不了 arXiv、bash 不出 PDF 正文）。产物**落进工作区文件 + SQLite 索引**，再由 L1 工具操作。

> **后端去哪了**：old_lumen 的研究后端在 Rust（`search.rs` arXiv/S2 + 期刊排名、`web.rs` 带 URL 白名单、`files.rs` 屏蔽 sci-hub + 缓存）。新拓扑里 agent 在 Node，这些**改写进 Node 服务**（本质是 `fetch` + 解析 + sqlite，中等工作量）。真正值钱的**期刊排名表是数据，原样导出 JSON 搬过来**。这样 agent 调工具是进程内调用，没有 agent→IPC→Rust 那一跳。

### 5.4 bash：v1 先不给原始 bash

照搬 Claude Code 的**原则**（真实环境）而非工具清单。研究本质是读—想—写，极少需要图灵完备 shell；`read/write/edit/grep/glob` 已覆盖 ~90%。Node 服务里将来加 bash 是 `child_process` 一行，但 v1 推迟（安全 + 非程序员用户）。

### 5.5 安全边界（硬约束）

- 路径沙箱：fs 工具只能读写 `workspace/`；论文库目录**只读**；解析路径，拒绝 `..` / 符号链接逃逸。（old_lumen `read_pdf_file` 无校验，是已知债，重写时补。）
- 网络：只走 L2 受审桥接工具——API key、限流、白名单集中管控；fs 原语（及未来 bash）一律不许联网。
- 取消：所有工具接 AbortSignal。

### 5.6 工作区目录布局

```
~/.lumen/workspaces/<project_id>/
  papers/        # extract_pdf / fetch_paper 抽取的论文正文（markdown）
  notes/         # agent 写的笔记 / 结构化摘要
  drafts/        # 综述、对比表、报告草稿
  scratch/       # 中间产物
  .index.sqlite  # Evidence Index：工作区产物之上的结构化索引
```

### 5.7 Evidence Index 的正确定位

不是挡在正文前的摘要过滤器，而是**工作区产物之上的 SQLite 索引**：去重（同 DOI 不重复入库）、结构化查询（"过去 7 天 Nature 系"）、跨任务记忆。模型要正文时读 `papers/*.md`；要范围查询时查索引。两者并存，不互相替代。去重 key 用 DOI/arXiv 优先 + 多字段哈希兜底（old_lumen 用 title+首作者，有碰撞）。

---

## 6. sub-agent = 递归，不是另一套东西

worker 就是 `runAgent` 的递归调用：

```ts
const spawnTool: Tool = {
  spec: { name: 'spawn', /* role, scope, prompt */ },
  async run(args, ctx, signal) {
    if (ctx.depth >= MAX_DEPTH) return { llmContent: 'spawn rejected: max recursion depth' }
    const childThread = new Thread([
      { role: 'system', content: systemPromptFor(args.role) },
      { role: 'user',   content: `${args.scope}\n\n${args.prompt}` },
    ])
    const result = await runAgent({
      thread: childThread,
      model: ctx.deps.model,
      tools: toolsFor(args.role),                       // 受限工具子集
      limits: limitsFor(args.role),
      ctx: { ...ctx, agentRole: args.role, depth: ctx.depth + 1,
             workspace: ctx.workspace.scoped(args.role) },
      signal,
    })
    return { llmContent: compact(result.reply), data: { workerThread: result.thread } }
  },
}
```

- worker 内部跑**同一个正确循环**——病根 1 自动消失。
- 父 agent 只拿到 worker 的压缩返回（`compact`），看不到 worker 线程——真正的上下文隔离。
- **主 agent 不是残废**：它配齐 L1+L2 工具，自己就能干活。spawn 是**可选**的扇出/隔离手段（读 10 篇、并行扫 5 个期刊时才用），不是强制绕道。
- worker 也能 spawn（递归），由 `MAX_DEPTH` 兜底防失控。

---

## 7. 从 old_lumen 抢救清单（已对代码逐项核实 2026-06-07）

**搬进 agent-service（Node）：**

- ✅ **adapter 适配层** `src/agent-v2/adapters/`（claude.ts 211 行已正确映射 tool_use/tool_result；`V2LLMAdapter` 接口几乎 1:1 → `ModelPort`）。解开对 `services/ai.ts`、`tools/types.ts` 的耦合即可。
- ✅ **budget 多维预算** `src/agent/budget.ts`（event-sourced，从 task_events 算用量，支持 budget_extension）。直接搬。
- ⚙️ **研究后端**：`search.rs`/`web.rs`/`files.rs` 的逻辑**改写进 Node**；**期刊排名表导出 JSON 原样搬**。
- ⚙️ **task_events 持久化 + 恢复**：表结构（migration v7）+ 语义照搬，实现改 better-sqlite3。
- ⚙️ **session jsonl trace**：格式照搬；old `session_store.rs` 2020 行太杂，只取 append/read/list/delete 语义在 Node 重写。
- ⚙️ **Evidence Index**：表结构（v8）参考；降级为 §5.7 工作区索引；去重 key 修碰撞。
- ✅ **Skill 系统**（SKILL.md + bundled）→ 可选中间件。
- ✅ **Output 模板**（compose）→ 可选输出纪律。

**留在 ui-client（Tauri）：**

- ✅ **前端 PDF 渲染 + 抽取** pdf.js **v4.10.38**（前 15 页/6000 字符，**不要升 v5**——WebKit 下 ESM 加载不工作）。渲染在 UI；`extract_pdf` 工具在 service 侧用 pdf.js 的 Node 构建跑。
- ✅ **Lumen Design System**（CSS 变量/字体/动效约束）。
- ✅ **LUI 聊天 / Reader / Library 等 UI**（重构，连 WS 而非直接调 agent）。
- ✅ Tauri 脚手架（Rust 侧大幅瘦身：窗口 + sidecar 监督 + 文件对话框 + PDF 导入）。

**不搬（错误抽象 / 死代码）：**

- 双 worker 循环（`workers/worker-runtime.ts` 私有循环、`spawn.ts` 私有 stepRunner）——病根 1
- 关键词意图路由器（`intent-router/classifier.ts`）
- "主 agent 只能 spawn" 约束（`main-agent-tools.ts`）
- 把正文挡在 ledger 后的强制摘要
- 5 原语抽象（discover/filter/read/verify/compose）→ 改回具体工具
- legacy `src/agent/` 行为内核（loop/runtime/step/evaluator/tools）
- `openai_codex.rs` / `rss.rs` / `agent_session.rs`（弃用/legacy）

**安全债（搬时一并修）**：`read_pdf_file` 路径校验、evidence 去重 key 碰撞、migrations 去掉自愈重建改纯增量。

---

## 8. 新项目骨架（monorepo）

```
lumen/
  doc/
    agent-core-architecture.md     ← 本文档
  packages/
    agent-service/                 # 无头 Node 服务（agent 大脑）
      src/
        core/                      # §3 内核（clean-room）
        tools/env/                 # §5.2 L1 fs 原语
        tools/research/            # §5.3 L2 研究桥接（含 Node 化后端）
        workspace/                 # §5 沙箱工作区
        adapters/                  # 搬 old_lumen，适配成 ModelPort
        runtime/                   # 生命周期/恢复/事件流/budget
        protocol/                  # WS 协议（submit/cancel/resume/event）
        storage/                   # better-sqlite3 + migrations + session jsonl
      tests/
        invariants/                # §9 不变式测试（核心）
        replay/                    # §9 录制-重放
    ui-client/                     # Tauri 薄客户端
      src/                         # React UI（连 WS）
      src-tauri/                   # 极薄 Rust：窗口 + sidecar 监督 + 文件对话框
    shared/                        # 跨包共享类型（协议消息 / 事件 kind）
```

---

## 9. 验收与防自欺（old_lumen 最大的教训）

old_lumen 绿测试没拦住致命 bug，因为全用 scripted adapter / 注入假 stepRunner，绕过真实内核。新拓扑把"无头可测"变成架构属性——agent-service 不需要任何 WebView 就能端到端跑测。规则：

1. **录制-重放 adapter**：录一段真实 LLM 多轮 tool-use 响应，重放进**真实默认内核路径**（不注入任何替身）跑端到端。
2. **不变式测试（核心）**：把 §1 铁律钉成断言——
   - "第 N 轮 tool_result 出现在第 N+1 轮 `thread.forModel()` 输出里"。
   - 压缩后 tool_result 的"存在事实"不丢失。
   - **同一组不变式对 main 和 spawn 出的 worker 各跑一遍**——证明"一个内核两处复用"成立。
3. **协议契约测试**：UI 断开→重连→`resume` 能拉齐事件，不丢不重。
4. **禁止全 mock 充数**：每个里程碑至少一条用真实/重放 adapter 走默认路径的端到端用例。CI 全绿但无此类用例 = 验收不通过。
5. **组合不变式（2026-06-10 教训）**：单特性各自有真实路径测试还不够，特性×特性的交叉必须显式钉测试——
   spawn×resume（worker 事件不得混入主线程重建）、cancel/crash×resume（悬空 tool_use 必须被修补成 provider 合法线程）、
   长任务×上下文（折叠在默认生产路径生效且最近结果可见）。新特性落地时，列出它与已有特性的交叉矩阵再验收。

---

## 10. 构建顺序（里程碑）

| 里程碑 | 内容 | 状态 |
|---|---|---|
| **M0** | agent-core 内核 + 内存 fake 工具 + 不变式测试 | ✅ 完成（main+worker 不变式绿） |
| **M1** | adapter → ModelPort + 录制-重放 e2e | ✅ 完成（fixture 为真实线格式；真录制待 API key） |
| **M2** | 沙箱工作区 + L1 fs 原语 | ✅ 完成（四道逃逸向量被拒；filesystem-as-context e2e 绿） |
| **M3** | storage + 预算/恢复 | ✅ 完成（resume capstone 绿） |
| **M4** | WS 协议 + 服务生命周期（headless 可跑） | ✅ 完成（createService + WS/Client e2e 绿） |
| **M5** | spawn 递归 + worker（受限工具/隔离/压缩返回） | ✅ 完成（roles + 受限工具测试绿） |
| **M6** | L2 研究桥接（Node 化后端） | ✅ 完成。papers/citations/fetch_url（stub HTTP 测）；**extract_pdf 接 unpdf**（真 PDF + 沙箱本地读已测）；**search_web 接 Tavily**（stub 离线回归 + 真实 API 实测 10 条）。key 走 env（ANTHROPIC/TAVILY），不入库 |
| **M7** | Tauri 薄客户端 | 🟡 进程生命周期已无头验证（supervisor 真子进程 spawn→portfile→连接→停止）；LumenClient + 浏览器 React LUI 可跑可测；Tauri `src-tauri/` 已脚手架但未本机编译（无工具链） |
| **M8** | 可选层：evidence index / skill / 输出纪律 | 🟡 evidence index 模块 ✅（**尚未接进 service 工具**）；skill / 输出纪律 待接 |
| **M9** | 加固（2026-06-10）：① WS token 鉴权（portfile 0600，浏览器对 ws://127.0.0.1 无跨源限制，必须带 token）② task_events 增 agent_role，resume 只回放 main + 悬空 tool_use 合成"已中断"结果 ③ 上下文折叠默认启用（>8000 字符老 tool_result 折叠，最近 6 条豁免）④ transport 指数退避重试 + 单次 120s 超时 ⑤ 墙钟进 Limits；exhausted→interrupted（可 resume，不伪装 done）；服务启动 sweep 遗留 running | ✅ 完成 |

> 测试现状：`packages/agent-service` **85/85 通过**，零 mock 充数（替身只在 ModelPort / HttpClient / fetch 网络缝）。
> 真实研究任务端到端跑真模型需 `ANTHROPIC_API_KEY` + 录制为 fixture，作为下一步回归基线。
> 已知未做：流式（ModelPort 无 stream / 无 model_delta）、spawn workspace.scoped 隔离与 compact 压缩、
> 工具并行执行（一轮多个 tool_call 目前串行）、全线程 token 预算（折叠之外的整窗管理）、evidence index 接线。
