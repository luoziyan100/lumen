# tools/ — 工具两层

> [PROTOCOL] 成员或职责变更时:先更新本文档,再动代码;新工具必须过下方安全边界,并有真实路径测试(禁 mock 内核)。

职责:给 agent 一个真实的「地面」。两层:

## env/ — L1 环境原语(作用在沙箱工作区)

- `fs-tools.ts` — ENV_TOOLS:read_file / write_file / edit_file / list_dir / grep / glob
  「文件系统即上下文」:agent 把正文写成文件,回头 grep / 分段重读,不逼模型凭截断摘要作答。
  `resolveToolPath` 兼容 `file_name`/`filename`;缺 path 必须 error,禁写成字面量 `undefined`。
- `run-code.ts` — runCodeTool:在当前会话工作区跑 node/python(cwd 锁工作区/60s 超时/输出上限/命令进事件流)。
- `sandbox.ts` — Seatbelt profile(macOS):allow-default + 精准 deny(网络全禁/写限工作区);
  读禁 ~/.ssh 等 + `~/.lumen/agent-service.json|settings.json`(勿整树 deny `.lumen`——工作区在其下,node 会 lstat 父目录);
  Skills/`workspaces` allow-read;写 skills 仍被禁。
  非 macOS 退化为仅 L1 进程纪律。**改 profile 必跑 tests/workspace/run-code.test.ts(含 ~/.lumen/workspaces 生产路径回归) + tests/runtime/skills.test.ts。**
- `image-store.ts` — 任务级图片侧车 + `[[image:img-N]]` 占位符;`stripImagesForModel` 供 DeepSeek 路径去 image_url
- `vision-tools.ts` — `look_at_image`(硅基 VL);`withImageSanitize` ModelPort 包装;env:`LUMEN_VISION_*`
- `todo-tools.ts` — `todo_write`(+`update_plan` 兼容):会话 Todo;回灌线程 + `drafts/todo.md`(见 `doc/todo.md`)
- `plan-tools.ts` — 薄再导出(兼容旧 import)
- `ask-user-tools.ts` — `ask_user`:挂起 turn 问用户 1–3 题;runtime pending + WS `answer_user` 解开;不套 withGuard(见 `doc/ask-user.md`)
- `memory-tools.ts` — read_memory / write_memory(由 runtime 按项目注入,不在 ENV_TOOLS 常量里)
- `skill-tools.ts` — `run_skill`(启动工作流;由 runtime 注入;`≠` read_memory)

## ingest/ — 摄取解析(模式 A,见 `doc/document-ingest.md`)

- `docx.ts` / `index.ts` — OOXML→文本;上传时由 `saveUpload` 写出 `docs/<stem>.md`

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
