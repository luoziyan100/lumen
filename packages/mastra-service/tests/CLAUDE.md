# tests/
> L2 | 父级: ../CLAUDE.md

P0 预注册：工具结果必须进入下一轮模型请求；两个会话不串上下文；消息落盘后重开可读；子 Agent 使用受限工具；取消可以结束运行；未知副作用不得自动重试。基础场景已执行；未知副作用与硬崩溃恢复待验证。

- `application.test.ts`：真实循环的文件写入/回灌、会话隔离、存储重开、路径安全、只读子代与取消中关闭验证。
- `workspace.test.ts`：同主题对话共享主题工作区、两层记忆（主题/关于用户）进入模型、资料库只经主题引用可读（R15），以及跨主题/软链拒绝；模型请求不带 Unicode 正则 pattern，本地仍接受中文记忆名并拒绝越界路径；MEMORY.md 不可读时研究照常运行且模型收到如实说明。
- `topic-fixture.ts`：经真实 TopicStore 按指定 id 建主题，供以主题身份开会话的测试复用。
- `provider-fixture.ts`：在 HTTP 边界提供确定性 OpenAI 线格式（单轮可返回多个工具调用），用于框架机制实验；不是实录 fixture。

- `http.test.ts`：官方客户端经真实本机 HTTP/SSE 完成执行和持久消息补取；超限附件返回 413、残缺附件包返回 400，两者均不落盘且保留先前成功材料。

- `background.test.ts`：原生后台子代理的单子取消与父运行独立性。
- `persona.test.ts`：完整应用主 Agent 实际 system 提示包含完整画图规则与白板草稿纸信念/白板工具，与界面主题颜色裁决镜像。
- `permissions.test.ts`：完整应用主 Agent 实际请求中的每个工具都有权限类别或单独放行，防止漏登记触发人工审批。
- `tool-pairing.test.ts`：并行后台委派后持久历史与下一轮实际请求的 toolCallId 唯一且配对；裸 Agent、纯原生 Controller 与完整应用均验证（1.67.0 重复 id 缺陷已随 1.82.0 关闭）；子专家 workspace 元数据进入父线程为 todo 子用例（台账 F2）。

- `collaboration.test.ts`：产品 HTTP 控制双会话后台子代，核对子任务归属与独立取消。

- `research.test.ts`：真实 PDF 引擎抽取、研究工具回灌和带来源文件产物。
- `ingestion.test.ts`：真实 DOCX 解压/解析与图片像素进入模型的循环，验证格式、体积、权限、取消和事件无 base64。
- `diagnostics.test.ts`：真实原生 trace、凭证脱敏、问题标注与离线完整性；真实专家委派后父记录仍可读，异资源跨度及其重绑定后代明确省略。
- `diagnostic-evaluation.test.ts`：真实 Controller 录制经独立 Agent 回放；验证无新模型网络/真实工具/文件/正式消息副作用，live 无工具、缺证据拒绝、脱敏、编辑失效与关闭取消；真实Error/AbortError及审批恢复录制验证下一轮模型收到原生错误结果，失败不变成功。

