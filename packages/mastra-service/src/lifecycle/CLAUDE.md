# lifecycle/
> L2 | 父级: ../CLAUDE.md

处理框架进程与产品持久状态之间的边界，不实现第二套任务执行器。

- `recovery.ts`：在持有单实例数据根锁且尚未接收新任务时，以原生存储的条件更新结算上个进程遗留的 pending/running 子任务；保留 suspended、身份、参数与消息，不自动重放。
- `questions.ts`：新 Session 从 Agent.listSuspendedRuns 恢复已批准的 ask_user 登记与展示（登记带 thread/resource 地址）；同一入口把持久快照中待审批的工具调用重发 tool_approval_required 重建审批卡(只恢复展示，不替用户批准；批准由官方路由的 respondToPersistedToolApproval 分支续跑)；明确停止由原生 abort 结算为 output-denied，公开 workflow CAS 兜底；进程关闭以 keepParked 中止，保留快照。

约束：Mastra 任务行没有进程 owner 字段，不能单凭时间或 status 判定进程死亡。调用者必须先确认旧进程已退出并取得数据根独占权；多实例测试与普通 createApplication 不应默认运行此结算。每次取第 0 页，避免更新状态后分页跳过待结算行。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
