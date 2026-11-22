# agents/
> L2 | 父级: ../CLAUDE.md

- `specialists.test.ts`：同一父运行同时委派相同角色，独立 RequestContext/写目录不互覆盖，父材料只读且结果回灌；最后一步无工具总结实际证据并返回父模型，隔离父历史仍保留 contextFromRefs；过滤及截断如实回报且不自动重试；只读专家实际请求中的工具 schema 不含 save_as，可写专家保留。
- `context.test.ts`：真实 Memory 长历史经原生 TokenLimiter 裁剪当次模型输入，保留近期工具配对及完整输出，原历史仍落盘。
- `approval.test.ts`：正式应用的专家委派及箱内代码默认无批准步骤，实际读取技能/父任务资源且只能写自身独立目录，不用自动批准事件掩盖权限回归。
- `approval-siblings.test.ts`：R4（1.85 #30605）：同一响应的两个调用，一个等审批并获批后，兄弟调用仍按 Lumen 权限规则判定（放行的自行执行，显式 ask 的照样询问），流内与服务重启后经官方 tool-approval 路由两种情形。
- `tasks.test.ts`：原生 task_* 的展示与 threadState 在关闭重开后仍一致，task_check 核对已完成状态。
- `catalog.test.ts`：旧角色 Markdown 的分层覆盖、启停、白名单收窄、原子保存及链接/错误诊断。
- `custom-delegation.test.ts`：全局一组用户角色在两个主题里经原生动态 agents 委派，公开名一致，内部身份带版本哈希，文件权限按主题工作区隔离。
- `user-roles.test.ts`：完整应用加载用户层角色（内置 > 用户 > 插件），HTTP 重载/启停实际改变后续 Controller 模型请求与委派结果；接线隔离父历史且保留委派目标。
- `guards.test.ts`：真实 Controller 下空答复纠正、步骤/活动时间停止、用户等待暂停和当前会话持久历史回读。
- `usage/`：真实专家用量的步骤去重、前后台归属、重启读取与停止时迟到落盘；框架流错误重试的用量与预算收据。

- `lifecycle/`：父子共享预算并发准入、迟到 usage 结算，以及跨重启/审批/中断的显式专家继续。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
