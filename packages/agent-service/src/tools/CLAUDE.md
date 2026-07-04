# tools/ — 工具两层

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;新工具必须过下方安全边界,并有真实路径测试(禁 mock 内核)。

职责:给 agent 一个真实的「地面」。两层:

## env/ — L1 环境原语(作用在沙箱工作区)

- `fs-tools.ts` — ENV_TOOLS:read_file / write_file / edit_file / list_dir / grep / glob
  「文件系统即上下文」:agent 把正文写成文件,回头 grep / 分段重读,不逼模型凭截断摘要作答。

## research/ — L2 研究桥接(把外部世界灌进工作区)

- `index.ts` — createResearchTools:组装 search_papers / get_citations / fetch_url / search_web / extract_pdf
- `openalex.ts` — OpenAlex 检索(search_papers 主源,免 key)
- `papers.ts` — Semantic Scholar Graph(citations 等)
- `web.ts` — htmlToText + fetch_url / search_web(Tavily)
- `pdf.ts` / `pdf-engine.ts` — extract_pdf(unpdf 引擎,bytes→正文)
- `http.ts` — 可注入 HTTP 客户端(退避重试;测试注入罐装响应的唯一网络缝)
- `journal-ranks.ts` — 期刊分级数据资产(排序用,可扩充)

## 安全边界(硬约束)

- fs 原语只能读写工作区,拒 `..` / 符号链接逃逸(由 workspace/ 强制);**fs 原语一律不许联网**。
- 网络只走 research/ 受审桥接:key 走 env、限流与 UA 集中在 http.ts。
- 所有工具接 AbortSignal;大结果落工作区文件,线程里给路径与预览。
- M10 教训别回退:grep 对文件路径不吞错、命中带 charOffset、read_file 支持 offset/limit 分段读、extract_pdf 引导读全文。
