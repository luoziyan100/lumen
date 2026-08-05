# runtime/ — 任务运行时

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;resume / 事件语义变更须先过宪法 §4 与 §9.5(交叉矩阵)。

职责:`AgentRuntime` —— 把内核(runAgent/spawn)、存储(TaskStore/session/budget/resume)、工作区(FsWorkspace)、
角色(agents)拼成**可执行、可订阅、可恢复**的任务运行时。多任务并跑、关窗续跑的语义在这里成立。

## 成员

- `agent-runtime.ts` — 任务生命周期:submit/continue/cancel/answerUser;listProjects/createProject;listAssets(shared+session);
  makeWorkspace 挂载 sharedRoot;durable 事件写 task_events 并推订阅者;resume 只回放 main 线程;
  ephemeral(`text_delta`/`tool_call_start`)只 notify(seq=-1),UI 靠 model_step 定稿可重放复原;
  可选 imageBridge:DeepSeek 等 chat 前去图插桩,look_at_image 读同一 ImageStore;
  pendingAsk 按 taskId+toolCallId 挂起 ask_user(见 `doc/ask-user.md`)

## 规则

- durable 事件先落库再推送;ephemeral 流式增量是唯一旁路(不占 seq、不入 jsonl)。
- 新特性落地前列交叉矩阵(spawn×resume、cancel×resume、ask_user×cancel、长任务×折叠……),对应测试在 `tests/runtime/` 与 `tests/invariants/`。
