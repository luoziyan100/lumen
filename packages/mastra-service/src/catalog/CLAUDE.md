# catalog/
> L2 | 父级: ../CLAUDE.md

主题下的会话目录和阅读游标属于产品领域，保存到 `catalog.sqlite`（主题本身归 `studio/`）；会话身份、标题与目录标记以 Mastra thread 为唯一来源。此模块不保存消息、运行状态或后台任务副本。

- `types.ts`：供服务和桌面 type-only 引用的会话与分页 DTO，无运行依赖。
- `catalog.ts`：主题归属约束（经 TopicStore；未知 404、归档 409）与原生 Memory thread 目录操作，按主题串行修改；`requireSession` 只做主题和 thread 归属检查，`getSession` 才召回最新消息计算未读；元数据筛选/分页后仅召回每个会话最新一条持久消息，与已读 ID 比较；首次消息生成标题（解读划句提问取引文，不取「> 」格式行），手动标题不被覆盖。新会话不存标题（null，界面显示「未命名」）；旧库里的「新对话」读出为 null。改名去首尾空白，空标题 400 `session.title_empty`。正在删除的会话按 404 处理且不入列表；`listArchived` 给设置 › 已归档；`forgetReceipts` 供删除清游标。
- `read-receipts.ts`：只保存 thread ID 到已读 message ID 的产品游标，空字符串明确表示用户标为未读，重复确认幂等；`clearPrefix` 按 thread 或 `topicId:` 前缀删游标（删除用）；独立于框架元数据以免整行回写覆盖并发运行或改变排序时间。
- `routes.ts`：认证后的 `/topics/:topicId/sessions…` 目录 HTTP 路由（列表、建会话、单个读写、已读/未读）；列表附原生运行/等待状态投影，不创建历史Session或持久化第二套运行态；手动未读写入先验证会话主题归属，已读确认匹配最新消息，迟到确认不能清除新内容。归档 PATCH 包在空闲检查里，运行或等待中 409。

会话 `resourceId/threadId` 固定为 `topicId:taskId`；平面 `lumenTopicId/lumenTaskId/lumenPinned/lumenArchived` 元数据让框架原生查询承担筛选与分页。归档主题不能新开会话；归档不删除研究文件与消息。

已读游标不参与研究执行。确认检查后出现新消息时，旧 ID 与新 ID 不同，列表仍显示未读。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
