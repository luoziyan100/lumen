# tests/
> L2 | 父级: ../CLAUDE.md

P0 预注册：工具结果必须进入下一轮模型请求；两个会话不串上下文；消息落盘后重开可读；子 Agent 使用受限工具；取消可以结束运行；未知副作用不得自动重试。基础场景已执行；未知副作用与硬崩溃恢复待验证。

- `application.test.ts`：真实循环的文件写入/回灌、会话隔离、存储重开、路径安全、只读子代与取消中关闭验证。
- `workspace.test.ts`：项目资料跨任务可见、项目记忆进入模型、复制到任务后修改不影响原件，以及跨项目/软链拒绝；模型请求不带 Unicode 正则 pattern，本地仍接受中文记忆名并拒绝越界路径。
- `provider-fixture.ts`：在 HTTP 边界提供确定性 OpenAI 线格式，用于框架机制实验；不是实录 fixture。

- `http.test.ts`：官方客户端经真实本机 HTTP/SSE 完成执行和持久消息补取；超限附件返回 413、残缺附件包返回 400，两者均不落盘且保留先前成功材料。

- `background.test.ts`：原生后台子代理的单子取消与父运行独立性。

- `collaboration.test.ts`：产品 HTTP 控制双会话后台子代，核对子任务归属与独立取消。

- `research.test.ts`：真实 PDF 引擎抽取、研究工具回灌和带来源文件产物。
- `ingestion.test.ts`：真实 DOCX 解压/解析与图片像素进入模型的循环，验证格式、体积、权限、取消和事件无 base64。
- `diagnostics.test.ts`：真实原生 trace、凭证脱敏、问题标注与离线完整性；真实专家委派后父记录仍可读，异资源跨度及其重绑定后代明确省略。
- `diagnostic-evaluation.test.ts`：真实 Controller 录制经独立 Agent 回放；验证无新模型网络/真实工具/文件/正式消息副作用，live 无工具、缺证据拒绝、脱敏、编辑失效与关闭取消；真实Error/AbortError及审批恢复录制验证下一轮模型收到原生错误结果，失败不变成功。
- `legacy-diagnostics.test.ts`：真实临时 legacy-v1 SQLite/WAL/SHM 与 exec-evidence 浏览；验证 source task 映射、只读源库、SHA256/缺失状态及当前凭证脱敏。

- `skills-upload.test.ts`：完整目录经产品HTTP安装、脚本执行位/二进制资源保留、非法覆盖保护，以及原生文件位置的任务/路径授权。
- `skills.test.ts`：真实临时目录的发现优先级、显式激活、资源读取、安装覆盖与路径边界，并验证原生工具结果回灌。
- `native-routes.test.ts`：真实 HTTP/SDK 验证固定任务身份，拒绝 resource 重绑定、scope 旁路和跨任务读取；纯历史读取不创建 Session、不改 thread 排序与消息。
- `lifecycle/`：真实子进程 SIGKILL 与 LibSQL 重开，验证遗留子任务结算及消息保留。
- `migration/`：合成旧 WAL 数据根的一次性导入演练，验证消息/材料/原始来源保留、幂等和源目录不变。
- `catalog/`：外部资料绑定/只读访问/运行限制/缓存通知，以及实际消息未读游标/迟到确认/重开；内部历史时间恢复对公共 HTTP 隔离。
- `deployment/`：替换 launchctl 调度、保留真实子进程/内核锁/HTTP，验证私有部署就绪、重启卸载、崩溃恢复及所有权拒绝；不调用真实 launchctl。

- `catalog.test.ts`：真实项目 SQLite 与 Mastra Memory 重开、项目归属、元数据与分页；原生审批和挂起状态经 HTTP 快照恢复。

- `settings.test.ts`：真实临时目录中的多模型档案、掩码密钥更新、显式旧设置导入、串行保存与磁盘失败保留。
- `settings-runtime.test.ts`：空配置启动、实际模型热切换、重启后尚未打开的待答研究也阻止变更，停止后清空密钥不回退旧凭证。
- `settings-http.test.ts`：公开设置响应脱敏、非法输入不落盘、保存前运行限制及保存后通知顺序。
- `settings-models.test.ts`：真实 Mastra 缓存下验证同名模型切换 endpoint；模拟 SSE 流前上游错误到成功的有限重试，并确认正文/工具增量后不重发请求。

- `execution/`：真实 macOS 子进程和网络代理验证任务隔离、超时/取消、输出限额、自动执行与失败回灌；正式组合不自动批准事件，覆盖技能安装/脚本/资源、来源校验和显式拒绝。
- `agents/`：真实委派的角色权限/独立产物，以及长上下文输入裁剪、工具配对与历史保留。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
