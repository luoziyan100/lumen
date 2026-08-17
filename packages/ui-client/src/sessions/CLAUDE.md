# sessions/

> L2 | 父级: packages/ui-client/CLAUDE.md
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

侧栏会话列表的纯函数:排序、可见窗、灯态、展示名。

## 成员

- `sortTasks.ts` — 钉档 → pinned_at → created_at
- `visibleSessions.ts` — Progressive Disclosure:默认前 N + active 保底
- `sessionLamp.ts` — idle / unread / running
- `unreadSessions.ts` — 未读 id 的 localStorage 读写
- `displayTaskTitle.ts` — `title ?? goal`
