# studio/
> L2 | 父级: ../CLAUDE.md

新形态的产品领域：主题是基本单元，材料在全局资料库、主题只引用，产出写在主题的白板上而不是对话里。产品合同在主检出的 `doc/studio/model.md`（规则 R1–R15），本模块只落存储与 HTTP；消息、运行、挂起仍归 Mastra。

- `types.ts`：主题、资料、主题材料、白板、区块、出处、版本与写入来路的纯类型，服务与桌面共用。
- `errors.ts`：`StudioError`，带 HTTP 状态的中文错误；同一句话既给人看，也作为白板工具的拒绝文本给模型看，所以要写清下一步。
- `content.ts`：区块内容合同唯一真源（text/ladder/table/widget 的 zod 形状、大小上限、出处形状）与一句话摘要；存储写入前校验，AI 工具复用同一形状。
- `db.ts`：在 `catalog.sqlite` 建 studio 表（与阅读游标同文件，不碰 `mastra.sqlite`），外键开启；`transaction` 是同步立即事务；旧库缺的列（资料的作者/年份/arXiv 编号/标题来源）启动时按 `PRAGMA table_info` 补加，只加列不改数据。
- `board.ts`：白板唯一写入口（R4）。画/改/取代都在单个事务里裁决容量（R11，只数 current）、`rev` 乐观并发、出处边界（R15：只认本主题引用的材料与本主题的对话）；服务端三列自动排版，`near` 只选列；`pendingSheets(threadId)`（自该对话上个版本以来改过的白板，挂起续跑换 runId 也不丢）+ `writeVersion` 给「每次运行一个版本」（R7）。
- `topics.ts`：主题增改（新主题同事务建第一张进行中白板）与主题引用：引用/取消引用/阅读进度/被当前区块引用数。取消引用不动区块（R10）。
- `library.ts`：全局资料库。按 sha256 去重（并发同内容由唯一约束裁决），原件落 `library/<id>/` 后 chmod 0400；链接收入时 PDF 存原件，网页存抽出的正文与来源 URL；arXiv 任何写法都取 `arxiv.org/pdf/<id>` 存 PDF、出处记摘要页，标题按 `resolveTitle`（给定 → API → PDF 信息 → 首页大字 → 文件名）；`location` 给原生「系统打开」核对后的真实路径（只认 `library/<id>/` 下的普通文件）；`refresh`/`replaceOriginal` 只给补取用。
- `titles.ts`：标题回退链里与 PDF 有关的纯规则：清洗（空白/`[编号] `前缀/≤200 字）、Info Title 排除（空、乱码、文件名、软件名）、首页最大字号横排行；`TITLE_RANK` 让补取只升不降。
- `backfill.ts`：显式补取命令（不在启动时跑）：先出计划，再 VACUUM INTO 备份 catalog 与受影响的 `library/<id>/` 并写 SHA256 清单，最后按同一条目换原件/重算标题；对正式数据须先经负责人确认。
- `studio.ts`：一条 catalog 连接上组合三个存储（也暴露连接给补取备份）；server 与之后的白板工具共用同一实例。
- `tools.ts`：资料库访问边界（R15）：`createMaterialAccess`（研究网络必传，arXiv 收入用） 只放行受信会话所在主题引用的条目（未引用/不存在/越界同一句 404），PDF 分页缓存按 sha256；list_materials/read_material（按页或偏移读，推进阅读进度）；`intake` 供研究工具 to_library 收入并引用，arXiv 链接一律收 PDF（已取到的字节直接复用）。
- `board-tools.ts`：AI 写白板的唯一通道：board_view（专家也有）/board_draw/board_update/board_supersede，主题与运行从受信主会话推出；`topicState` 每次请求注入主题现状（白板每块一行 + 引用材料），按估算 token 硬上限 1500、新的优先，超出提示用 board_view 看全。
- `routes.ts`：认证后的 HTTP。主题（状态灯由 `topicId:` 前缀汇总原生运行/等待）、白板（列表的 writable 在没有进行中的那张时为 null，不报错；GET 带 ETag/304，＋ 新开一张）、资料库（multipart 上传或 JSON 链接，可顺手引用到主题）、原件（ETag=sha256）、原件本机位置（只按条目 id，供原生系统打开）、主题引用增删。**没有区块写接口**：P0 白板对人只读。

决策：
- 白板存数据库不存文件：通用文件工具碰不到（R4），容量/rev/版本才能在一个事务里成立。
- 一个主题只有一张接受 AI 写入的白板：`ord` 最大的那张 `live`；满了拒绝，不自动开新的（换白板要人确认）。
- arXiv 补取在同一条目上换原件：id、主题引用、阅读进度与白板出处都不动；换成的 PDF 若已是另一条目则跳过不合并。
- 区块 ID 短（`b` + 10 位 hex）便于模型回填；主题/白板/资料 ID 用 UUID，主题 ID 满足会话身份 `topicId:taskId` 的 safeId 规则。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
