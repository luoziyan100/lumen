# core/ — agent 内核(clean-room)

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;内核契约变更属架构决策,须先过 `doc/agent-core-architecture.md` §3。

职责:**正确地跑循环**,仅此而已。不 import 协议层 / 存储 / 具体工具 / UI;模型、工具、工作区全部经端口注入。

## 成员

- `loop.ts` — runAgent,唯一的循环;handlers → ephemeral text_delta / tool_call_start,定稿仍 model_step
- `thread.ts` — 只增不减的消息线程;`forModel()` 压缩视图(绝不丢 tool_result 的存在事实)
- `model-port.ts` — ModelPort + 可选 ChatHandlers(text/tool 名流式回调)
- `tool.ts` — Tool 契约 + ToolContext(+toolCallId)+ SpawnFn
- `spawn.ts` — createSpawnFn(递归原语)+ spawnTool;sub-agent = runAgent 的递归调用
- `limits.ts` — 步数 / 递归深度 / 墙钟预算;防失控循环与永远 running
- `types.ts` — 消息 / 工具调用 / 用量 / 事件的类型基座(含 ephemeral kind;`Message.reasoningContent` 供 thinking 回灌)
- `guard.ts` — withGuard 超时;ask_user 等长等待工具勿套默认 150s
- `index.ts` — 内核对外唯一出口

## 硬边界

- 工具失败 = 错误文案进 `ToolResult.llmContent` 回灌线程,让模型下一轮自行恢复;**不抛出中断循环**(AbortError 除外)。
- 铁律(tool_result 必回灌同一线程)由 `tests/invariants/` 对 main 与 worker 各钉一遍;改内核先跑它们。
