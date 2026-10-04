# migration/
> L2 | 父级: ../CLAUDE.md

一次性离线导入旧 Lumen 数据。源根只读；原库先复制到临时目录再查询，防止 SQLite 在源根创建 WAL/SHM。原始文件完整封存，只有可合法恢复的终态主线程转换为 Mastra Memory。

- `types.ts`：源表行、文件清单、身份映射及迁移报告契约。
- `files.ts`：源根扫描、哈希核对、非重叠路径校验与只读档案复制，拒绝链接和特殊文件。
- `source.ts`：副本 SQLite 查询与真实旧布局解码；JSONL 仅归档，不与权威事件重复导入。
- `libraries.ts`：逐项目显式复制或绑定旧 source_path，canonical 必须匹配；复制进共享资料并归档，绑定只写私有 source.json。
- `messages.ts`：事件到原生消息的确定性转换，配对工具结果并保留 reasoning、图片、附件和来源元数据。
- `importer.ts`：dry-run、阻塞项检查、staging 导入和原子发布；项目走 catalog，正文经公开 memory storage 原样写入，Memory 核对角色/时间/内容后初始化已读游标，不调用模型或历史工具。
- `legacy-diagnostics/`：当前目录授权后按迁移映射只读旧执行证据；原DB/WAL/SHM校验复制到临时目录，blob核哈希并按当前凭证脱敏，不恢复旧执行器。

未知表/事件及子代理内部历史留在只读 archive 并写入报告；孤立工具、损坏消息、非终态任务、未映射的根外 library 或缺附件阻止发布。项目创建/更新时间在所有目录操作之后经 ProjectStore 内部方法恢复，会话与消息时间恢复到原生 thread/message。重复执行同时确认源快照和外部映射，不覆盖新系统产生的数据。

`--copy-source PROJECT_ID=/absolute/configured/source` 将外部资料校验复制到 `projects/<id>/shared/library`，原件另存只读 archive/libraries。`--bind-source` 只写 `projects/<id>/source.json`：`{version:1,path:canonical,readOnly:true}`；由工作区独立 source 范围读取，既不遍历依赖树也不宣称外部文件已经归档。默认不读取任何未映射外部源。

工具调用按宿主/provider 身份跨事件配对，允许旧 ask_user 的真实答复在后续轮次落盘；结果事件的原 seq/时间保留在来源元数据，不合成成功。源目录在 inspect 前后核对，副本数据库做 quick_check；变化中的源不视作可发布快照。

Mastra Memory 不持久化 system 消息。旧 empty_action 催促属于运行时事件，完整保存在原档案并附到邻近消息 legacyHarnessEvents 来源中；不冒充用户消息，也不重新注入新 Agent 的系统指令。

原事件同毫秒或时间倒退时，原生消息时间以 1ms 最小增量保持事件顺序，原时间始终保留在消息来源元数据。archive 包含旧数据库及全部原文件，JSONL 作为阅读投影只封存，禁止与 task_events 重复合并。

锁定版本的 Memory.saveMessages 会无条件清理 working-memory 标记并 trim 正文。离线导入改用官方 storage.getStore('memory').saveMessages，保留历史原始空白与字面标记；仍由框架原生消息库持久化，不操作内部 SQL 表。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
