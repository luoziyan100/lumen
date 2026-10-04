# tests/agents/lifecycle/
> L2 | 父级: ../CLAUDE.md

- `budget.test.ts`：真实父子模型步骤结算、按当次价格累计、服务重启保持、忙会话模型计价/上下文窗口快照、并发预留、迟到收据去重、排队追问/同run新响应step归零与真实重复准入拒绝及耗尽/未知费用的调用前拒绝。
- `resume.test.ts`：完整HTTP继续原生专家；上下文与原目录重启保持，错误任务和忽略继续ID的模型不能冒充成功；原生审批仅执行一次，写入后中断继续保留事实与原文件时间戳。

- `cancellation.test.ts`：真实 Memory/LibSQL 中同父run同角色多审批精确取消一个invocation，保留其它审批共享快照及已完成结果。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
