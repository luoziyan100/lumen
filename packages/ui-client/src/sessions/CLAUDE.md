# sessions/

> L2 | 父级: packages/ui-client/CLAUDE.md
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

侧栏会话列表的纯函数:排序、可见窗、灯态、展示名、项目树分桶与折叠持久化。

## 成员

- `sortTasks.ts` — 钉档 → pinned_at → created_at
- `visibleSessions.ts` — Progressive Disclosure:默认前 N + active 保底
- `sessionLamp.ts` — idle / unread / running
- `unreadSessions.ts` — 未读 id 的 localStorage 读写
- `displayTaskTitle.ts` — `title ?? goal`
- `sidebarBuckets.ts` — 消费 `isUserProjectId` 分桶:用户项目进树;default/历史桶平铺「最近」
- `expandedProjects.ts` — 项目行展开 id 的 localStorage(`lumen:sbExpandedProjects`)