- `skills-upload.test.ts`：完整目录经产品HTTP安装、脚本执行位/二进制资源保留、非法覆盖保护，以及原生文件位置的任务/路径授权。
- `skills.test.ts`：真实临时目录的发现优先级、显式激活、资源读取、安装覆盖与路径边界，未知技能报错给出可用名单并把 agent-* 指向专家委派，并验证原生工具结果回灌。
- `native-routes.test.ts`：真实 HTTP/SDK 验证固定任务身份，拒绝 resource 重绑定、scope 旁路和跨任务读取；纯历史读取不创建 Session、不改 thread 排序与消息。
- `lifecycle/`：真实子进程 SIGKILL 与 LibSQL 重开，验证遗留子任务结算及消息保留。
- `catalog/`：实际消息未读游标/迟到确认/重开。
- `studio/`：主题/资料库/白板存储与 HTTP、启动接线，`board-tools.test.ts` 的白板工具 × 真实 Controller（两块 + 一个版本、第二段对话请求带摘要且守上限、专家只有 board_view、R4 文件碰不到白板、R1 409 含等待用户/继续专家/并发准入、R8 停下无半块且写版本），以及 `materials.test.ts` 的资料库工具边界（R15、to_library、按页读、库内图片像素、只读专家 schema、主题工作区共享与单次销毁）；`board-target.test.ts` covers R16 (selection round trip and fallback, a run fixed to the selected sheet while the user switches, a background expert's board_view after the parent run ended captures nothing, through an approval wait and an ask_user suspension each with a restart, folded target refused, no selection → newest live sheet, revised R11 text (P1-1：写满拒绝点名 sediment_invite), edits to other sheets refused, R7 versions only the target)；`board-delete.test.ts` covers R17 (empty delete, confirmation 409 with the count, one transaction proven by an injected failure, foreign/missing 404, the target of a running run and of an approval wait — also after a restart before the session reopens — refused and allowed after the run, stale and racing target rows, neighbour selection next/previous/none, last sheet then ＋, the next run after deleting the selected sheet, the block lookup for cards, no delete tool)；`library-titles.test.ts` 的 arXiv 识别表、API 解析/超时、标题清洗与回退链、旧库补列、补取（计划/换原件/幂等/只升不降/重复跳过、API 请求间隔）与原件位置拒绝（软链/越界/非普通文件），`arxiv-http.test.ts` 的真实 HTTP 链接入库（各写法收 PDF、去重、API 失败回退）、模型工具 to_library 收 arXiv、旧库升级，以及迁移只归服务启动（补取命令子进程遇未迁移旧库拒绝且不改表、新服务首启补列再启幂等）；`library-fixtures.ts` 造带 Info/首页字号的 PDF 与 Atom；`sediment.test.ts` covers P1-1 的服务端机制（条目只经 HTTP 建/改删与修订行；只删不改的中英校验与被删片段、拒改字/补字/换序/拼接/跨主题；sediment_quote 绑定最新命中并拒拼接/助手的话/别线程；确认按留下/放回计数、丢弃不计、习惯段进指令且可经 HTTP 删；settled 同事务占格子删释、AI 拒改拒取代、rev 冲突；邀请只指本轮目标、最新覆盖、不写条目；R17 删板保条目并带 settled 数、链接标删；topicState 带沉淀守上限；运行中可写条目、不碰沉淀不留痕）；`persona.test.ts` 锁沉淀信念（写满停笔→指块→一问→等、只删口癖、settled 不动）。 `reading-question.test.ts` splits a reading question into quote, place and words (G1, service half); `reading.test.ts` covers P1-2 (S1–S3) and G1 (sediment_quote refuses a reading question's quote, whole or part, and binds the person's words from the same message with original = the words only): reading_write appends and replaces by id and reads back over HTTP in order with ETag/304; an unknown section id is refused with the next step; reading_view gives ids and sources; R15 gives read_material's sentence and stores nothing; quotes are checked on the cited page of a multi-page PDF (wrong page, whitespace differences pass, too short, page missing or past the end) and in the text of a material without pages; the three caps and the 13th section; the writing thread and run are stamped; and R1's readable 409 for a second conversation's message while the topic runs, with nothing stored. `library-fixtures.ts` also builds multi-page PDFs (`pagedPdf`). `persona.test.ts` also locks the reading belief (section by section, sources, inference marked, what the paper does not show, quotes in the original language, short answers about one sentence, no board unless asked, no quizzing, quotes are not the user's words) and the two reading tools with titles carrying no ordinal.
- `studio/`：新形态存储与 HTTP——主题自带白板、资料库 sha256 去重与只读落盘、引用与进度、容量拒绝（R11）、rev 冲突、出处边界（R15）、取消引用不动区块（R10）、失败不留半块、按运行写版本；真实服务的 ETag/上传/链接；真实 start.ts 子进程的设置导入不泄凭证与旧形态数据根拒绝。
- `deployment/`：替换 launchctl 调度、保留真实子进程/内核锁/HTTP，验证私有部署就绪、重启卸载、崩溃恢复、所有权拒绝及不接管旧 label/旧形态数据根；不调用真实 launchctl。

- `catalog.test.ts`：真实 catalog.sqlite 主题与 Mastra Memory 重开、主题归属（未知 404/归档 409）、元数据与分页；原生审批和挂起状态经 HTTP 快照恢复。

- `settings.test.ts`：真实临时目录中的多模型档案、掩码密钥更新、显式旧设置导入、串行保存与磁盘失败保留。
- `approval-restore.test.ts`：待审批研究在服务重启后重新出现审批卡，经官方 tool-approval 路由批准后继续执行、写出文件并解除配置写闸。
- `settings-runtime.test.ts`：空配置启动、实际模型热切换、重启后尚未打开的待答研究也阻止变更，停止后清空密钥不回退旧凭证。
- `settings-http.test.ts`：公开设置响应脱敏、非法输入不落盘、保存前运行限制及保存后通知顺序。
- `settings-models.test.ts`：真实 Mastra 缓存下验证同名模型切换 endpoint；模拟 SSE 流前上游错误到成功的有限重试，并确认正文/工具增量后不重发请求。

- `execution/`：真实 macOS 子进程和网络代理验证任务隔离、超时/取消、输出限额、自动执行与失败回灌；正式组合不自动批准事件，覆盖技能安装/脚本/资源、来源校验和显式拒绝。
- `agents/`：真实委派的角色权限/独立产物，以及长上下文输入裁剪、工具配对与历史保留。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
