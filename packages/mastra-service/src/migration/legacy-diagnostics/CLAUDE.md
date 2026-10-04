# legacy-diagnostics/
> L2 | 父级: ../CLAUDE.md

旧执行证据仅作只读档案浏览。当前目录先授权项目/会话，迁移清单再将其映射回 source task；旧 SQLite 只在校验后的临时副本打开，不恢复旧运行时。

- `types.ts`：历史记录、完整性状态与分页/详情合同，明确 legacy-v1、readOnly。
- `archive.ts`：有界清单、路径与哈希校验；复制旧 DB/WAL/SHM 后查询并清理临时目录。
- `reader.ts`：按源 task 限定记录，核对不可变 blob，当前凭证脱敏后返回摘要或正文。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
