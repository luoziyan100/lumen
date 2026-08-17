# sessions/

> L2 | 父级: packages/ui-client/CLAUDE.md
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

侧栏与会话页的纯函数:排序、可见窗、查询、分页、灯态、展示名、项目树分桶与折叠持久化。

## 成员

- `sortTasks.ts` — 钉档 → pinned_at → 未钉 `updated_at`(与 store ORDER BY 同构)
- `visibleSessions.ts` — 前 N + active 保底;项目树 N=4,最近 N=20;溢出换面,无展开态
- `paginate.ts` — 会话页分页;`SESSIONS_PAGE_SIZE=20`
- `sessionQuery.ts` — 标题/goal 匹配 + 筛选;SearchModal 与 SessionsView 共用
- `relativeTime.ts` — 相对时间零件(文案在 copy)
- `sessionLamp.ts` — idle / unread / running
- `unreadSessions.ts` — 未读 id 的 localStorage 读写
- `displayTaskTitle.ts` — `title ?? goal`
- `sidebarBuckets.ts` — 消费 `isUserProjectId` 分桶:用户项目进树;default/历史桶平铺「最近」
- `expandedProjects.ts` — 项目行展开 id 的 localStorage(`lumen:sbExpandedProjects`);本单不动
