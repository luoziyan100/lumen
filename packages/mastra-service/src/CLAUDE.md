# src/
> L2 | 父级: ../CLAUDE.md

新应用实现目录；旧运行时不参与生产依赖。

- `application.ts`：组合 AgentController、Memory、studio 存储与按主题共享的 Workspace（关闭时每主题只销毁一次）；白板工具接主 Agent（专家只给 board_view），主题现状经指令注入，运行结束（非挂起，含停止/出错）给改过的白板写版本；R1 一主题一运行由 `admitRun`（同步段预留 + 实时运行/等待投影）裁决，新开对话用 `assertTopicIdle`；资料库工具只经受信会话推出的主题引用；全局一组专家按角色能力与独立调用目录隔离，关闭先排空父子输出和诊断评估；诊断仅取得当前模型快照，不继承研究工具或工作区；原生threadState恢复清单展示，持久挂起阻止模型切换。
- `model.ts`：本地档案到 SDK Gateway 的配置边界，模型网络通过 SDK 执行。
- `permissions.ts`：主 Agent 工具权限类别唯一真源与 Controller 内建工具单独放行名单；未登记工具落入 other，不被默认放行。

- `drain.ts`：按受信 Controller 的父任务 resourceId 等待主/子模型输出持久化，使停止先排空再取消快照；关闭时排空全部运行，单任务停止不等待其他会话。
- Error responses (i18n I6): every product error carries a stable `code` (and `params` when the text has values) next to the Chinese `error`; the error classes (`StudioError`, settings/catalog/diagnostics errors) take the code as a constructor argument. Codes live only in `http/error-codes.ts`. Model-facing text is unchanged.
- `server.ts`：认证保护的官方 HTTP/SSE 与产品入口；模型/角色/资料共用配置写锁，运行/待答时拒绝修改，资料库上传进 `/lumen/library` 并可引用到主题，主题会话经 `/lumen/topics/:id/sessions` 建立；请求超限明确返回 413（code `upload.too_large`, params `{ limit }`），残缺附件包返回可重试的 400，未知错误仅在服务日志记录脱敏原因，不记录请求正文或凭证。
- 模型设置：保存期间暂停新执行请求，已有研究或待回答问题拒绝热切换；版本化网关避免同名模型复用旧地址缓存。新会话自动恢复原生待回答问题与待审批卡(批准走官方路由的持久审批分支)；用户停止持久取消，退出应用保留。

- `config.ts`：只读解析当前有效模型档案，凭证不进入日志或迁移输出。
- `start.ts`：显式隔离目录中的本机服务；拒绝旧形态数据根（~/.lumen、~/.lumen-mastra），持有内核独占锁后开放存储，原子发布私有 discovery，信号触发排空并释放所有权。

- `research/`：论文检索、引用、网页和 PDF 原生工具；网络与领域解析不依赖旧内核。
- `ingestion/`：有界 DOCX 正文和真实图像摄取；图片像素只进入当前模型请求，持久消息和事件保留文件引用。
- `http/`：限制原生框架路由与任务身份，使 HTTP 请求始终进入产品管理的会话与工作区。
- `lifecycle/`：在明确持有数据根独占权的启动边界结算崩溃遗留子任务，不重新执行模型或工具。

- `catalog/`：主题下会话的原生 Mastra thread 目录（主题本身在 studio/），提供标题、置顶、归档、分页和独立已读消息游标；消息与运行状态仍由框架持有。

- `studio/`：新形态领域（主题、全局资料库与主题引用、白板/区块/版本）的存储与 HTTP，以及只认主题引用的 list_materials/read_material；白板只经它写入，容量、rev 与出处边界在单事务里裁决。

- `settings/`：独立数据根中的模型档案与研究偏好，公开脱敏视图、服务内部网关配置和显式一次性导入。

- `deployment/`：显式 Node 24/工程/数据根的隔离 LaunchAgent，私有发现与日志、内核独占启动及认证就绪等待；不管理旧服务。

- `skills/`：用户层 `<数据根>/skills` 的发现、激活与安装；工具、HTTP 与执行只读根共用同一实时 registry。

- `execution/`：当前任务的 Node/Python 自动沙箱执行，按任务实时解析已安装技能只读根，保留 Seatbelt、域名代理、进程组取消与有限输出；显式 ask/deny 不被默认权限覆盖。
- `diagnostics/`：原生 trace 的采集、授权读取、脱敏标注与完整性导出；框架观测不冒充完整副作用审计。
- `agents/`：研究人格(v2 信念分层)与专家职责；能力合同随原生工具更新。
- `workspace/`：主题工作区与两层事实记忆（主题 topic / 关于用户 you）的原生文件系统挂载与工具。

application 组合父子共享预算及稳定专家历史；预算按会话 opaque model ID 读取冻结的计价/上下文窗口快照，避免忙会话模型切换污染旧步骤；liveSessionStates 从当前 Controller、原生后台任务和持久挂起运行投影运行/等待状态，不为历史任务创建会话；未打开会话的挂起同样挡配置写闸(有意：恢复后不能换配置)，因此必须在目录里显示为等待，界面才能解释 409。server 暴露已授权的专家继续/预算入口并把状态投影接入目录。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
