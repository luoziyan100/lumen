# ingest/ — 摄取解析（模式 A）

> L2 | 父级: `packages/agent-service/src/tools/CLAUDE.md`
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

复合格式上传时抽成可 `read_file` 的文本。见 `doc/document-ingest.md`。

## 成员

- `docx.ts` — OOXML ZIP→纯文本/抽出 Markdown；零第三方依赖
- `index.ts` — 再导出

法则: 成员完整·一行一文件·父级链接
