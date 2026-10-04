# catalog/
> L2 | 父级: ../CLAUDE.md

项目目录和阅读游标属于产品领域，保存到 `catalog.sqlite`；会话身份、标题与目录标记以 Mastra thread 为唯一来源。此模块不保存消息、运行状态或后台任务副本。

- `types.ts`：供服务和桌面 type-only 引用的项目、只读资料绑定、会话与分页 DTO，无运行依赖。
- `projects.ts`：Node 原生 SQLite 项目持久化；默认项目播种、原子更新和仅供离线导入的 restoreTimestamps，不接触框架内部表。
- `catalog.ts`：项目归属约束与原生 Memory thread 目录操作，按项目串行修改；`requireSession` 只做项目和 thread 归属检查，`getSession` 才召回最新消息计算未读；元数据筛选/分页后仅召回每个会话最新一条持久消息，与已读 ID 比较；首次消息生成标题，手动标题不被覆盖。
- `read-receipts.ts`：只保存 thread ID 到已读 message ID 的产品游标，空字符串明确表示用户标为未读，重复确认幂等；独立于框架元数据以免整行回写覆盖并发运行或改变排序时间。
- `routes.ts`：认证后的目录 HTTP 路由；列表附原生运行/等待状态投影，不创建历史Session或持久化第二套运行态；手动未读写入先验证会话项目归属，已读确认匹配最新消息，迟到确认不能清除新内容。
- `source-routes.ts`：显式项目资料绑定的 GET/PATCH；验证项目存在，按项目串行并进入共享配置写锁，运行/待答时拒绝更新，保存后等待文件系统与项目角色失效；公共请求不接触历史时间恢复能力。

会话 `resourceId/threadId` 固定为 `projectId:taskId`；平面 `lumenProjectId/lumenTaskId/lumenPinned/lumenArchived` 元数据让框架原生查询承担筛选与分页。仅空项目可删除，默认项目保持可用；归档不删除研究文件与消息。

已读游标不参与研究执行。确认检查后出现新消息时，旧 ID 与新 ID 不同，列表仍显示未读。旧导入只有在最新消息本身仍带 legacy 来源且尚无游标时才默认已读；继续生成的新消息不会继承这个默认。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
