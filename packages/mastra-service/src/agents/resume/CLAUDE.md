# agents/resume/
> L2 | 父级: ../CLAUDE.md

- `index.ts`：父threadState保存稳定专家身份、角色定义、独立目录及原生子线程索引；继续时通过Memory读取历史并交给原生委派messageFilter，不另存消息、不执行历史工具。
- `routes.ts`：认证后的专家目录、显式继续入口和预算只读入口；继续进入父Controller，由原生工具审批和取消接管。

Mastra 1.67 的内置 threadId 每次会追加UUID，故产品继续ID映射到历次原生子线程，而不谎称框架维持同一个物理thread。同任务、同角色定义、原专家已结束且有持久上下文才可继续，写目录保持不变。显式HTTP继续意图保存稳定ID，委派钩子拒绝模型另建专家冒充继续。中断后只读已保存消息，未完成工具不自动重放；代码执行仍需当次原生审批。

- `cancellation.ts`：显式继续只取消原 invocation 的挂起指针；显式停止父任务才清该父所有专家指针，已完成工具结果保持，关联 suspended workflow 仅在无其它审批引用时改 canceled。

继续意图带进程 owner，重启可替换失效意图；同一 invocation 的原生审批恢复幂等复用身份与目录。每次后续模型请求前把本轮已完成消息检查点写入官方 Memory，中断继续能看到已完成副作用而不重放。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
