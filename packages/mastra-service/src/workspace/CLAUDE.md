# workspace/
> L2 | 父级: ../CLAUDE.md

主题工作区（`topics/<id>/work`，同主题所有对话共用）和两层事实记忆（主题 `topics/<id>/memory`、关于用户 `memory/`）使用独立 contained LocalFilesystem 定根，不通过软链扩大路径能力。资料库不挂进文件系统，只经 `studio/tools.ts` 按主题引用读取（R15）。

- `workspace.ts`：主题 Workspace 与记忆文件系统工厂；每个根独立 containment。
- `memory.ts`：两层事实记忆（scope=topic/you）的原生工具与有界索引读取；模型接收普通字符串和文件名说明，Unicode 正则与路径约束只在本地验证，避免供应商拒绝无法携带正则标志的 JSON Schema；文件为单一真源，不另建对话存储。
- `native-file.ts`：已授权根内文件的本机位置，规范化后再次限制路径和普通文件，供桌面系统打开且保留相对资源。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
