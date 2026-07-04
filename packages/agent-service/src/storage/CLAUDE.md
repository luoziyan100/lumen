# storage/ — 持久化

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;改表结构 = 新增一条纯增量 migration,禁止改历史 migration。

职责:SQLite(better-sqlite3,同步 API)+ 工作区旁的 session jsonl + 本地设置。`task_events` 是任务事实源。

## 成员

- `db.ts` — openDatabase:打开 SQLite 并跑**纯增量** migration
- `task-store.ts` — TaskStore:tasks / task_events(事件流 = runtime 的 source of truth)
- `resume.ts` — rebuildThread:从持久化事件重建可续跑线程
- `budget.ts` — 多维预算:从 task_events 计算用量(event-sourced),支持扩展预算
- `session-file.ts` — session jsonl:LLM 视角 trace(append/read/list)
- `settings.ts` — SettingsStore:模型 profile 列表(多配置单启用)+ 自定义指令;对外只回 key 掩码
- `evidence-index.ts` — EvidenceIndex:工作区产物之上的结构化索引(去重/范围查询;**尚未接进 service 工具**)
- `index.ts` — 出口

## 规则

- 事实源唯一:任务状态一律从 tasks/task_events 推导,不另立缓存字段。
- 去重 key:DOI/arXiv 优先 + 多字段哈希兜底(title+首作者有碰撞,是 old_lumen 的债,勿回退)。
