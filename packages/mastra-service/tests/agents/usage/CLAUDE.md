# agents/usage/
> L2 | 父级: ../CLAUDE.md

- `usage.test.ts`：完整应用/LibSQL/原生委派下，核验前台步骤重复通知、后台并发、重启读取、Stop 迟到落盘和空答复重试消耗；只控制 provider 与持久化时序。
- `stream-retry.test.ts`：R2（1.85 #30696）：回复中途 ECONNRESET 被默认流错误 processor 重试，只算一步，线程用量取成功那次；有上限时失败尝试记 retried 收据（输入估算、输出 0），后续准入照常；无上限时失败尝试仍记未知。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
