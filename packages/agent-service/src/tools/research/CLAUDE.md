# research/ — L2 研究桥接

> L2 | 父级: `packages/agent-service/src/tools/CLAUDE.md`
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

把外部世界灌进工作区。工具各住自己的文件;共享地基不属于任何单元。
`search_web` 只由 `registry.ts` 接入,删除该文件后编译只应再改 registry。

## 工具 → 文件

| 工具 | 文件 | 工厂 |
|---|---|---|
| `search_web` | `search-web.ts` | `createSearchWebTool` |
| `fetch_url` | `fetch-url.ts` | `createFetchUrlTool` |
| `search_papers` | `papers.ts` | `createPaperTools` |
| `get_citations` | `papers.ts` | `createPaperTools` |
| `extract_pdf` | `pdf.ts` | `createPdfTools` |

## 成员

- `index.ts` — `createResearchTools`:测试拼装 papers / fetch_url / pdf,**不含** search_web
- `search-web.ts` — `search_web` + Tavily 后端。可独立删除
- `fetch-url.ts` — `fetch_url` + `htmlToText`。不依赖 Tavily
- `sources-reminder.ts` — 成功回灌 REMINDER 共享句(fetch/search 共用,防措辞漂移)
- `papers.ts` — `search_papers`(OpenAlex) / `get_citations`(S2)
- `pdf.ts` / `pdf-engine.ts` — `extract_pdf`
- `http.ts` / `openalex.ts` / `journal-ranks.ts` — 共享网络缝与数据源,不是工具

法则: 成员完整·一行一文件·父级链接
