/**
 * [INPUT]: ingest/docx
 * [OUTPUT]: extractDocxText / docxExtractMarkdown
 * [POS]: 摄取解析入口;见 doc/document-ingest.md
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
export { extractDocxText, docxExtractMarkdown } from './docx.ts'
