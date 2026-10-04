# agents/
> L2 | 父级: ../CLAUDE.md

人格与角色声明研究职责，专家工厂收窄工具和文件权限；调度、审批、暂停由 Mastra 管理；预算策略通过原生 processor 接入。

```text
agents/
├── persona.ts
├── roles.ts
├── specialists.ts
├── workspaces.ts
├── sources.ts
├── context.ts
├── catalog/
├── guards/
├── usage/
├── budget/
└── resume/
```

- `persona.ts`：保留原 L0–L3 研究人格，替换失效工具说明；实际能力为准，不依赖旧运行时。
- `roles.ts`：旧六类角色的职责、工具白名单与原生步数上限；reader 沿迁移方案只读，写作/计算归 general-purpose。
- `specialists.ts`：从静态角色快照创建原生 Agent；公开工具名沿角色名，内部 ID 按项目及定义区分，委派校验父项目，只传明确任务及 contextFromRefs 证据，隔离父对话与工具轨迹；模型与上下文窗口按父 Session 的启动模型解析；末步强制无工具总结；空总结、过滤和截断附原生终止原因并明确标为未完成，不能当作证据；DOCX/图像/执行始终解析到自身 Workspace。
- `workspaces.ts`：以受信父任务、原生 runId/toolCallId 派生稳定子目录；同角色并发委派仍相互独立。
- `sources.ts`：可写专家只读父任务材料和复制原件；文件写入仍只能落自身 Workspace。
- `context.ts`：按当前 Session 模型窗口的 80% 配置原生输入 TokenLimiter，缺省窗口 128k；连续保留近期消息，vision=off 同时隐藏视觉工具与图像请求处理器。
- `catalog/`：读取旧格式 Markdown 自定义角色、分层覆盖和启停配置；只加载白名单能力，不引入插件运行时。
- `guards/`：主运行步骤/活动时间约束、原生空行动纠正和本会话完整历史回读；不恢复旧循环或事件账。
- `usage/`：把原生 Controller 未包含的专家步骤用量归属父线程，按原生身份去重后保存在 threadState；主统计仍归 Controller。

组合：主 Agent 的 `agents` 按受信 Controller 项目选静态角色组；Mastra 按 `registeredAgents` 注册内部唯一 ID，`accepts(primitiveId)` 路由原生委派钩子，关闭时先取消/排空再调用 `close`。默认无项目参数仍提供六类内建角色。子专家不能看到 ask_user、task_*、write_memory、install_skill 或另一层 agent-*。原生 BackgroundTaskManager 管理全局/每代理并发、超时和零重试；`maxSteps` 是各专家原生步数上限，TokenLimiter 不是全家族 token/费用预算。

执行策略：general-purpose 和新增自定义角色保持前台委派，其余内建角色可以 deferred。箱内 run_code 默认自动执行；显式 ask/deny 仍由原生 Controller 管理。当前不扩大后台角色集合，同名内建覆盖仍受原角色能力上限约束。

上下文边界：TokenLimiter 使用估算输入长度，20% 留给输出和工具协议开销；超大单消息或系统指令放不下时，将公开 TripWire 类型转换为普通错误，因为锁定版 Controller 会把终态 TripWire 误显为完成。裁剪仍由原生 TokenLimiter 执行。图像像素在后续 provider 请求阶段加载，预留空间不是多模态总 tokens 的硬保证；auto/on 仍要求实际模型支持视觉，不伪造 OCR 回答。

决策：保留六类已存在能力；避免另造 writer/analyst 与旧职责重叠。专家产物放 `workers/<role>-<invocation-hash>/`，主 Agent 审阅后整合，避免并发改同一份最终报告。
旧 Git worktree 隔离迁为该独立目录设计，不保留 Git 协调器。角色配置在项目首次加载时固定，后续修改需要空闲时显式重新加载，执行中不切换工具或指令。

- `budget/`：原生模型步骤准入与父子共享累计预算，明确未知费用与未结算调用；不接管调度。
- `resume/`：稳定专家身份到原生物理子线程的索引、同角色同任务显式继续、旧挂起取消与历史检查点；不自动重放工具。

专家继续保留原目录，历史由 Memory 回读；普通新委派仍隔离父历史。预算属于 Lumen 原生 processor 策略，框架负责实际执行。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

执行边界：可执行专家按父任务实时解析已安装技能只读根，仅在自己的 workers 子目录写产物；委派与箱内计算默认自动执行，显式 ask/deny 仍由 Controller 保留。
