# lifecycle/
> L2 | 父级: ../CLAUDE.md

- `crash-worker.ts`：运行真实 Mastra reader，持久化后向父进程报告；另播种 pending、suspended 和 completed 对照记录，供 SIGKILL 场景验证筛选边界。
- `recovery.test.ts`：杀死持锁子进程、确认退出并重获临时根锁，验证原生任务结算、持久身份/消息不变与零模型重放。
- `questions.test.ts`：真实关闭重开后从原生 snapshot 恢复问答，HTTP 接收答案进入历史；重复/跨任务/失效回复返回 409，即时停止等待自身落盘且不阻塞另一会话，重启不复活。
- `delegation-stop.test.ts`：后台子 Agent 的独立 memory.resource 不改变父任务归属；排空必须等待本任务专家，停止 A 不等待 B 的活专家。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
