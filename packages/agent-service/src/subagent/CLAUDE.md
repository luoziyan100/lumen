# subagent/ — 子 Agent 系统

> L2 | 父级: packages/agent-service/CLAUDE.md
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

职责:让主 agent 以工具形式 spawn 子代(explore/searcher/…),**复用同一 runAgent 内核**——不存在第二个循环(铁律 1 守恒)。子代的步进事件带 `subagent_id`/`scope: 'subagent'` 写进**父 task 的 task_events**,事实源不分家;`subagents` 表只管登记、生命周期与 reminder 消费位。设计要点:并发超限拒绝不排队;kill 级联未终态后代;隔离两档——git worktree(失败显式报错,禁 fallback)或 `workers/<id>/` 条带(isolation=none 的写型子);预算记账 event-sourced——所有 `model_step.usage` 折父 token(含子 live 步),子步**不进**父 step 维;`subagent_completed` 对预算是状态通知(不滚 usage,防双计);spawn/resume 准入读同一 `computeBudgetUsage`,只拦 token/cost 耗尽;`usage_applied_to_parent` 由终态推导。

## 成员

- `types.ts` — 协议类型/状态矩阵/错误码/capability 格;TaskStore/Coordinator/Runner 共用
- `store.ts` — SubagentStore:subagents 表 CRUD + 并发计数 + reminder 列;task_events 仍经 TaskStore
- `coordinator.ts` — SubagentCoordinator:spawn 登记/kill/cancelTurn/cancelTask/wait/getOutput/sweep;parentUsage 与 spawn 准入同源;终态事件不滚 usage,终态幂等闸
- `runner.ts` — ChildRunner:物化 workspace/worktree、跑 runAgent、正常/中止/报错三出口带累计 usage 收口
- `resolution.ts` — AgentDefinition 解析 + buildChildTools(纯逻辑无 I/O)
- `tool-kind.ts` — kindOf/filterToolsForChild:工具分类与 child 工具表裁剪;未知工具 fail-closed
- `registry.ts` — mergeAgentRegistry/listCallable:project > workspace > builtin > user > plugin;visible==callable
- `discovery.ts` — discoverAgents/parseAgentMarkdown:文件系统发现,与 skills 同构分层、路径互不混用
- `reminder.ts` — 完成提示投递:drain/consume/rehydrate;真源 = `subagents.reminder_consumed`,events 只 append
- `child-resume.ts` — rebuildChildThread:只回放 `payload.subagent_id` 匹配的步进
- `worktree.ts` — git worktree 物化/清理;失败显式 error,禁止静默降级 isolation=none
- `index.ts` — 出口
