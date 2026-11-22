# Mastra 适配台账

状态: 现行，2026-11-10 建立并锁定 1.82.0；2026-11-22 逐条复核后锁定 `@mastra/core 1.85.0`（Memory 1.41.2、LibSQL 1.31.1、client-js 1.61.1、Hono 1.7.27、Observability 1.24.2）。每条记录框架行为差异、Lumen 的处置与验证方式；升级 Mastra 时逐条复核，能删的适配就删。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

## 框架缺陷（已复现）

| # | 现象 | 证据 | 当前处置 | 上游状态 |
|---|---|---|---|---|
| F1 | 原生 AgentController 下并行后台委派后，最终回复消息再次携带同一组 tool-invocation，重复 toolCallId 进入下一轮模型请求 | 正式库 2026-09-19 两组；`tests/tool-pairing.test.ts` 在 1.67.0 纯 Controller + 普通 Agent 复现 | **已关闭**：1.76.0 起修复；1.85.0 复核两个用例仍通过，保留为常规回归 | 已修复 |
| F2 | 后台子专家的工作区工具经 `context.writer.custom` 发出的 `data-workspace-metadata` 写入父线程 | 完整应用用例 foreign=1，1.67.0、1.82.0、1.85.0 均复现（todo 子用例）；正式库同形 | 未适配；data-* 不进入模型请求，只占存储 | 未修复 |
| F3 | 因工具审批挂起的运行，trace 的 model_generation/model_step 不记录 usage 与 finishReason | 正式库 101/144 次运行挂起且全部缺 usage（1.67.0）；1.82.0 与 1.85.0 隔离测试 trace 中挂起步骤均带 usage 与 finishReason=suspended（1.85 升级探针，两版同输入对照）；1.84 起按策略自动批准不再挂起 | 不适配；计费、预算与界面用量不受影响。正式库复核留待以后（2026-11-22 负责人决定不复制正式库） | 测试 trace 已修复，正式库未复核 |

## 现有窄适配

| # | 框架行为 | Lumen 处置 | 位置 |
|---|---|---|---|
| A1 | 1.67.0 Controller 把终态 TripWire 显示为完成；1.82.0 起原生报 error 与 agent_end=error，但消息为英文框架文本；1.85.0 新增输出额度用尽错误（`AGENT_STREAM_ERROR`，finishReason=length），同为英文 | 上下文/预算/空回复终态失败转可读产品 Error；TokenLimiter 同时包裹 processInputStep 与 processLLMRequest；1.85 起 `output-limit.ts` 把额度用尽且无正文/工具调用的错误译为 `run.output_limit` | `agents/guards/`、`agents/context.ts` |
| A2 | CompositeFilesystem 不支持根挂载回退（1.82.0 与 1.85.0 同样报 `No mount for path`；1.85 升级探针两版对照） | 任务、资料、记忆各自独立 contained LocalFilesystem | `workspace/workspace.ts` |
| A3 | LibSQL 不支持 metrics 信号（1.29.0 与 1.31.1 的 `batchCreateMetrics` 均拒绝；1.85 升级探针两版对照） | 不注册 metrics 导出 | `diagnostics/` |
| A4 | 原生恢复可在同一 run 内重置 step：运行中追加要求从 step 0 重新计数；重启恢复续接 step 并换新 messageId；1.85.0 的流错误重试保留 messageId 与 step，只增 retryCount | 预算准入键包含 response messageId 与 step/retry；被框架重试的失败尝试记 retried 收据 | `agents/budget/` |
| A5 | Controller 主统计不含专家步骤用量（1.82.0 与 1.85.0 均只计主线程 24/8，专家 1000/100 不在内；1.85 升级探针两版对照） | 专家用量按原生身份去重写入父 threadState | `agents/usage/` |

## 1.85.0 升级行为变化（2026-11-22 复核）

