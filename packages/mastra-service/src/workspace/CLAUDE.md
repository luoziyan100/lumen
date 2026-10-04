# workspace/
> L2 | 父级: ../CLAUDE.md

任务产物、项目资料和跨会话记忆使用独立 contained LocalFilesystem 定根，不通过软链扩大路径能力。锁定框架的 CompositeFilesystem 不支持根挂载回退，不能让现有任务相对路径隐式落到项目目录。

- `workspace.ts`：任务 Workspace 与显式项目范围文件系统工厂；每个根独立 containment。
- `memory.ts`：项目事实记忆的原生工具与有界索引读取；模型接收普通字符串和文件名说明，Unicode 正则与路径约束只在本地验证，避免供应商拒绝无法携带正则标志的 JSON Schema；文件为单一真源，不另建对话存储。
- `shared.ts`：项目资料的列举/读取，以及主 Agent 将原件复制到任务解析；共享原件只读。
- `source.ts`：显式外部根的读取/设置/移除及 sourcePath 访问校验；元文件私有原子写，拒绝链接，不复制或修改外部原件；已失效路径仍可管理，实际访问拒绝隐式重绑。
- `cache.ts`：重绑时先清除 source 的两种访问视图，再释放旧文件系统；其他项目、共享材料和记忆缓存保持独立。
- `native-file.ts`：已授权根内文件的本机位置，规范化后再次限制路径和普通文件，供桌面系统打开且保留相对资源。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
