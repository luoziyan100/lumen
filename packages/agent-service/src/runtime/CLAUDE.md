# runtime/ — 任务运行时

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;resume / 事件语义变更须先过宪法 §4 与 §9.5(交叉矩阵)。

职责:`AgentRuntime` —— 把内核(runAgent/spawn)、存储(TaskStore/session/budget/resume)、工作区(FsWorkspace)、
角色(agents)拼成**可执行、可订阅、可恢复**的任务运行时。多任务并跑、关窗续跑的语义在这里成立。

## 成员

- `agent-runtime.ts` — 任务生命周期:submit/continue/cancel;事件写 task_events(source of truth)并推订阅者;
  服务重启 sweep 遗留 running;resume 只回放 main 线程,悬空 tool_use 合成「已中断」结果

## 规则

- 事件先落库再推送;任何旁路直推(不落库)都会破坏断线重连的「不丢不重」。
- 新特性落地前列交叉矩阵(spawn×resume、cancel×resume、长任务×折叠……),对应测试在 `tests/runtime/` 与 `tests/invariants/`。