| 变化 | Lumen 处置 | 证据 |
|---|---|---|
| 1.83 起注册到 Mastra 的普通 Agent 默认开启续流：每次运行发布到 `agent.stream.<runId>` 并写服务端回放缓存；`durable` 只管续流 | 主 Agent 与专家 `durable: false`；SSE 断线仍只从持久历史补取 | `resumable-streams.test.ts` |
| 1.84 Controller 不再为自动批准的工具暂停，工具执行前不再落盘本步消息 | 运行中读持久历史的工具先调用 `context.agent.flushMessages()` | `history.ts`、`sediment-tools.ts`；`studio/sediment.test.ts` |
| 1.85 模型一步用完输出额度且没有正文或工具调用时报 `AGENT_STREAM_ERROR`（finishReason=length），不再静默完成 | A1 扩展：转 `run.output_limit`；不触发空回复纠正，不发第二次请求。有截断正文时仍是 Controller 自己的 length 错误（1.82 起即如此） | `output-limit.test.ts` |
| 1.85 流错误重试保留同一 messageId 与 step、retryCount+1，用量只计成功那次 | 有上限时失败尝试记 retried 收据（输入取准入估算、输出 0），后续准入照常；无上限与硬中断仍记未知 | `agents/usage/stream-retry.test.ts` |
| 1.85 恢复后同一响应的兄弟调用不再绕过审批（1.82 重启后批准一个写会让另一个写直接执行） | 接受原生修复，不加审批层 | `agents/approval-siblings.test.ts` |
| 1.85 `displayState=false` 会话流先发当前状态事件；`usage_update` 带 total | 界面按 id 合并，不依赖 total | UI 全量测试 |
| client-js 1.61 失败的 POST/PUT/PATCH/DELETE 默认不重试 | 接受；发送消息与审批不会因网络错误重复提交 | `ui-client/src/mastra/data/client.ts` |
| 1.84 `agent.recoverResume()` | 不接入：Lumen 的审批与问答已由 Controller 快照跨重启保留 | 报告 §7 |

## 1.82.0 升级行为变化（2026-11-10 复核）

| 变化 | Lumen 处置 | 证据 |
|---|---|---|
| `abort()` 默认把挂起工具结算为拒绝并清理快照 | 进程关闭改用 `abort({ localOnly, keepParked })`，等待答案的 ask_user 跨重启保留；用户明确停止仍走默认 abort | `lifecycle/questions.test.ts`、`settings-runtime.test.ts` |
| 明确停止把挂起调用写为 `output-denied`（Aborted by the user），不再留悬空调用 | 接受原生结算；workflow CAS 取消保留为兜底；不产生模型请求 | `lifecycle/questions.test.ts` |
| processor 重试反馈以 `<system-reminder>` 信号消息持久进入历史 | 接受；界面需展示或隐藏该信号 | `agents/guards.test.ts` |
| TokenLimiter 标准裁剪移到 `processLLMRequest`，只裁本次 prompt、不删存储 | A1 包裹新钩子 | `agents/guards.test.ts`、`agents/context.test.ts` |
| 审批挂起的 model_step 输出为空对象；恢复后重发完整步骤，`resumedFromSpanId` 指向 agent_run；chunk 直接挂在 model_step 下 | 诊断证据解码兼容新旧形状，恢复步仍精确去重 | `diagnostic-evaluation.test.ts` |
| `pendingApproval`→`pendingApprovals` Map、`model.switch(id)`、`deleteSession/getSession`、`resumeToolCall({ address })`、suspension 登记需 thread/resource、messageFilter 返回 AI SDK v5 ModelMessage | 调用点迁移，无新适配层 | 全量服务测试 |

## 已核实不是问题

- 悬空 tool call 与孤儿结果：每次构建 prompt 由 `sanitizeOrphanedToolPairs` 剥离，正式库 3 处悬空调用未影响后续请求。
- 专家 `subAgentToolResults`：只随工具结果落库，同轮和跨轮的父模型请求都只收到专家正文与引用。
- 专家内部工具（list_task_files 等）不经 Controller 权限类别，实测无审批。
