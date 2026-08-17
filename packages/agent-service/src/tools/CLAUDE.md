# tools/ — 工具两层

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;新工具必须过下方安全边界,并有真实路径测试(禁 mock 内核)。

职责:给 agent 一个真实的「地面」。两层 + 一张目录。单元 = 一起生死的最小集合(宪章第 4 条)。

## 目录(存在性唯一真源)

- `registry.ts` — `buildStaticTools`(进程启动一次,withGuard) + `buildTaskTools`(每次 execute);
  顶部注释列全量工具名。demo 剔除 `run_code`。`ask_user` 不套 150s guard。
  研究四件(`search_papers`/`fetch_url`/`search_web`/`extract_pdf`)在本文件接入;`search_web` 只在这里 import。
  `withResultPersist` / 旧 `spawnTool` 是可用性装饰,留在 runtime。
  service 与 runtime.execute **只调用这里**,禁止第二处拼装。

## env/ — L1 环境原语

成员见 `env/CLAUDE.md`。

## ingest/ — 摄取解析(模式 A,见 `doc/document-ingest.md`)

- `docx.ts` / `index.ts` — OOXML→文本;上传时由 `saveUpload` 写出 `docs/<stem>.md`

## research/ — L2 研究桥接

成员见 `research/CLAUDE.md`。共享地基留在 research/ 根;工具各住自己的文件。

## 安全边界(硬约束)

- fs 原语只能读写工作区,拒 `..` / 符号链接逃逸(由 workspace/ 强制);**fs 原语一律不许联网**。
- 网络只走 research/ 受审桥接:key 走 env、限流与 UA 集中在 http.ts。
- 所有工具接 AbortSignal;大结果落工作区文件,线程里给路径与预览。
- M10 教训别回退:grep 对文件路径不吞错、命中带 charOffset、read_file 支持 offset/limit 分段读、extract_pdf 引导读全文。
