# research/ — L2 研究桥接

> L2 | 父级: `packages/agent-service/src/tools/CLAUDE.md`
> [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md

把外部世界灌进工作区。5 个 Tool,8 个文件:3 个工厂 + 共享 HTTP/数据源 + 一个空壳组装器。
`ls` 看不到 `search_web`——它住在 `web.ts`,和 `fetch_url` 挤在一起。先查下表,再开文件。

## 工具 → 文件

| 工具 | 文件 | 工厂 |
|---|---|---|
| `search_web` | `web.ts` | `createWebTools` |
| `fetch_url` | `web.ts` | `createWebTools` |
| `search_papers` | `papers.ts` | `createPaperTools` |
| `get_citations` | `papers.ts` | `createPaperTools` |
| `extract_pdf` | `pdf.ts` | `createPdfTools` |

`index.ts` 的 `createResearchTools` 只拼这三家,不实现工具。组装发生在 `service.ts`(注入 Tavily / unpdf);`runtime.execute()` 不再碰 research。

## 成员

- `index.ts` — 组装器 + 再导出。空壳,不是工具目录。
- `web.ts` — `fetch_url`(HTML→正文) + `search_web`(Tavily,可注入后端) + `htmlToText`。description 学 Claude 方法(做什么/何时用与兄弟/结果/Sources 回指 persona 作品合同/用法/参数 description);成功 llmContent 末附一句 REMINDER。不另立法、不写「列出所有搜索 URL」。
- `papers.ts` — `search_papers`(OpenAlex 主源) + `get_citations`(S2 Graph)。同上方法;Sources 只回指「几篇论文几条」。
- `pdf.ts` / `pdf-engine.ts` — `extract_pdf`;引擎可注入,生产 `createUnpdfEngine`。description 写清何时用 vs `fetch_url`;Sources 不另立法。
- `http.ts` — 可注入 HTTP(退避重试 + UA)。测试灌罐装响应的唯一网络缝;三家工厂共用,不要按工具复制。
- `openalex.ts` — `search_papers` 的 URL/解析。不是工具。
- `journal-ranks.ts` — 期刊分级数据资产(排序用)。不是工具。

法则: 成员完整·一行一文件·父级链接
