# research/
> L2 | 父级: ../CLAUDE.md

研究工具直接使用 Mastra ToolExecutionContext，文件操作只走本任务 Workspace。网络和 PDF 引擎不依赖旧 core/runtime；失败抛给框架形成真实失败结果。

- `http.ts`：有大小/时间上限的研究请求，仅 GET 自动重试，取消不重试。
- `records.ts`：论文记录、S2 转换和来源格式化，供检索与引用共用。
- `openalex.ts`：OpenAlex 请求参数与倒排摘要重建。
- `journal-ranks.ts`：沿用期刊分级表；旗舰名称精确匹配，细分/家族关键词按明确规则匹配，避免泛子串遮蔽细分等级。
- `papers.ts`：原生 search_papers/get_citations，返回可引用的结构化论文。
- `web.ts`：原生 fetch_url/search_web，保存失败不得伪报成功。
- `pdf.ts`：真实 unpdf 摄取工作区或开放 URL 的 PDF；本地读取复用 ingestion 的 stat/实际长度/取消边界，save_as 复用只创建新文件合同，保留原始换行与 PDF page 标记并支持分段读取。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
