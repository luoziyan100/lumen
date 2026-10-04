# agents/guards/
> L2 | 父级: ../CLAUDE.md

使用原生 processor 和 Controller 生命周期约束单次研究运行，不复制模型循环或对话存储。

```text
guards/
├── budget.ts
├── conclusion.ts
├── empty-action.ts
└── history.ts
```

- `budget.ts`：主运行最多 100 个模型步骤、1200 秒活动时间；processor 首步启动计时，Controller 审批/问题等待暂停，超时中止原生 Session。
- `empty-action.ts`：模型无正文且无工具时请求框架反馈重试一次，再为空则走框架错误路径明确报错。
- `conclusion.ts`：受信委派步数内预留最后一次无工具模型调用，总结已读证据与缺口，避免工具耗尽步数后交回空文本。
- `history.ts`：只读受信当前 thread 的完整持久历史，按消息页及页内字符分段返回，模型不能指定其他身份。

组合：预算 `inputProcessor` 放主 Agent 输入链首位，创建 Session 后 `observe(session)`；根注入 `onTimeout(resourceId)` 复用完整停止路径，级联取消专家。关闭排空后 `close()` 清理订阅和计时器。空行动 processor 放主/子 Agent 输出链，并设置 `maxProcessorRetries: 1`。历史工具仅给主 Agent，依授权回调核验应用中已打开的任务。

预算边界：步数来自框架当前 run，活动计时包含模型和工具执行；用户等待与离线时间不计。进程重启只接续原生 processor 快照中已记录的活动用时，最后一次未落盘的崩溃片段无法精确补账。它不是任务全生命周期或父子累计 token/费用硬上限。

锁定版边界：processor workflow 未透传 `runId` 时读取公开 Session.run；Controller 不把终态 TripWire 映射为错误，故只用 TripWire 请求一次纠正，最终失败通过普通 Error 进入原生失败流。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
