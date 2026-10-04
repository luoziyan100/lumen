# Lumen 测试合同追踪矩阵

状态: 2026-09-09-remain65；测试体系候选 `test-system-v1-gov-remain65-2026-09-09`；实现候选 `governance-impl-remain65-2026-09-09`。`test-system-v1-gov-remain64-2026-09-09` 及更早 test-system-v1-* 已作废。只登记测试入口与缺口，不宣称 F01–F24 通过，不把 `npm run verify` 绿测升格为 `accepted`。缺陷完整字段以 [`testing-defects.md`](testing-defects.md) 为准。绑定清单 [`testing-manifest.json`](testing-manifest.json)；历史 unbound [`testing-historical-ids.json`](testing-historical-ids.json)。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

宪法与门禁见 [`测试体系-总合同-2026-09-08.md`](测试体系-总合同-2026-09-08.md)。行为合同原文见 `briefs/active/governance-loop/执行.md` §4。

## 0. 登记规则

- `candidate_id` 本批绑定行绑定 `test-system-v1-gov-remain65-2026-09-09`；实现候选是 `governance-impl-remain65-2026-09-09`。其余历史行仍 `unbound`。业务 src 脏树不在测试体系哈希内。
- 历史 unbound ID 合法形态与绑定 ID 相同：`AT|CT|RP|IT|UT-<TOKEN>-<NNN>`。不要求出现在测试标题。实体见 `testing-historical-ids.json`（文件 + commit 或 evidence 文档 + sha256）。禁止标 `covered`。
- `owner`：矩阵填写与补测任务归 `executor`；独立验收归 `original-reviewer`。执行者不得改本文件的验收标准。
- `last_verified_at` 仅本批已跑通的 temp-root/Darwin sandbox 行记 `2026-09-09`；跳过环境的 AT 仍空。
- `covered` 仅表示绑定候选上该行为测试已执行并通过，且源码含该 ID；不升格 `accepted`。没有绑定实体的 ID 不得标 `covered`。
- `accepted` 还要求证据、环境与合同语义相符；本文件仍为零。
- 有公开测试但缺组合、原生环境或只覆盖部分不变式 → `partial`。
- 无公开测试、仅源码扫描、环境跳过、或只存在 `/tmp` 探针 → `uncovered`。
- Darwin 用例在非 macOS 必须 `skipped: platform`，跳过不得记通过。
- 本批新增测试名称含稳定 ID。旧 Round 文件名仍只是历史证据。

覆盖性质（`notes` 中标注）：`direct` / `indirect` / `static` / `native` / `uncovered`。

环境取值：`temp-root` | `isolated-home` | `real-webkit` | `launchd` | `installed-app`。

---

## 1. 行为追踪矩阵

公共列省略：`candidate_id=unbound`，`owner=executor`，`last_verified_at=`。

### F01 入站错误边界

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F01-DEC-01 | 非法消息形状只失败该请求 | decode 拒 null/数组/缺 type/坏 JSON | 不抛、不进 handler | 随后合法 list 仍可用 | identity | CT-F01-001, CT-F01-012, CT-F01-013, CT-F01-014, CT-F01-015, CT-F01-016, CT-F01-017 | L2 | `ct-f01-017` 非法 rename_project / archive_project / install_skill / update_bad_case 后 settings 不改、无新 task/项目/skill/bad_case，随后 list 可用 | temp-root | partial | direct；本批新钉 rename_project / archive_project / install_skill / update_bad_case；仍缺 uninstall_skill / activate_skill / archive_task / rename_task / pin_task 及诊断回放写入口等其余写入口全矩阵。禁止标 covered |
| F01-DEC-02 | 非法 UTF-8 不杀进程 | 坏文本帧后另一连接可用 | 该连接失败 | 与 F13 requestId 交错 | identity | CT-F01-002, CT-F01-022 | L3 | `ct-f01-022` createService.start 真实 WS；第一连接 open 后非法 UTF-8 文本帧必须 close/失败；第二根新连接 hello+合法 list 成功；process.pid !== 71847 且 handle 可 close | temp-root | covered | direct；不是只改 CT-F01-002/governance-rework binding；不把非法 JSON/null 当 DEC-02；不升 DEC-01；非整约 accepted |
| F01-PRE-01 | decoder 前传输错误不杀服务 | 坏 request-target 不抛 | 合法 Upgrade 后仍能 list | HTTP/WS 两入口 | identity | CT-F01-003, CT-F01-011 | L2 | `ct-f01-011` 非 Upgrade 残握手 + GET 非根路径后 list | temp-root | covered | direct；本批钉残握手/坏 target，非法 UTF-8 见 F01-DEC-02；非 accepted |
| F01-AUTH-01 | 未认证不得写业务 | 错/无 token WS 4401、HTTP 401 | 磁盘无新上传 | 与 F14 Origin 交叉 | security | CT-F01-004, CT-F01-018 | L3 | `ct-f01-018` createService.start 默认非空 token；POST /upload 错/无 token 401 且数据根无新 upload；WS 错/无 token 4401 不得 hello 无新 task；正确 token 空 Origin POST /upload 不得 401 | temp-root | covered | direct；不是只改 CT-F01-004/batch1 binding；不升 AUTH-02 / HTTP-01 / CONN-01 / DEC-02 / SEC-ORIGIN-TOKEN；非整约 accepted |
| F01-AUTH-02 | 空 token 不得关鉴权 | 显式空 token 仍拒 | 无凭证仍 4401 | 保持性默认鉴权 | security | CT-F01-005, CT-F01-019 | L3 | `ct-f01-019` createService({ token: '' }).start；生成 token 非空；无/空 token WS 4401 不得 hello；POST /upload 无/空 token 401 且数据根无新 upload；生成后的 token 空 Origin POST /upload 不得 401 | temp-root | covered | direct；不是复述 CT-F01-018；不是只改 CT-F01-005/batch1 binding；不升 HTTP-01 / DEC-02 / SEC-ORIGIN-TOKEN；非整约 accepted |
| F01-CONN-01 | handler 错误不终止服务 | 非法帧后随后命令可用 | 该连接失败 | 有效请求继续响应 | lifecycle | CT-F01-006, CT-F01-020 | L3 | `ct-f01-020` createService.start 同连接吞 hello→非法帧 null→rename 空 title 失败→list 同 requestId tasks；第二根新连接 list 成功；进程仍是本测 pid 且 handle 可 close | temp-root | covered | direct；不是只改 CT-F01-006/batch1 binding；不升 DEC-01 / DEC-02；非整约 accepted |
| F01-HTTP-01 | HTTP 错 token 无副作用 | POST /upload 401 | 无新文件 | 与 F21 查询入口 | security | CT-F01-007, CT-F01-021 | L3 | `ct-f01-021` createService.start 默认非空 token；先正确 token 空 Origin POST /upload 写出最小 PDF；GET /pdf 错/无 token 401 且体无 %PDF/已上传字节；错 token POST /upload 401 且写出后快照无新 upload；对照同 path 正确 token GET /pdf 200 含 PDF 字节 | temp-root | covered | direct；不是复述 CT-F01-018/019；不是只改 CT-F01-007/batch1 binding；不升 F21-QRY-02 / DEC-01 / SEC-ORIGIN-TOKEN；非整约 accepted |
| F01-SIDE-01 | 非法载荷不进业务 handler | 非法 update_settings/submit 不写 | 库与磁盘不变 | F13 同 ID 错误 | persistence | CT-F01-008, CT-F01-009, CT-F01-010 | L3 | `ct-f01-009` 全 CLIENT_TYPES WS；`ct-f01-010` 穷尽 HTTP 写入口(仅 POST /upload) | temp-root | covered | direct；现 HTTP 写入口只有 /upload；非 accepted |

### F02 数据根独占

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F02-OWN-01 | 写入前最多一存活持有者 | 第二实例在写入前被拒；dispose 后再开 | 不得双写 | 与 F11 启动失败 | concurrency | CT-F02-001, CT-F02-015 | L3 | `ct-f02-015` 两份真实 createService+start；第二进程写入前 denied；lock/portfile/sqlite 不得双写；close 后再开 | temp-root | covered | direct；本批钉真实第二实例，不是只改 batch2 binding；非整约 accepted |
| F02-OWN-02 | 死锁可回收 | 损坏 pid 不挡新实例 | 活持有者不得被抢 | 三进程窗口 | concurrency | CT-F02-002, CT-F02-016 | L3 | `ct-f02-016` 损坏/死 pid 经 createService.start 回收；活持有者时第三者 start 不得抢；旧观察不得删新锁 | temp-root | covered | direct；本批钉回收与活锁不得抢，取得权走 createService/start；不把 OWN-03 / CON-TRIPLE-RECLAIM 标 covered；非整约 accepted |
| F02-OWN-03 | 回收不得删他人新锁 | 死锁回收后第三者锁仍在 | 过期观察不得删新锁 | 发布/回收交错 | concurrency | CT-F02-003, CT-F02-017 | L3 | `ct-f02-017` 三进程：A 过期观察死锁后 B 经 createService.start 取得；A 随后回收不得删 B 的 inode/pid；另钉 publish 后 reclaim 交叉不得删已发布锁 | temp-root | covered | direct；本批钉三进程过期观察与发布/回收交错，取得权走 createService/start；不把 CON-TRIPLE-RECLAIM 标 covered；非整约 accepted |
| F02-OWN-04 | 活持有者写入后不得被误抢 | 活进程持锁 | 过期观察失败 | SIGKILL vs 活 PID | concurrency | CT-F02-004, CT-F02-018 | L3 | `ct-f02-018` 活 createService.start 已写 lock+portfile+SQLite；过期观察与 try-acquire 不得抢；SIGKILL 该子进程后新 start 才能取得 | temp-root | covered | direct；本批钉写入后与 SIGKILL 对照，不是复述 016 的活着时 denied；非整约 accepted |
| F02-OWN-05 | 完成时换 inode 必须失败且不接管 | 路径换成别人 inode | 不得取得写入权 | 放弃/释放/完成全入口 | concurrency | CT-F02-005, CT-F02-013, CT-F02-019 | L3 | `ct-f02-019` 真实 createService 完成路径换 inode 失败且不接管；第三者 pid/inode 仍在；无 portfile | temp-root | covered | direct；本批钉 createService 完成入口，不是只改 013 binding，也不是直接 new 锁对象；不升 CON-LOCK-SAME-INODE；非整约 accepted |
| F02-OWN-06 | 放弃/释放换 inode 须留第三者 | 放弃或释放时路径被换 | 第三者锁留下 | TOCTOU | concurrency | CT-F02-006, CT-F02-013, CT-F02-020 | L3 | `ct-f02-020` 真实 createService close 释放与 acquire 放弃换 inode 后第三者留下；本实例不得删、不得接管 | temp-root | covered | direct；本批钉 createService 关闭/放弃入口，不是只改 013 binding，也不是复述 019 的 finish；不升 CON-LOCK-SAME-INODE；非整约 accepted |
| F02-OWN-07 | 软链别名不能绕过独占 | 锁路径外指软链 | 不写外文件、不得权 | 发布后换成软链 | security | CT-F02-007, CT-F02-021 | L3 | `ct-f02-021` 真实 createService 遇根外软链失败；完成路径换成软链失败且不接管；根外字节不变；无 portfile；本进程 PID 不写外文件 | temp-root | covered | direct；本批钉 createService 工厂取得权，不是只改 007/round10/12 binding，也不是直接调锁纯函数；不升 SEC-SYMLINK-WRITE / OWN-09..12；非整约 accepted |
| F02-OWN-08 | 硬链出根不得改外文件 | instance.lock 硬链到根外 | 不得权 | 与软链并列 | security | CT-F02-008, CT-F02-022 | L3 | `ct-f02-022` 真实 createService 遇根外硬链失败；根外原文不变；本进程 PID 不得落上该 inode；无 portfile | temp-root | covered | direct；本批钉 createService 工厂取得权，不是只改 008/round13 binding，也不是复述 021 软链；不升 OWN-09..12；非整约 accepted |
| F02-OWN-09 | 发布后打开失败须撤自己 PID | 完整入口 PID 落地后下一次打开失败 | 活着的 A 不得挡 B | F11 发布失败 | concurrency | CT-F02-009, CT-F02-013, CT-F02-023 | L3 | `ct-f02-023` 失败者 createService 仍活；路径不得留其 PID；第二份 createService.start 取得根并写 portfile/SQLite | temp-root | covered | direct；本批钉 createService 工厂取得权与跨进程第二人 start，不是只改 013/round11/12 binding，也不是只调锁纯函数；不升 CON-LOCK-SWAP / OWN-10 / OWN-11；非整约 accepted |
| F02-OWN-10 | 无内核排它锁平台必须失败 | 导出 publish 不得先落活 PID | 不能假装独占 | 跨平台 | persistence | CT-F02-010 | L2 | `round10`/`round13` 无内核互斥 | temp-root | partial | direct；非 Darwin 真平台未测 |
| F02-OWN-11 | unlinkIfSameHolder 不按路径删 | 核对通过也不按路径删 | 安全占位 | 完成/放弃共用 | persistence | CT-F02-011, CT-F02-014 | L2 | `ct-f02-014` 活持有者 × 第二进程 unlinkIfSameHolder | temp-root | covered | direct；真实 FS 竞态，B 不得删 A；非 accepted |
| F02-OWN-12 | 同进程打不开刚发布锁不得留 PID | 发布者仍活 | 第二人仍能取得 | 发布/回收/释放全入口 | concurrency | CT-F02-012, CT-F02-013, CT-F02-024 | L3 | `ct-f02-024` 同进程发布后立即打不开；createService 失败；路径不留本进程 PID；进程仍活；同进程第二次 start 取得并写出 | temp-root | covered | direct；本批钉同进程 createService，不是 023 跨进程第二人，也不是 013 回收不得删活锁；不升 CON-LOCK-SWAP / OWN-10 / OWN-11；非整约 accepted |

### F03 后台排空

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F03-DRN-01 | close 排空后台子代理后再放锁 | 后台 child 结束后放锁 | 未退出不得假装排空 | 父完成 × live child | lifecycle | CT-F03-001, CT-F03-010 | L3 | `ct-f03-010` close 等后台 child 退出；返回前锁仍在；再开必须 start；child 不得仍 running | temp-root | covered | direct；本批钉真实 createService + 第二实例 start；非整约 accepted |
| F03-DRN-02 | 取消主任务须排空未退出子代理 | cancel 等子循环 | 区分取消请求与退出 | cancel × resume | lifecycle | CT-F03-002, CT-F03-011 | L3 | `ct-f03-011` 真实 `runtime.cancel` 排空 child；服务仍可 submit；再开必须 start | temp-root | covered | direct；本批钉 cancel 而非 close；非整约 accepted |
| F03-DRN-03 | complete 摘 live 后 drain 仍等子循环 | 父 complete | 子未退出则继续等 | 父子后台 | lifecycle | CT-F03-003, CT-F03-013 | L3 | `ct-f03-013` 真实 createService 父 done 后 child 仍 live；close/drain 仍等 child；返回前锁仍在；再开必须 start | temp-root | covered | direct；本批钉父已 done 才 close，不是 coordinator 单测，也不是父还 running 的 DRN-01；非整约 accepted |
| F03-DRN-04 | abort-deaf 模型 close 超时且不提前放锁 | shutdown 超时/失败 | 无未处理拒绝 | shutdown × pending model | lifecycle | CT-F03-004, CT-F03-012 | L3 | `ct-f03-012` abort-deaf `close({ timeout })` 必须失败；失败后锁仍在；第二 createService 不得 start | temp-root | covered | direct；本批钉超时失败+锁仍在；非整约 accepted |
| F03-DRN-05 | close 后再开，旧任务不得仍 running | 排空后新实例 | 旧执行不得写库 | 重复关闭 | lifecycle | CT-F03-005, CT-F03-009 | L3 | `ct-f03-009` 第二实例必须 start；旧任务不得 running；新实例可写短任务 | temp-root | covered | direct；本批钉真实 createService A close 后再 start B；非整约 accepted |
| F03-DRN-06 | 关库顺序自洽 | 收尾后关库放锁 | 部分启动失败释放 | F11 启动失败 | lifecycle | CT-F03-006 | L3 | `ct-f03-006` close/监听失败/组装失败放锁 | temp-root | covered | 绑定测试候选；非整约 accepted |
| F03-DRN-07 | 关闭返回后无旧执行发事件 | 关闭完成 | 未处理拒绝为零 | 与 F09 listener | lifecycle | CT-F03-007, CT-F03-008 | L3 | `ct-f03-008` close 后旧 runtime 不得成功 append/submit/continue；listener 不再收到该任务新 event | temp-root | covered | direct；本批钉真实 createService 跑过一轮后 close 封 EventHub；关库后再写失败；非整约 accepted |
| F03-DRN-08 | 父结束 ≠ 子已结束 | 父 done 时子仍可 live | 不得按父 running 判定覆盖 | F10 idle seal | lifecycle | CT-F10-009, CT-F03-014 | L3 | `ct-f03-014` 真实服务父 done 后 hang child 仍 running；sweep/idle-seal 与再 spawn 不得误封 | temp-root | covered | direct；父 done≠child 结束已钉；combo LC-PARENT-LIVE-CHILD 随 CT-F10-018 升 covered；非整约 accepted |

### F04 完成幂等按轮次

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F04-IDM-01 | 同轮 complete 两次一份事实 | 重试 complete | 不双写提醒 | 与 F08 事务 | identity | CT-F04-001, CT-F04-006 | L3 | `ct-f04-006` 真实服务 spawn 后同轮二次 complete；completed=1；reminder≤1 | temp-root | covered | direct；本批钉真实 createService 同轮重试；非整约 accepted |
| F04-IDM-02 | 新轮完成不写入历史完成 | 新 run 完成 | 历史事实不改写 | resume 新轮 | identity | CT-F04-002, CT-F04-007 | L3 | `ct-f04-007` 真实服务 continueTask resume 后新完成是另一事件/另一 generation；历史 payload/id/turn 不改写 | temp-root | covered | direct；本批钉真实 createService 新轮；非整约 accepted |
| F04-IDM-03 | 旧 run_generation 迟到 complete 丢弃 | 新轮已开始 | 不得改当前轮 | 迟到事件 | identity | CT-F04-003, CT-F04-008 | L3 | `ct-f04-008` 真实服务新轮 running 后旧 generation complete 丢弃；历史完成不被替换；不得写出当前轮完成 | temp-root | covered | direct；本批钉真实 createService 迟到 complete；非整约 accepted |
| F04-IDM-04 | 恢复/续跑新轮有自己的完成与通知 | resume 新完成 | 不得以历史完成丢弃 | cancel/crash × resume | lifecycle | IT-F04-001, CT-F04-009 | L3 | `ct-f04-009` 真实服务 continueTask resume 后新轮另有 subagent_completed 与 subagent_completion_reminder；不得只留历史 reminder | temp-root | covered | direct；本批钉新轮完成+通知；非整约 accepted |
| F04-IDM-05 | 事件保留轮次身份 | 消费者可区分重复与新轮 | 角色名不得代替实例 | F07 归属 | identity | CT-F04-005 | L3 | `ct-f04-005` 两轮 turn/generation；同轮不双写 | temp-root | covered | 绑定测试候选；非整约 accepted |

### F05 命令目的地与视图

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F05-DST-01 | submit 先冻结 dest | 发送用冻结项目/会话 | 切走后仍用原 dest | 双 submit | identity | CT-F05-001, CT-F05-012 | L1 | `ct-f05-012` 真实 `useComposerDraft`/`mountComposerDraft`：A 点 submit 冻结 dest 后切到 B 改输入，发出命令 dest 仍是 A 的 projectId/taskId，文本仍是 A 的 | temp-root | covered | direct；本批新钉 CT-F05-012，不是复述 CT-F05-001 源码扫描 / G14-07 binding；不升 DST-02..11；非整约 accepted |
| F05-DST-02 | A 上传中切 B，A 完成不得写 B | B 列表先回 | A 完成不覆盖 B 资产 | 会话世代 | identity | CT-F05-002, CT-F05-013 | L1 | `ct-f05-013` 真实 `useComposerDraft`/`mountComposerDraft` + `useWorkspace`/`mountUseWorkspace`：A 开始上传后切到 B，B 列表先回，A 完成后 B 资产不得出现 A 的文件；A upload dest 仍是 A；不得把视图拽回 A | temp-root | covered | direct；本批新钉 CT-F05-013，不是复述 CT-F05-002 / governance-f05 binding；不升 DST-04..11、ID-SWITCH-UPLOAD、F12-VW-*；DST-11 停放 WebKit；非整约 accepted |
| F05-DST-03 | 同 tick 双 submit 只发一条 | 连续 submit | 第二条丢弃 | 切会话后双 submit | concurrency | CT-F05-003, CT-F05-014 | L1 | `ct-f05-014` 真实 `useComposerDraft`/`mountComposerDraft`：同一 tick 两次 onSubmit（Promise.resolve 前都发出）只发一条，dest/文本是第一次；切 B 后再双 submit 不得带 A 文件 | temp-root | covered | direct；本批新钉 CT-F05-014，不是复述 CT-F05-003 / G14 / round14-d binding；不升 CON-DUAL-SUBMIT、DST-04..11；非整约 accepted |
| F05-DST-04 | 半清认文本世代 | 上传中改字留下 | 改回原文也留下 | 迟到粘贴 | identity | CT-F05-004, CT-F05-015 | L1 | `ct-f05-015` 真实 `useComposerDraft`/`mountComposerDraft`：submit 已发出、upload hold 住后改字再改回原文，finish 后当前输入仍是改回后的原文；已送出的 A 离开 pending；`host.sent` 只有一条且文本是 submit 当时冻结的原文。另钉上传等待期间改成别的字留下（不是空桶被写回）；迟到粘贴不得写回已消费桶（交叉，不升 DST-10） | temp-root | covered | direct；本批新钉 CT-F05-015，不是复述 CT-F05-004 / f05-hook binding；不升 DST-05..11、ID-DRAFT-GEN、F12-VW-*；非整约 accepted |
| F05-DST-05 | 半清认文件世代 | 撤再加入同一文件留下 | 命令仍只带 A | 上传竞赛 | identity | CT-F05-005, CT-F05-016 | L1 | `ct-f05-016` 真实 `useComposerDraft`/`mountComposerDraft`：A 在桶里 → submit（hold upload）→ 撤掉 A → 再加入同一文件或同名新 File。finish 后 pending 留下重新加入的文件；`host.sent[0].uploads` 只带 submit 当时的 A，不得变成空，也不得把后来再加入并进已发出命令 | temp-root | covered | direct；本批新钉 CT-F05-016，不是复述 CT-F05-005 / f05-hook binding；不升 DST-06..11、ID-DRAFT-GEN；非整约 accepted |
| F05-DST-06 | 两空草稿按世代隔离 | 同项目两个 null 草稿 | 旧建档不夺回当前稿 | 迟到建档 | identity | CT-F05-006, CT-F05-017 | L1 | `ct-f05-017` 真实 `useComposerDraft`/`mountComposerDraft`：同项目 `taskId=null`，`draftGen=0` 写稿 A（带文件）后切到 `draftGen=1`（空），再切回 0 仍见稿 A。gen=0 submit（hold createTask + upload）后切到 gen=1 写稿 B；finish 旧建档（createTask 返回 task-from-a + upload finish）后当前 gen=1 仍是稿 B，不得被 A 夺回；busy 落下；发出命令 dest 是 A 的新建 task，不是当前空草稿。再切回 gen=0 不得把稿 B 带回去；切回 gen=1 仍是稿 B | temp-root | covered | direct；本批新钉 CT-F05-017，不是复述 CT-F05-006 / f05-hook / governance-f05 binding；不升 DST-07..11、ID-DRAFT-GEN、CON-TWO-CREATE；非整约 accepted |
| F05-DST-07 | StrictMode 下 A 上传切 B 仍隔离 | 双 mount | B 不带 A 文件 | 会话世代 | concurrency | CT-F05-007, CT-F05-018 | L1 | `ct-f05-018` 真实 `useComposerDraft`/`mountComposerDraft({ strictMode: true })`：A 带文件 submit（hold upload）后切 B；B 的 pending 不得有 A 文件。finish A 后 B 再 submit：B 那条不得带 A 的 uploads；A 那条 dest 仍是 A | temp-root | covered | direct；本批新钉 CT-F05-018，不是复述 CT-F05-007 / f05-hook binding；不升 ID-SWITCH-UPLOAD、DST-08..11；非整约 accepted |
| F05-DST-08 | 上传成败释放 busy | 成功/失败均落 busy | 失败入口不得永久禁用 | 切走后冻结 dest | lifecycle | CT-F05-008, CT-F05-019 | L1 | `ct-f05-019` 真实 `useComposerDraft`/`mountComposerDraft`：成功路径 hold upload → submit → uploading=true → finish 成功 → uploading=false，再 submit 发出第二条。失败路径 `allowToast: true` hold upload → submit → `upload.fail` → uploading=false、sent 仍 0；清 pending 后再 submit 必须能发出 | temp-root | covered | direct；本批新钉 CT-F05-019，不是复述 CT-F05-008 / G14-07 binding；不升 DST-09..11；非整约 accepted |
| F05-DST-09 | 新建上传按最终目的地落下 | taskId=null 带文件建档 | 幽灵忙碌不得留 | 两新建并发 | identity | CT-F05-009, CT-F05-020 | L1 | `ct-f05-020` 真实 `useComposerDraft`/`mountComposerDraft`：`taskId=null` + 文件 + hold upload + `createTask` 返回新 id；finish 后 dest.taskId 是新建 id，uploading=false。切到别的会话再切回新建会话，uploading 仍 false，能再发一条。另钉两个空草稿新建上传并发，后完成的 A 不得在当前 B/新任务留下幽灵 busy | temp-root | covered | direct；本批新钉 CT-F05-020，不是复述 CT-F05-009 / f05-hook binding；不升 CON-TWO-CREATE、DST-10/11；非整约 accepted |
| F05-DST-10 | 迟到粘贴不写回已消费桶 | 提交后快照消费 | 当前空桶不被写回 | 切会话 | identity | CT-F05-010, CT-F05-021 | L1 | `ct-f05-021` 真实 `useComposerDraft`/`mountComposerDraft({ holdPaste: true })`：先 paste 进队列（attachments 仍空）→ submit（hold upload）→ finish 后桶已空；再 deliver 迟到粘贴，attachments/pending 仍空，不得写回已消费快照。另钉 submit 后切到另一会话再 deliver，当前桶仍不得被写回 | temp-root | covered | direct；本批新钉 CT-F05-021，不是复述 CT-F05-015 交叉 / f05-hook binding；CT-F05-010 已是 historical-unbound。不升 DST-11、ID-DRAFT-GEN；非整约 accepted |
| F05-DST-11 | 真实 WebKit 上传竞赛全矩阵 | 用户可见上传/切会话 | FileReader 迟到 | installed-app | delivery | AT-F05-001 | L4 | `at-webkit-env` skipped: environment | real-webkit | uncovered | 未设 LUMEN_AT_WEBKIT=1 |

### F06 凭证保护合并

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F06-SEC-01 | 自定义根不撤销默认根保护 | 两根凭证都进策略 | 读任一被拒 | 默认根 × 自定义根 | security | CT-F06-001, CT-F06-007 | L2 | `ct-f06-007` 两根路径进策略 + Darwin sandbox-exec 读任一根被拒 | temp-root | covered | direct；本批 Darwin 真跑读拒；非 accepted |
| F06-SEC-02 | Seatbelt 拒读两根凭证 | sandbox-exec 读 .env | EPERM | 真实沙箱 | security | CT-F06-002, CT-F06-008 | L2 | `ct-f06-008` 默认根与自定义根各有 .env；Darwin sandbox-exec 读两份 READ_BLOCKED 且不得读出正文 | temp-root | covered | native；本批 Darwin 真跑读拒；非 Darwin skip 不得记 covered；非 accepted |
| F06-SEC-03 | 自定义 lumenHome 凭证进 profile | 策略含该路径 | 读 agent-service.json 拒 | 与 F20 evidence 根 | security | CT-F06-003, CT-F06-009 | L2 | `ct-f06-009` 自定义 lumenHome 写 agent-service.json；策略含给定路径与 realpath；Darwin sandbox-exec 读拒且不得读出正文 | temp-root | covered | native；本批 Darwin 真跑读拒；非 Darwin skip 不得记 covered；非 accepted |
| F06-SEC-04 | 工作区与合法 skills 仍可读写 | 工作区内写成功 | 不以禁整个数据根代替 | 软链工作区 | security | IT-F06-001, CT-F06-010 | L2 | `ct-f06-010` 同一 Seatbelt profile 工作区写成功、合法 skills 可读；凭证读/写仍拒；不得整树 deny 数据根 | temp-root | covered | native；本批 Darwin 真跑写成功+凭证仍拒；非 Darwin skip 不得记 covered；非整约 accepted |
| F06-SEC-05 | 路径规范化与 realpath 同源 | 别名路径仍保护 | 软链绕过失败 | F02 软链 × F20 | security | CT-F06-005 | L3 | `ct-f06-005` write_file+sandbox-exec 软链写拒 | temp-root | covered | 绑定测试候选；非整约 accepted |
| F06-SEC-06 | 更换沙箱须先改公开架构 | 沿用 Seatbelt | 不得只改策略字符串 | 交付 | delivery | UT-F06-006 | L0 | `ut-f06-006` sandbox-exec + 架构点名 Seatbelt | temp-root | covered | 流程门禁；未换沙箱；非整约 accepted |

### F07 恢复归属

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F07-RES-01 | 子角色悬空工具封口保留原角色 | rebuild 合成中断结果 | 不凭角色名改实例 | 主/子线程 | identity | CT-F07-001, CT-F07-010 | L3 | `ct-f07-010` 真实 createService；父任务跑完后写入 child 角色悬空 tool_call；生产 sweepInterrupted 封口仍是原 child agent_role，不得改成 main；payload 保留 operationId/subagent_id，resultStatus=unknown | temp-root | covered | direct；本批钉生产 sweep 保留 child 角色；不是只改 round1 binding 或直接调 sealUnknown；不把 F07-RES-07 标 covered；非整约 accepted |
| F07-RES-02 | 主线程只含 main 事件 | resume×spawn 重建 | worker 步骤不混入 main | 父子 | identity | IT-F07-001, CT-F07-008 | L3 | `ct-f07-008` 真实 createService+spawn_subagent；child 事件 agent_role!==main；rebuildThread/continueTask 主线程无 worker write_file；不得混入 child model_step | temp-root | covered | direct；本批钉真实 spawn_subagent 后重建主线程；不把 ID-MAIN-CHILD-OP 标 covered；非整约 accepted |
| F07-RES-03 | 封口按 operationId 配对 | 同 provider id 不得互吞 | 恢复写结果未知 | F10 | identity | CT-F07-002, CT-F07-009 | L3 | `ct-f07-009` 真实 createService；同 providerCallId 两条 operation 只封未配对；生产 sweepInterrupted；再 sweep 不追加 | temp-root | covered | direct；本批钉生产 sweep 按 operationId 封口；不把 F10-ID-07 标 covered；非整约 accepted |
| F07-RES-04 | tool_result 写入失败后恢复不得挂孤立结果 | 失败后 resume | 模型线程配对完整 | DB 失败 × 事件 | persistence | CT-F07-003, CT-F07-011 | L3 | `ct-f07-011` 真实 createService 全程；库级 trigger 打在 tool_result 插入；waitFor 失败且 isRunning=false；同一 service continueTask 续跑完成；rebuildThread.forModel 每个 tool_use 有配对；最后一条不得是孤立 tool_result；再 sweep 不追加 | temp-root | covered | direct；本批钉同一 createService 续跑配对；不是只改 round6 binding，也不是复述 009；非整约 accepted |
| F07-RES-05 | 重复恢复不增加终结事实 | 再 sweep | 只一条 unknown | F10 sweep | identity | CT-F10-007, CT-F07-007 | L3 | `ct-f07-007` 真实 createService 连续两次 sweepInterrupted 只一条 unknown | temp-root | covered | direct；本批钉真实服务再 sweep 不双写；不把 F10-ID-07 标 covered；非整约 accepted |
| F07-RES-06 | 系统观测与恢复合成未知可区分 | 两类结果不同标记 | 不编造原因 | F18 | identity | CT-F07-006 | L3 | `ct-f07-006` 四类可查;compaction=system_observation,seal=recovery_synthetic | temp-root | covered | 绑定测试候选；非业务 accepted |
| F07-RES-07 | 子代理操作不强制归入 main | 子恢复自己的事实 | 父账不吞子 op | spawn_subagent | identity | IT-F07-002, CT-F07-012 | L3 | `ct-f07-012` 真实 createService+spawn_subagent；child write_file/model_step 的 operationId 落库且 agent_role!==main；父账 main 的 tool_call/tool_result 不得使用 child operationId；listExecRecords 里 child write 不得变成无子身份的父主循环 operation；rebuildThread/continueTask 后仍不得改写成 main | temp-root | covered | direct；本批钉父账不吞子 op，不是复述 008 线程过滤；不把 F10-ID-07 标 covered；非整约 accepted |

### F08 子代理转换原子

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F08-TXN-01 | queued→running 失败整笔回滚 | 解除后可重试 | 不留无执行者 running | live 句柄失败 | persistence | CT-F08-001, CT-F08-006 | L3 | `ct-f08-006` 真实 createService 库级父任务 queued→running 失败回滚 queued；isRunning=false；解除后同一任务可完成 | temp-root | covered | direct；本批钉父任务而非子代理 markRunning；非整约 accepted |
| F08-TXN-02 | complete 写入失败保留 live | 状态回滚 | 无派生未处理拒绝 | F03/F09 | persistence | CT-F08-002, CT-F08-007 | L3 | `ct-f08-007` 真实 createService+spawn_subagent；child running+live 后库级 status→done 失败仍 running、live、active_turn；process 无未处理拒绝；解除后同一 child 可 complete | temp-root | covered | direct；本批钉真实 spawn 后 complete 失败保留 live；非整约 accepted |
| F08-TXN-03 | 子 complete 事件失败则状态回滚 | 重试可补 | 不缺完成事件 | 提醒事实 | persistence | CT-F08-003, CT-F08-008 | L3 | `ct-f08-008` 真实 createService+spawn_subagent；库级 trigger 专打 subagent_completed；失败后不得 done 而无完成事件；解除后恰好补一条 | temp-root | covered | direct；本批钉事件失败与状态同回滚；非整约 accepted |
| F08-TXN-04 | beginTurn 故障 active_turn 与 turn_start 同回滚 | 注入失败 | 无孤立 turn | F09 | persistence | IT-F08-001, CT-F08-009 | L3 | `ct-f08-009` 真实 createService 库级 turn_start 插入失败；getActiveTurnId=null；无 turn_start；status 仍 queued；isRunning=false；解除后同一任务可 beginTurn | temp-root | covered | direct；本批钉 turn_start 插入而非 status→running；非整约 accepted |
| F08-TXN-05 | updateTaskStatus 主表与事件同回滚 | 注入失败 | 状态一致 | F09 | persistence | IT-F08-002, CT-F08-010 | L3 | `ct-f08-010` 真实 TaskStore+createService 库级 status_change 插入失败；不得留下 running 而无事件；解除后同一次 update 主表与事件一致 | temp-root | covered | direct；本批钉 status_change 插入而非只改 binding；非整约 accepted |
| F08-TXN-06 | reminder rehydrate 同轮幂等 | 消费后不再追加 | 新轮换 key | resume 重置 | identity | CT-F08-004, CT-F08-011 | L3 | `ct-f08-011` 真实 createService+spawn_subagent；同轮两次生产 rehydrate 不追加；consumeReminder 后不追加；continueTask+resume_from 新轮换 key；历史 reminder payload 不变 | temp-root | covered | direct；本批钉真实服务 reminder 幂等，不是只改 G14-11 binding；非整约 accepted |
| F08-TXN-07 | 注册/开始/结束/恢复四转换均原子 | 成功后再启动执行 | live 与持久先后失败 | 全转换 | persistence | CT-F08-005 | L3 | `ct-f08-005` 四转换注入回滚 | temp-root | covered | 绑定测试候选；非业务 accepted |

### F09 终态与持久化故障

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F09-DUR-01 | status 与 turn_end 同事务 | endTurn 成功 | status 失败则 turn_end 回滚 | F08 | persistence | CT-F09-001, CT-F09-011 | L3 | `ct-f09-011` 真实 createService 库级 status 失败回滚 turn_end；持久 status 不得写成 done | temp-root | covered | direct；本批钉同事务回滚；非整约 accepted |
| F09-DUR-02 | 收尾持久化失败 wait 不装成功 | finishTurn 失败 | 调用方看见失败 | 清理 live | lifecycle | CT-F09-002, CT-F09-010 | L3 | `ct-f09-010` 真实 createService 收尾 finishTurn 失败；waitFor reject；持久 status 不得写成 done；监控见 runtime_failure | temp-root | covered | direct；本批钉 wait 不装成功终态；非整约 accepted |
| F09-DUR-03 | durable 失败推 runtime_failure，DB 不伪造 failed | 真实 WS | 终态不改成 failed | listener 隔离 | persistence | CT-F09-003, CT-F09-012 | L3 | `ct-f09-012` 真实 WS 收 durable runtime_failure；持久 status 不得伪造 failed | temp-root | covered | direct；本批钉 WS 路径+不伪造 failed；非整约 accepted |
| F09-DUR-04 | context_usage 失败不改终态，相位不是 session_projection | 投影失败 | JSONL 独立 | F09 投影分离 | persistence | CT-F09-004, CT-F09-013 | L3 | `ct-f09-013` 真实 createService+WS；库级 context_usage 失败；phase===context_usage；durable=false；终态仍 done；失败事件不落库 | temp-root | covered | direct；本批钉水位失败不改终态；非整约 accepted |
| F09-DUR-05 | EventHub 一 listener 抛错不影响后续 | 同步抛 / Promise.reject | 终态不被改写 | 异常隔离 | lifecycle | CT-F09-005, CT-F09-014 | L3 | `ct-f09-014` 真实 EventHub+TaskStore+SQLite 同步抛与 Promise.reject；createService 续跑仍隔离；终态不改 | temp-root | covered | direct；本批钉 listener 隔离；非整约 accepted |
| F09-DUR-06 | JSONL 失败不改任务结果 | live 仍见 model_step | 不阻断已提交事件 | 投影 vs 执行 | persistence | CT-F09-006, CT-F09-015 | L3 | `ct-f09-015` 真实 createService 第一轮写出 jsonl 后把该文件换成目录；后续 append 失败；终态仍 done；live 仍见 model_step；phase=session_projection durable=false | temp-root | covered | direct；本批钉文件级投影失败；非整约 accepted |
| F09-DUR-07 | DB 无法写入保留可恢复事实 | 不虚构故障事件已持久化 | 显式报告 | F10 unknown | persistence | CT-F09-007 | L3 | `ct-f09-007` appendEvent 失败不入库 runtime_failure | temp-root | covered | 绑定测试候选；非整约 accepted |
| F09-DUR-08 | 内存 live 无论收尾成败必须清理 | 失败也摘 live | 无泄漏句柄 | F03 drain | lifecycle | CT-F09-008, CT-F09-009 | L3 | `ct-f09-009` 真实 createService 收尾 finishTurn 失败；waitFor 失败；isRunning=false；可再 submit 短任务 | temp-root | covered | direct；本批钉收尾失败摘 live 且无泄漏句柄；非整约 accepted |

### F10 最小追溯身份

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F10-ID-01 | 调用前宿主分配 operation；≠ provider id | 未知工具记失败 | 已知失败不得 ok | 主循环 | identity | CT-F10-001, CT-F10-014 | L3 | `ct-f10-014` 真实 createService；脚本未知工具 providerCallId=prov-f10-014；落库 tool_call 的 providerCallId 等于模型 id，operationId 非空且 ≠ providerCallId；对应 tool_result 同 operationId 且 resultStatus=failed；model_step 在调用前已有宿主 operationId | temp-root | covered | direct；本批钉真实 createService 未知工具宿主 operation ≠ providerCallId，不是只改 round1 binding；非整约 accepted |
| F10-ID-02 | 模型取消仍有宿主操作身份 | 取消 | 结果为 cancelled/unknown | shutdown | identity | CT-F10-002, CT-F10-016 | L3 | `ct-f10-016` 真实 createService；脚本模型第一次 chat 挂起；任务 running 后生产 `runtime.cancel(taskId)`；落库 error/model_step/取消结果带非空宿主 operationId；resultStatus 为 cancelled 或 unknown，不得 ok/failed；waitFor 后 isRunning===false | temp-root | covered | direct；本批钉真实 createService 生产 cancel，不是只改 round1 binding，也不是直接 runAgent+AbortController；非整约 accepted |
| F10-ID-03 | 标题回填 chat 前已有身份 | 失败可定位原任务 | 晚返回不覆盖已有标题 | 辅助调用 | identity | CT-F10-003, CT-F10-020 | L3 | `ct-f10-020` 真实 createService；标题 chat 前已有非空 operationId；失败同 op / purpose=title_backfill / resultStatus=failed 可对上原 taskId；晚到回填不覆盖已有标题 | temp-root | covered | direct；本批钉真实 createService 标题身份，不是只改 round2 binding，也不是直接 new AgentRuntime；非整约 accepted |
| F10-ID-04 | 修图 sidecar 身份与主循环分开 | 成功/失败可定位 | 取消仍归属原操作 | 辅助 × 主 | identity | CT-F10-004, CT-F10-021, CT-F10-024 | L3 | `ct-f10-021` 成功/失败；`ct-f10-024` 真实 createService；`repairMermaidSource` 返回 `{ done, cancel }`；模型 chat 挂起后生产 cancel；同一 operationId；purpose=mermaid_repair；resultStatus=cancelled，不得 ok/failed；op ≠ 主循环 chat | temp-root | covered | direct；本批钉生产 cancel 仍属原操作，不是只改 021 binding；不升整约 accepted |
| F10-ID-05 | 识图 ALS 下写入 vision record | look_at_image | 失败可定位 | F17 采集 | identity | CT-F10-005, CT-F10-022 | L3 | `ct-f10-022` 真实 createService；脚本调生产 look_at_image；listExecRecords purpose=vision；operationId 非空且 ≠ 主循环 chat；成功/失败各一条可定位，失败 resultStatus 不得 ok | temp-root | covered | direct；remain29 钉真实 createService 生产 look_at_image；ID-AUX-CALL 由 CT-F10-024 取消钉死后升 covered；非整约 accepted |
| F10-ID-06 | 子循环写入 parent task records | ChildRunner | parentOperation 保留 | 主/子 | identity | CT-F10-006, CT-F10-013 | L3 | `ct-f10-013` 真实 createService+spawn_subagent；listExecRecords 子循环 context/tool 挂父 task；parentOperationId 指向父 spawn/父 model，不得空、不得改成 child 自己的 operationId、不得抹掉；子 op 不改写成 main | temp-root | covered | direct；本批钉真实 spawn 子循环 parentOperation 保留，不是只改 v2r-paths binding；不把 F10-ID-07 标 covered；非整约 accepted |
| F10-ID-07 | 生产工具已知失败不得标 ok | 正文含 error 仍可成功 | 不靠搜 error 字符串 | run_code 非零 | identity | CT-F10-007, CT-F10-015 | L3 | `ct-f10-015` 真实 createService 生产工具；read_file 不存在 / edit_file old_string 不存在 / write_file ../escape.md / run_code process.exit(2) 的落库 resultStatus 均为 failed 不得 ok；先写入正文含 error 的文件再 read_file 该文件仍 ok | temp-root | covered | direct；本批钉生产工具已知失败含 run_code 非零，不是只改 round6 binding，也不是 sweep unknown；非整约 accepted |
| F10-ID-08 | spawn_subagent 拒绝/中止带 resultStatus | 未知类型 failed；aborted cancelled | worker error | F08 | identity | CT-F10-008, CT-F10-017 | L3 | `ct-f10-017` 真实 createService+生产 spawn_subagent；未知类型 ghost-f10-017 落库 tool_result resultStatus=failed 不得 ok/cancelled；另一 submit spawn 真实 searcher 且 child 挂起后生产 runtime.cancel(parentId)；child 不再 running；落库 spawn tool_result/spawn 事件 resultStatus=cancelled 不得 failed/ok | temp-root | covered | direct；本批钉真实 createService 生产 spawn，不是只改 round14-c binding，也不是直接 new ChildRunner；非整约 accepted |
| F10-ID-09 | 末子 complete 后同进程封 unknown | 不经 sweep、不跑工具 | 有 live 兄弟不误封 | 父完成 × live child | lifecycle | CT-F10-009, CT-F10-018 | L3 | `ct-f10-018` 真实 createService+生产 spawn 两 child；live 兄弟不误封；末子 complete 后同进程 unknown、不经 sweep、不跑工具；再 sweep 不双写 | temp-root | covered | direct；本批钉真实 createService 末子 complete 同进程封，不是只改 idle-seal binding，也不是复述 CT-F03-014；非整约 accepted |
| F10-ID-10 | 归档/已结束父任务悬空 op 也封口 | sweep 一条 unknown | 再 sweep 不重复 | 不按父 running | lifecycle | CT-F10-010, CT-F10-019 | L3 | `ct-f10-019` 真实 createService；生产 archiveTask 后注入悬空 tool_call；生产 sweep 一条 unknown；再 sweep 不重复 | temp-root | covered | direct；本批钉归档父任务生产 sweep，不是只改 round14-d binding，也不是复述 007；非整约 accepted |
| F10-ID-11 | 工具事件带 operationId，恢复写未知 | 中断 | 不自动重跑写操作 | F07 | identity | CT-F10-011, CT-F10-023 | L3 | `ct-f10-023` 真实 createService；write_file 后库级 trigger 让 tool_result 写失败；同一 service continueTask 恢复只补 unknown，共用 operationId；目标文件不得被恢复轮重写 | temp-root | covered | direct；本批钉同一 createService 写工具中断恢复不重跑，不是只改 R13 binding，也不是复述 015/011；非整约 accepted |
| F10-ID-12 | 重试标明所属操作与 attempt | 503 后成功两次 attempt | 流式中断保留原文 | F17 | identity | CT-F17-004, CT-F10-025 | L3 | `ct-f10-025` 真实 createService；生产 OpenAI stream 503 后成功；listExecRecords 同 operationId 的 attempt 1 与 2；流式中断保留 PARTIAL_SSE 原文且不丢 attempt | temp-root | covered | direct；本批钉 createService 生产主循环，不是只改 V2R-04 binding，也不是复述 015；非整约 accepted |
| F10-ID-13 | 意图无法持久化则不启动副作用操作 | persist 失败 | 不启动 tool | F09 | persistence | CT-F10-012 | L3 | `ct-f10-012` beginTurn 注入 | temp-root | covered | 绑定测试候选；非业务 accepted |
| F10-ID-14 | WS 级 spawn_subagent 写入 exec_records | 真实 WS spawn | 可按 operation 查询 | F17/F21 | identity | CT-F10-012 | L3 | `ct-f10-012` WS list_exec_records | temp-root | covered | 绑定测试候选；非业务 accepted |

### F11 启动结算

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F11-BOT-01 | 端口占用 start 及时失败并释放数据根 | listen 失败 | 第二实例能取得根 | F02 | lifecycle | CT-F11-001, CT-F11-007 | L3 | `ct-f11-007` 先占端口；`createService.start` 有限时间拒绝并放根；第二人 `try-create-service` 写出 portfile/SQLite 并能 hello | temp-root | covered | direct；本批新钉 CT-F11-007，不是只改 round1 / ct-f03-006 binding，也不是只调 startServer；非整约 accepted |
| F11-BOT-02 | startServer 监听失败本身拒绝 | 不永久 pending | 调用方知失败 | 与运行中连接错误分开 | lifecycle | CT-F11-002, CT-F11-007 | L2 | `ct-f11-007` 生产 `createService.start` Promise 在超时前拒绝，且与 WS/鉴权连接错误分开 | temp-root | covered | direct；随 007 诚实钉死生产监听入口拒绝，不是默认升；非整约 accepted |
| F11-BOT-03 | portfile rename 失败后关监听，同根第二实例能 start | 发布失败 | 释放本实例资源 | F02 发布 | lifecycle | CT-F11-003, CT-F11-008 | L3 | `ct-f11-008` `fail-portfile-rename` 失败者仍活、listen_released、锁已放；第二人 `try-create-service` 写出 portfile/SQLite 并能 hello | temp-root | covered | direct；本批新钉 CT-F11-008，不是只改 G14-04 binding，也不是复述 007 端口占用或 023 锁打开失败；非整约 accepted |
| F11-BOT-04 | 准备失败释放 running 并记失败 | 启动中失败 | running 清理 | 后台拒绝 | lifecycle | IT-F11-001, CT-F11-009 | L3 | `ct-f11-009` 生产 `createService.start`；库级 `turn_start` 触发器；`submit`/`waitFor` 拒绝；`isRunning` false；回滚 queued；同服务再 submit 完成；关后第二实例 `createService.start`+submit | temp-root | covered | direct；本批新钉 CT-F11-009，不是只改 batch2 binding，也不是复述 BOT-01/03 listen/portfile；非整约 accepted |
| F11-BOT-05 | 失败实例不妨碍后续正确实例 | 再 start 成功 | 不带锁继续 | F02 | concurrency | CT-F02-009, CT-F02-023 | L3 | `ct-f02-023` 失败者 createService 仍活时第二份 createService.start 取得根并写出 | temp-root | covered | direct；随 OWN-09 诚实钉死升 covered，不是只改 009 binding；不升 BOT-04；非整约 accepted |
| F11-BOT-06 | 初始化异步失败全路径结算 | DB/工具初始化失败 | 及时拒绝 | 部分启动 | lifecycle | CT-F11-006 | L2 | `ct-f11-006` 坏 DB/组装失败及时拒绝 | temp-root | covered | 绑定测试候选；非整约 accepted |

### F12 同视图请求身份

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F12-VW-01 | open 世代挡住迟到 readAsset | 新打开 | 旧响应不覆盖 | 切会话 | identity | CT-F12-001, CT-F12-006 | L1 | `ct-f12-006` 真实 `useWorkspace`/`mountUseWorkspace`（`holdRead`）：open A（hold read）后 open B；finish 旧 A 的 read，当前 open 不得变成 A 的迟到正文；随后 finish B 并显示 B。另钉 close 后再 open 另一文件，旧 A 仍不得覆盖 | temp-root | covered | remain62 已钉 CT-F12-006；本批不重磨。不升 VW-04..06；VW-06 停放 WebKit；非整约 accepted |
| F12-VW-02 | 同文件重读各有序号，旧成功不覆盖新失败 | 连续重读 | 最新失败有状态 | 同资源刷新 | identity | CT-F12-002, CT-F12-007 | L1 | `ct-f12-007` 真实 `useWorkspace`/`mountUseWorkspace`（`holdRead`）：同文件先成功打开有正文，再连续 open 两次；先 finish 第二次为失败，当前 open 有 loadError 且正文不得清成空谎；再 finish 第一次为迟到旧成功，不得覆盖最新失败态 / 不得刷成旧成功正文 | temp-root | covered | direct；本批新钉 CT-F12-007，不是复述 CT-F12-002 纯函数 / projection binding。不升 VW-04..06；非整约 accepted |
| F12-VW-03 | 旧文件后台重读不得淘汰用户新打开 | 换文件打开 | 旧读失效 | close 不丢资产刷新 | identity | CT-F12-003, CT-F12-008 | L1 | `ct-f12-008` 真实 `useWorkspace`/`mountUseWorkspace`（`holdRead`）：open A 后 `reloadOpen` 后台重读；用户改 open B；finish A 重读不得把当前刷回 A；随后 finish B 显示 B。另钉 B 已打开后迟到 A 重读不得淘汰，以及再 open 旧文件 vs 用户已切到新文件 | temp-root | covered | direct；本批新钉 CT-F12-008，不是复述 CT-F12-003 源码扫描 / 纯函数 binding。不升 VW-04..06；VW-06 停放 WebKit；非整约 accepted |
| F12-VW-04 | close Reader 后 reply 仍刷新资产，迟到 read 不回写 | close 只废阅读 | 资产刷新保持 | 断开重开 | identity | CT-F12-004, CT-F12-009 | L1 | `ct-f12-009` 真实 `useWorkspace`/`mountUseWorkspace`（`holdRead` + 自定义 `listAssets`）：open 某文件（hold read）→ close → finish 迟到 read，`open` 必须仍 null，不得回写 Reader。close 后对本会话 emit reply：必须再 `listAssets`，assets 不得停在 close 前那一版 | temp-root | covered | direct；本批新钉 CT-F12-009，不是复述 CT-F12-004 / G14 / round14-b F12 close binding，也不是 CT-F12-006 的 close 子句。不升 VW-05/06；VW-06 停放 WebKit；非整约 accepted |
| F12-VW-05 | 目的会话与当前视图分开 | 刷新必须身份吻合 | 跨项目迟到不刷当前轨 | F05 | identity | CT-F12-005, CT-F12-010 | L1 | `ct-f12-010` 真实 `useWorkspace`/`mountUseWorkspace`（`holdList`）：会话 A 开始 refresh / list（hold 住 list）后切到会话 B（含跨 project）；finish A 的迟到 list，当前 B 的 assets 不得变成 A 的列表；B 自己的 list 随后回来并显示 B | temp-root | covered | direct；本批新钉 CT-F12-010，不是复述 CT-F12-005 / projection 纯函数 / G14-08 binding。不升 DST-11、VW-06；非整约 accepted |
| F12-VW-06 | 真实 WebKit Reader 世代 | 用户打开/关闭/重读 | 迟到资源 | installed-app | delivery | AT-F12-001 | L4 | `at-webkit-env` skipped: environment | real-webkit | uncovered | 未设 LUMEN_AT_WEBKIT=1 |

### F13 错误关联请求

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F13-REQ-01 | 合法 requestId + 非法形状回同一 id | 立即结算 | 不进 handler | F01 | identity | CT-F13-001, CT-F13-011 | L3 | `ct-f13-011` createService+WS submit/create_project/update_settings 字段在但类型错仍回同一 requestId;无新 task/project/settings/upload | temp-root | covered | 形状非法仍带回同一合法 requestId + 无副作用;不是 007 缺字段循环;非整约 accepted |
| F13-REQ-02 | requestId 非法不伪造关联 | 不可解析 | 无假 id | F01 | identity | CT-F13-002, CT-F13-012 | L3 | `ct-f13-012` createService+WS 对象/空串/数字 requestId 的 error 不带伪造 id;随后合法 list 带回自己的 id | temp-root | covered | 不是 decode 单测;不是只改 round1 binding;非整约 accepted |
| F13-REQ-03 | 异步错误带回 requestId | handler 异步失败 | 客户端结算 | 超时 | identity | CT-F13-003, CT-F13-008 | L3 | `ct-f13-008` get_settings/list_projects 短超时与断线带回 requestId | temp-root | covered | direct；本切片钉超时/断线带回同一 requestId；非 accepted |
| F13-REQ-04 | 未连接 list 立即拒绝 | 无 socket | 不挂起 | 连接世代 | lifecycle | CT-F13-004, CT-F13-013 | L2 | `ct-f13-013` createService.start 活服务后未 connect 的 LumenClient list/listProjects 有限时间拒绝未连接/无 socket;connect 后同一 client list 成功 | temp-root | covered | 不是 R09 死端口 9;不是只改 CT-F13-004 binding;非整约 accepted |
| F13-REQ-05 | 并发 list 各归其 requestId | 两并发 | 不串项目 | 旧 socket 迟到 | concurrency | CT-F13-005, CT-F13-014 | L3 | `ct-f13-014` createService.start+LumenClient.connect+create_project;两项目各一条 task;并发 list 各归 requestId 且不串项目;随后再 list 仍不串 | temp-root | covered | 不是 batch3 手组 startServer;不是只改 CT-F13-005 binding;不升 CON-REQID;非整约 accepted |
| F13-REQ-06 | 旧 socket 迟到 ok/error 不得结算新连接 | 重连 | 新 requestId 独立 | F07 回放事件 | concurrency | CT-F13-006, CT-F13-015 | L3 | `ct-f13-015` createService.start+LumenClient 真服务；connect 后 list 挂起再 connect 换代；旧 socket 注入迟到 error/ok/tasks（requestId=新 list）不得结算；真服务新 socket 合法 tasks 才结算；新旧 requestId 不同 | temp-root | covered | direct；不是 round14-d/round14-conn 假服；不是只改 CT-F13-006 binding；不升 REQ-07 / ID-STALE-CONN / CON-REQID；非整约 accepted |
| F13-REQ-07 | 全部异步错误与超时均关联 | 各 type 超时 | 不伪造 | 全入口 | identity | CT-F13-007, CT-F13-008, CT-F13-009, CT-F13-010 | L3 | `ct-f13-010` createProject/listSkills 400ms 超时带回同一 requestId | temp-root | partial | 已钉 list / get_settings / list_projects / submit / continue / create_project / list_skills 短超时；其余异步 type 仍未逐条挂超时。禁止标 covered |

### F14 Origin 白名单

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F14-ORI-01 | 本机/空 Origin 允许，外站拒绝 | 纯函数 allowlist | 外站 false | HTTP/WS | security | CT-F14-001, CT-F14-006 | L3 | `ct-f14-006` createService.start HTTP 空 Origin 与 127.0.0.1/localhost 不得 403；evil.example 必须 403；CORS 不得是 *；WS 本机 Origin 收 hello，外站 4403 | temp-root | covered | direct；不是 isAllowedOrigin 纯函数表；不是只改 CT-F14-001/round15 binding；不升 ORI-02/03/04 / SEC-ORIGIN-TOKEN；非整约 accepted |
| F14-ORI-02 | HTTP 外站带 token 仍 403，CORS 非 * | 本机回显 Origin | 无业务副作用 | F01 | security | CT-F14-002, CT-F14-007 | L3 | `ct-f14-007` createService.start POST /upload 外站+正确 token 403；CORS 非 *（外站 null）；无新 upload/task；本机同一 token POST /upload 不得 403 且回显 Origin 非 * | temp-root | covered | direct；不是 005（无本机回显）也不是 006 的 GET /pdf；不是只改 CT-F14-002/round15 binding；不升 ORI-04 / SEC-ORIGIN-TOKEN；非整约 accepted |
| F14-ORI-03 | WS 外站 4403，本机可握手 | 本机 Origin | 外站不进业务 | F01 | security | CT-F14-003, CT-F14-008 | L3 | `ct-f14-008` createService.start 外站+正确 token 4403；不得 hello；open 后立刻 submit 无新 task；本机 hello 后合法 list 可结算 | temp-root | covered | direct；不是 006（不测 submit/无副作用）也不是 005（无本机握手对照）；不是只改 CT-F14-003/round15 binding；不升 ORI-04 / SEC-ORIGIN-TOKEN；非整约 accepted |
| F14-ORI-04 | 无 Origin 本机客户端只靠 token | Node/curl | 错 token 仍拒 | F01-AUTH | security | CT-F14-004, CT-F14-009 | L3 | `ct-f14-009` createService.start 无 Origin HTTP GET/POST /upload 正确 token 不得 403；错/无 token 401 不是 403 Origin；WS 无 Origin 正确 token hello；错/无 token 4401 不得 hello；错 token upload/submit 无新文件/task | temp-root | covered | direct；不是复述 006/007 外站 Origin；不是只改 CT-F14-004 binding；不升 SEC-ORIGIN-TOKEN / AUTH-02；非整约 accepted |
| F14-ORI-05 | 错误来源无副作用 | 外站 POST | 磁盘无写 | HTTP/WS 两入口全 type | security | CT-F14-005 | L3 | `ct-f14-005` upload+submit 外站无新文件/任务 | temp-root | covered | 绑定测试候选；HTTP 写盘入口已测；非整约 accepted |

### F15 关闭常驻不自动再装

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F15-INT-01 | 无意图文件允许装；显式 false 拒绝 | write 可读回 | 意图与 plist 分开 | 首次启动 | delivery | IT-F15-001, CT-F15-002 | L2 | `ct-f15-002` 隔离 HOME+假 launchctl；无意图文件时真实 status.intentEnabled===true 且可自动装；显式 false 后不可装；plist 不因写意图而创建 | temp-root | covered | 走真实 launchAgentStatus 读隔离文件；非手传 boolean；非原生首装；非整约 accepted |
| F15-INT-02 | 关掉后无 plist 不得自动再装 | shouldRepair 为假 | 意图开且未装才可修 | 损坏安装 | delivery | CT-F15-001, CT-F15-003 | L2 | `ct-f15-003` 隔离 HOME+假 plist+真实 uninstall；意图关、plist 不在、不得自动装/修；uninstall 后无 bootstrap/kickstart | temp-root | covered | 走真实 uninstall+status；非复述纯函数；非原生重开；非整约 accepted |
| F15-INT-03 | 意图开且 job 缺失/失败才修，未知活实例跳过 | 纯函数 | 不强杀未知 PID | F16 | delivery | CT-F16-007, CT-F15-004 | L2 | `ct-f15-004` 隔离 HOME+假 launchctl；`writeBackgroundIntent(true)`+无 plist/无 portfile+print 缺失 → 真实 `launchAgentStatus` 填 `shouldRepair===true`；未知活 PID+可连端口 → `portfileAlive` 且不修；意图 false 即使 job 缺失也不修；不得 bootstrap/bootout/杀 PID | temp-root | covered | 走真实 status 填 shouldRepair；非手传 boolean；未碰生产 label / PID 71847；非整约 accepted |
| F15-INT-04 | 关闭→退出→重开 App 不自动装 | 真实设置页 | 意图仍为关 | isolated-home | delivery | AT-F15-001 | L4 | `at-f16-f15-native` skipped: environment | isolated-home | uncovered | 未设 LUMEN_AT_ISOLATED_HOME=1 |
| F15-INT-05 | 设置页显示与意图/托管一致 | 用户可见 | 失败不改意图为关 | installed-app | delivery | AT-F15-002 | L4 | 仅静态 SettingsModal 解析 | temp-root | uncovered | `f16` 源码解析 ≠ 原生设置页 |

### F16 常驻所有权交接

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F16-HAN-01 | 意图/配置/端口/托管分别表达 | parseLaunchctlPrint 识别 running/崩溃/缺失 | 旧端口可连 ≠ 托管 | 设置态 | delivery | UT-F16-001, CT-F16-008 | L1 | `ct-f16-008` 三种 print 可分；本地 HTTP 可连但 print 缺失时 ownedByJob=false、不得「已开启常驻」 | temp-root | covered | direct；本批钉端口可连 ≠ 托管；未碰生产 label / PID 71847 / 原生设置页；非整约 accepted |
| F16-HAN-02 | 未知活 PID 必须 conflict，不得 bootstrap | 报告冲突 | 不按未确认 PID 强杀 | intent × unknown PID | delivery | CT-F16-001, CT-F16-009, CT-F16-014 | L1 | `ct-f16-009` 活 PID+可连端口；`ct-f16-014` 意图落盘 true/false 交叉仍 conflict，不得 installLaunchAgent | temp-root | covered | direct；本批钉意图落盘交叉；未碰生产 label / PID 71847；非整约 accepted |
| F16-HAN-03 | job PID 与 portfile 一致且健康 → already | 不重复装 | lastExit=1 不否决 running | 恢复 | delivery | CT-F16-002, CT-F16-010 | L1 | `ct-f16-010` live.pid==job.pid + 端口可连 + lastExit=1 仍 already，不得 bootstrap/conflict | temp-root | covered | direct；本批钉真实活 PID+TCP+匹配 job；未碰生产 label / PID 71847 / 不 install；非整约 accepted |
| F16-HAN-04 | 无活持有者才 bootstrap | 安装动作 | 失败可辨认 | 失败安装 × 重开 | delivery | CT-F16-003, CT-F16-011 | L1 | `ct-f16-011` live=null 或端口不可连且无确认 PID + job 缺失 → bootstrap；未知活 PID 必须 conflict | temp-root | covered | direct；本批钉判定+真实 TCP；未真执行 bootstrap / launchd:install；未碰生产 label / PID 71847；非整约 accepted |
| F16-HAN-05 | spawn/failed 无 pid 仍 unhealthy | 可修复 | 设置不显示已开启 | F15 | delivery | CT-F16-004 | L1 | `f16` unhealthy / 设置态 | temp-root | partial | static+unit |
| F16-HAN-06 | 壳排空先 SIGTERM，超时不得 bootstrap | 重复信号不重入 | 只动槽内 Child | shutdown × 自有 sidecar | lifecycle | CT-F16-005 | L2 | `f16` V2R-01 SIGTERM | temp-root | partial | 替身进程；待原生排空 |
| F16-HAN-07 | wait 失败/冲突必须 bootout，冲突不 kickstart | 失败返回 | 意图不改为关 | launchd 失败 × 重开 | delivery | CT-F16-006, CT-F16-013 | L2 | `ct-f16-013` 隔离 HOME + 假 launchctl：wait 超时 bootout 测试 label；冲突 bootout 且不 kickstart；意图仍为开 | temp-root | covered | direct；走真实 installLaunchAgent；未碰生产 label / PID 71847；非整约 accepted |
| F16-HAN-08 | 入口挂 SIGTERM 且走 handle.close | 优雅停机 | 超时非 0 | F03 | lifecycle | CT-F16-007, CT-F16-012 | L2 | `ct-f16-012` 隔离 temp home 拉真实入口 SIGTERM 走 handle.close | temp-root | covered | direct；本批钉真实入口 SIGTERM→handle.close（锁/portfile 释放、重复信号不并发、短超时非 0）；非真实 launchd 托管；未碰生产 label / PID 71847；非整约 accepted |
| F16-HAN-09 | 原生设置页开启完成交接 | 隔离 HOME 真托管 | 未知实例冲突可见 | 首装/已有实例 | delivery | AT-F16-001 | L4 | `at-f16-f15-native` 隔离 label 真装;生产 PID 不变 | launchd | partial | Node 隔离安装 ≠ 原生设置页;禁止 PID 71847 |
| F16-HAN-10 | 安装失败恢复且如实报告 | 失败态可再开 | 不持续假成功 | 重开 App | delivery | AT-F16-002 | L4 | 无 | installed-app | uncovered | |
| F16-HAN-11 | 自有临时服务转常驻安全排空 | 任务仍跑时交接 | 超时失败保留所有权 | 真实 sidecar | delivery | AT-F16-003 | L4 | `at-f16-f15-native` skipped: environment | launchd | uncovered | V2R-01 原生未做 |
| F16-HAN-12 | 构建产物与安装 hash 对账 | 同候选二进制 | 路径以当次日志为准 | 交付 | delivery | AT-F16-004 | L4 | `at-f16-004` bundle 与 /Applications 均为 57ee40da… | installed-app | partial | 本轮未新 tauri:build；生产 LaunchAgent 未同候选重装 |

### F17 最终请求与逐次响应

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F17-REQ-01 | 保存最终 request JSON（含 tools）与 response，无 apiKey | adapter 路径 | 解析失败仍留原文 | 主循环 | persistence | CT-F17-001, CT-F17-010 | L3 | `ct-f17-010` 真实 createService 生产主循环 request JSON 含 tools 且无密钥；畸形 SSE 仍留原文 request+response | temp-root | covered | direct；本批钉生产流+解析失败留原文，不是只改 f17-f21 binding；非整约 accepted |
| F17-REQ-02 | 改 settings 后历史正文不变 | 再读 record | 不按事后配置重建 | F18 | persistence | CT-F17-002, CT-F17-012 | L3 | `ct-f17-012` 真实 createService 生产主循环落 request/response 后经 update_settings 改模型/系统提示，再读同一 record 正文逐字节不变 | temp-root | covered | direct；本批钉生产 settings 入口，不是只改 f17-f21 binding，也不是复述 CT-F17-010；非整约 accepted |
| F17-REQ-03 | 采集前旧事件标 not_collected，不补造 | 历史缺口 | 不补正文 | F22 缺口 | persistence | CT-F17-003, CT-F17-013 | L3 | `ct-f17-013` 真实 createService 经 update_settings 关采集再跑一轮再打开；历史标 not_collected 且不补造正文 | temp-root | covered | direct；本批钉生产采集开关，不是只改 f17-f21 binding，也不是插库假装或把 010 畸形 SSE 当 not_collected；非整约 accepted |
| F17-REQ-04 | 每次尝试含 attempt；503 后成功留两次；stream:true | 重试 | 503 正文可读 | 流式中断 | identity | CT-F17-004, CT-F17-009 | L3 | `ct-f17-009` 503 后 SSE 中断分 attempt | temp-root | covered | direct；V2R-04 成功路径仍历史；非 accepted |
| F17-REQ-05 | 标题/修图/识图/子循环均落 exec_records | 四条生产路径 | 失败可定位 | F10 | identity | CT-F17-005, CT-F17-011 | L3 | `ct-f17-011` 同一 createService 上 title_backfill/mermaid_repair/vision/子循环都落 exec_records；失败可定位 | temp-root | covered | direct；本批钉真实 createService 四条生产路径，不是只改 v2r-paths binding，也不是直接 new AgentRuntime；非整约 accepted |
| F17-REQ-06 | 流式中断保留已收原始内容与错误语义 | SSE 中断 | 不丢部分正文 | 取消 | persistence | CT-F17-006 | L3 | `ct-f17-006` PARTIAL_SSE + cancelled | temp-root | covered | 绑定测试候选；非业务 accepted |
| F17-REQ-07 | 版本/有效配置无法精确时明确标记 | 读 record 版本字段 | 不假装精确 | 导出 | persistence | CT-F17-007 | L3 | `ct-f17-007` versionPrecision=unknown configExact=false | temp-root | covered | 绑定测试候选；非业务 accepted |
| F17-REQ-08 | 视觉转换后的实际请求表示 | vision 请求 | 无凭证 | F18 变换 | persistence | CT-F17-008 | L3 | `ct-f17-008` before 材料 vs afterRequest | temp-root | covered | 绑定测试候选；非业务 accepted |

### F18 输入来源与变换

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F18-CTX-01 | recordContext 必须在 runWith 内 | 库中有 context | ALS 丢失则失败可见 | 主循环 | persistence | CT-F18-001, CT-F18-004 | L3 | `ct-f18-004` 生产 `createService.start`+submit 写出 `kind=context` 并挂任务/轮次/operation；ALS 外生产 `recordContext` 抛错且不写成功 context | temp-root | covered | direct；本批新钉 CT-F18-004，不是只改 V2R-05 / CT-F18-001 binding，也不是只调 runAgent；非整约 accepted |
| F18-CTX-02 | 来源材料与注入表示分别关联 | 可查变换 | 只有 hash/可变路径不满足 | 折叠/截断 | persistence | CT-F18-002 | L3 | `ct-f18-002` forModel+sources+fold | temp-root | covered | 绑定测试候选；非业务 accepted |
| F18-CTX-03 | 折叠/摘要/过滤/截断/视觉/遗漏可查询 | 变换记录 | 遗漏显式 | 预算身份 | persistence | CT-F18-002 | L3 | `ct-f18-002` fold/vision/summary/filter/omit/truncate 真实组装 | temp-root | covered | 绑定测试候选；非业务 accepted |
| F18-CTX-04 | 实际采用的工具/权限/预算可追溯 | 约束快照 | 事后摘要无效 | 长会话预算 | persistence | CT-F18-003 | L3 | `ct-f18-003` tools/maxSteps/fold 预算已采集 | temp-root | covered | 快照已采集，长会话数值验证仍属 F20-STO-07/09 |
| F18-CTX-05 | 系统观测/模型自述/恢复合成/外部验证可区分 | 四类标记 | 不编造 CoT | F07/F10 | identity | CT-F07-006 | L3 | `ct-f07-006` 四类 resultSource 同任务可查 | temp-root | covered | 绑定测试候选；非业务 accepted |

### F19 工具结果与文件版本

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F19-TOL-01 | write_file 写前/写后版本；覆盖后旧 record 仍旧正文 | 创建前不存在明确 | 失败/部分/缺失明确 | 文件覆盖 | persistence | CT-F19-001, CT-F19-007 | L3 | `ct-f19-007` 生产 `createService.start`+submit/continue 写前 existed=false；两次 after；覆盖后旧 file_version 仍第一版；磁盘第二版；shared 写拒 after=missing | temp-root | covered | direct；本批新钉 CT-F19-007，不是只改 `f17-f21` / CT-F19-001 binding，也不是复述 CT-F19-006；失败子句钉 shared 写拒 after=missing，不升 F19-TOL-03；非整约 accepted |
| F19-TOL-02 | persist 预览不得冒充原文 complete | 长工具原文可取 | 截断标记 | 预算 | persistence | CT-F19-002, CT-F19-008 | L3 | `ct-f19-008` 生产 `createService.start`+submit 写/读超长文件；模型看见 persist 预览；证据仍有原文尾巴；预览不得标 complete 原文 | temp-root | covered | direct；本批新钉 CT-F19-008，不是只改 V2R-06 binding，也不是只调 `withResultPersist`/`runAgent`；非整约 accepted |
| F19-TOL-03 | after 不存在不得标 complete 空文件 | missing | 不编造空文件 | 文件版本 | persistence | CT-F19-003, CT-F19-009 | L3 | `ct-f19-009` 生产 `createService.start`+submit；生产 `edit_file` 改不存在文件；after `contentStatus=missing`、`existed=false`；不得 complete；不得空串冒充 after 正文；磁盘仍 ENOENT | temp-root | covered | direct；本批新钉 CT-F19-009，不是只改 V2R-12 binding，不是复述 CT-F19-007 shared 写拒；非整约 accepted |
| F19-TOL-04 | run_code 保存脚本、输出、截断、退出信息 | 真实执行 | 超时终止如实 | 信号 vs 取消 | persistence | IT-F19-001, CT-F19-004 | L3 | `ct-f19-004` 超时 timedOut + 退出码/脚本 | temp-root | covered | 绑定测试候选；非业务 accepted |
| F19-TOL-05 | 取消请求 ≠ 进程已退出 | SIGTERM 结果 | 诊断显示覆盖边界 | 真实信号 | persistence | CT-F19-004 | L3 | `ct-f19-004` SIGTERM 进 meta.signal | temp-root | covered | 绑定测试候选；非业务 accepted |
| F19-TOL-06 | 不能用目录当前状态证明历史副作用 | 边界声明 | 覆盖后旧证据不变 | F20 | persistence | CT-F19-001, CT-F19-006 | L3 | `ct-f19-006` 旧 file_version 仍旧正文;诊断声明未跟踪网络/任意文件 | temp-root | covered | 绑定测试候选；非业务 accepted |

### F20 证据一致性与资源边界

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F20-STO-01 | 改 blob 后 read/export 不得 complete/present | hash 校验 | mismatch/failed | 导出 | persistence | CT-F20-001, CT-F20-010 | L3 | `ct-f20-010` 生产 `createService.start`+submit 写出带 `contentSha256` 的 file_version；改 blob 后 `listExecRecords`/`readExecRecord`/`exportExecPack` 不得 complete/present；`hash_mismatch`/`mismatch`/`failed` | temp-root | covered | direct；本批新钉 CT-F20-010，不是只改 V2R-02 binding，不是手插 ExecStore；不升 STO-03/04；非整约 accepted |
| F20-STO-02 | 凭证不进证据/导出；删减可辨认 | redact Bearer/query/apiKey | 脱敏包不宣称原文完整 | 诊断包 | security | CT-F20-002, CT-F20-008 | L1 | `ct-f20-008` 对象 Authorization/apiKey/token/query；导出 originalComplete=false | temp-root | covered | 绑定测试候选；非业务 accepted |
| F20-STO-03 | failed 仍保存正文且可读 hash | 采集失败 | 不伪装完整 | F17 | persistence | CT-F20-003, CT-F20-011 | L3 | `ct-f20-011` 生产 `createService.start`+submit；生产 OpenAI stream 503 无正文；`listExecRecords`/`readExecRecord` 至少一条 `contentStatus=failed` 仍有可读正文与 `contentSha256`；hash 对得上；不得 complete | temp-root | covered | direct；本批新钉 CT-F20-011，不是只改 V2R-04 binding，不是手插 ExecStore，不是复述 CT-F20-010 改 blob mismatch；非整约 accepted |
| F20-STO-04 | 内容目录不可写 insert 不得假装 complete | failed marker | 不改已提交执行结果 | DB 失败 × 内容 | persistence | CT-F20-004, CT-F20-012 | L3 | `ct-f20-012` 生产 `createService.start` 后再让 `exec-evidence` 不可写；主循环新 record 不得 complete；须 failed/writeError/collection_gap；`listTasks` 终态仍 done | temp-root | covered | direct；本批新钉 CT-F20-012，不是只改 V2R-11 / CT-F20-004 binding，不是手插空库；非整约 accepted |
| F20-STO-05 | Seatbelt profile 含 evidence realpath 与 write deny | 策略字符串 | 读/写证据拒 | 真实 sandbox | security | CT-F20-005, CT-F20-009 | L2 | `ct-f20-009` profile 含 evidence realpath 与 write deny；Darwin sandbox-exec 写拒 | temp-root | covered | direct；本批点名 realpath + write deny + Darwin 写拒；不因 AT-F20-001 外推；非 accepted |
| F20-STO-06 | 真实 sandbox-exec 拒写 evidence | native | 别名路径同样拒 | F06 | security | AT-F20-001 | L4 | `at-f20-001` sandbox-exec 拒读写+blob mismatch | temp-root | covered | Darwin；非 macOS 必须 skipped: platform |
| F20-STO-07 | 流式/查询/导出/内存有上限 | 长会话有界 | 大正文不进 reducer | 性能 | persistence | UT-F20-001, CT-F20-006 | L1 | `ct-f20-006` 四条 EXEC_LIMITS 运行时强制+大正文；非多小时会话 | temp-root | covered | 绑定测试候选；非业务 accepted |
| F20-STO-08 | DB 失败后孤立内容可清理 | 清理入口 | 不留无引用 blob | 迁移中断 | persistence | CT-F20-006 | L3 | `ct-f20-006` cleanupOrphanExecContent | temp-root | covered | 绑定测试候选；非业务 accepted |
| F20-STO-09 | 保留/清理规则已登记并验证 | 本地策略 | 故障行为有界 | 长会话 | persistence | CT-F20-007 | L3 | `ct-f20-007` 过期孤儿删、引用/未过期留、失败不假装 | temp-root | covered | 绑定测试候选；非业务 accepted |

### F21 查询与导出

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F21-QRY-01 | list/read/export_exec 形状与 requestId | decode | 非法形状同 F13 | F01 | identity | UT-F21-001, CT-F21-006 | L2 | `ct-f21-006` 真实 WS list/read/export_exec_pack 同 requestId；非法不写 blob | temp-root | covered | direct；本批钉真实 WS 合法/非法形状；非 accepted |
| F21-QRY-02 | 错 token / 无凭证查询不得写入 | 401 | 无副作用 | F01 | security | CT-F21-001, CT-F21-007 | L2 | `ct-f21-007` createService.start 真实 WS；先正确 token 落 exec 证据且 list 非空；快照 exec 树/行数/空 destDir；错/无 token list/read/export 均 4401 不得 hello、不写 destDir；之后树与行数不变 destDir 仍空；对照正确 token list 仍成功 | temp-root | covered | direct；本批新钉 CT-F21-007，不是复述 CT-F01-018/021，不是只改 CT-F21-001 / f17-f21 binding；非整约 accepted |
| F21-QRY-03 | 导出可独立列出 operation 与文件，缺文件标 missing | destDir | 完整性标记 | F23 | persistence | CT-F21-002, CT-F21-008 | L3 | `ct-f21-008` createService 真实 write_file 落 hash；destA 列出 operation 且对应文件不 missing；unlink blob 后 destB 同 operation 标 missing 且可离开工作区打开 manifest；destA 不被第二次改写 | temp-root | covered | direct；本批新钉 CT-F21-008，不是复述 CT-F20-010；不升 F23-PKG-05 / PER-BLOB-EXPORT / F21-QRY-06；非整约 accepted |
| F21-QRY-04 | 查询只读已保存事实，不触发模型/工具 | list/read | 无重执行 | F24 | persistence | CT-F21-004 | L3 | `ct-f21-004` list/read/export 期间 chat/run 为 0 | temp-root | covered | 绑定测试候选；非业务 accepted |
| F21-QRY-05 | 大正文按需读取，有加载/失败/缺失状态 | UI 按需 | 不进 reducer | F20/F22 | persistence | CT-F22-003, CT-F21-005 | L1 | `ct-f21-005` read_exec_record complete/missing/failed；未改 UI | temp-root | covered | 绑定测试候选；非业务 accepted |
| F21-QRY-06 | 导出可离开当前工作区独立检查 | 无用户根 | 无凭证 | F23 | persistence | CT-F23-001, CT-F21-009 | L3 | `ct-f21-009` createService 真实 WS `export_exec_pack` 到独立 dest；close 后删 home，只读 dest 打开 manifest 并列出 operation/文件；dest 无 settings.json/.env/agent-service.json/lumen.sqlite/token/apiKey | temp-root | covered | direct；本批新钉 CT-F21-009，不是复述 CT-F23-003 / CT-F21-008；不升 F23-PKG-01 / F23-PKG-03；非整约 accepted |

### F22 bad case 绑定

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F22-BAD-01 | mark→list→重开 store 仍在；update 不改 task_events | 持久 | 不改写原执行 | 切会话 | persistence | CT-F22-001, CT-F22-005 | L3 | `ct-f22-005` createService 真实 WS mark→list→close 再 start 仍同 id/actual；update_bad_case 后 task_events 逐字节不变且 list 看到更新 | temp-root | covered | direct；本批新钉 CT-F22-005，不是只改 f22-f24 store 直测 binding；不升 BAD-02/03/05/06；非整约 accepted |
| F22-BAD-02 | 客户端有 mark/list/update/export/replay 入口 | 文案走 copy | 回答/工具行可标记 | UI | identity | UT-F22-001, CT-F22-007 | L1 | `ct-f22-007` jsdom+createRoot 真实渲染 ChatTranscript/ProcessRow/BadCaseDialog；回答行与工具行可标记，文案走 BAD_CASE_COPY.markIssue；Dialog 走到 mark/list/update/export/replay | temp-root | covered | direct；本批新钉 CT-F22-007，不是 UT-F22-001 / governance-f22 readFile 源码扫描。不升 BAD-05、F24-RPL-11；非整约 accepted |
| F22-BAD-03 | bad case 正文不进 chat reducer | 大正文 | 按需读 | F20 | persistence | CT-F22-003, CT-F22-008 | L1 | `ct-f22-008` 真实 reduceUserFacingItems + useAgent reduce；20k actual/expected 不进 items；Dialog 本地可持有正文，transcript 快照不含该串 | temp-root | covered | direct；本批新钉 CT-F22-008，不是只改 CT-F22-003 binding。不升 BAD-05；非整约 accepted |
| F22-BAD-04 | 回答差/工具失败/证据缺失均能表达 | 三类标记 | 历史缺口标明 | F23 | identity | CT-F22-004 | L3 | `ct-f22-004` 三类 kind 持久可 list | temp-root | covered | 绑定测试候选；非业务 accepted |
| F22-BAD-05 | 切会话/重连/重开后仍可查看更新 | 不靠当前视图猜归属 | 迟到刷新 | F05/F12 | identity | AT-F24-001 | L4 | `at-webkit-env` skipped: environment | real-webkit | uncovered | 调查入口未接线 |
| F22-BAD-06 | 旧操作 unknown 认事件自己的 turn | 不得猜新轮 | V2R-13 | F24 | identity | RP-F22-001, CT-F22-006 | L3 | `ct-f22-006` createService 真实 WS 第一轮纯 reply → continue 第二轮 → mark_bad_case(turnId=unknown, 第一轮 operationId) 落到第一轮 turn，不得第二轮 / unknown / 最后一条 turn_start；对照第二轮 operationId+unknown 落到第二轮 | temp-root | covered | direct；本批新钉 CT-F22-006，不是复述 RP-F22-001 / V2R-13 直调；不升 BAD-02/03/05；非整约 accepted |

### F23 诊断包

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F23-PKG-01 | 包含反馈、配置、事件、请求/工具/文件证据 | 无 apiKey | 脱敏 | F20/F21 | persistence | CT-F23-001, CT-F23-006 | L3 | `ct-f23-006` createService 真实 WS write_file → mark_bad_case → export_diagnostic 独立 dest；dest 定位反馈/配置/事件/exec 证据；全文无 apiKey 密钥、无 sk-secret- 原值 | temp-root | covered | direct；本批新钉 CT-F23-006，不是复述 CT-F21-009 / CT-F23-003；不升 F23-PKG-02；非整约 accepted |
| F23-PKG-02 | 只有 response 不得 completeAudit | 不完整声明 | 缺证据仍可生成 | F24 | persistence | RP-F23-001, CT-F23-007 | L3 | `ct-f23-007` createService 真实 WS 纯 reply → mark_bad_case → export_diagnostic 独立 dest；dest 可开；completeAudit===false；gaps 含 redacted/not_collected（absent/missing 一类） | temp-root | covered | direct；本批新钉 CT-F23-007，不是复述 CT-F23-006 / V2R-09 直插；不升 PKG-03/04/05；非整约 accepted |
| F23-PKG-03 | 无真实数据根仍可检查 | 独立目录 | 不读当前源文件 | 隔离根 | persistence | CT-F23-002, CT-F23-003 | L3 | `ct-f23-003` 独立 destDir 读清单 | temp-root | covered | 绑定测试候选；非业务 accepted |
| F23-PKG-04 | 不自动上传外部 | 生成本地 | 无网络发送 | 交付 | security | CT-F23-004 | L3 | `ct-f23-004` fetch/upload=0 产物只在 destDir | temp-root | covered | 绑定测试候选；非业务 accepted |
| F23-PKG-05 | 清单足以定位并校验完整性 | hash/missing | 篡改可发现 | F20 | persistence | CT-F20-001, CT-F23-005 | L3 | `ct-f23-005` createService 真实 write_file 落 hash；`export_exec_pack` 后用清单 sha256 定位 dest 副本，原 hash 等于清单；改写 dest 后 hash ≠ 清单；不改 home 源 blob | temp-root | covered | direct；本批新钉 CT-F23-005，不是复述 CT-F20-010 / CT-F21-008；不升 PER-BLOB-EXPORT / F23-PKG-01；非整约 accepted |

### F24 受控回放与质量闭环

| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F24-RPL-01 | 历史查看/续跑/录制回放/重调模型分别表达 | 四种能力 | 回放不混续跑 | 身份 | identity | UT-F24-001, CT-F24-011 | L3 | `ct-f24-011` 历史查看不 spawn turn；continue 进循环；replay≠continue；live_eval 与 recorded_replay 可分 | temp-root | covered | direct；本批钉真实服务路径四身份；非 accepted |
| F24-RPL-02 | 录制回放 tool run=0，数据根无新副作用 | 跑完 | 不打真模型 | 隔离根 | persistence | RP-F24-001, CT-F24-012 | L3 | `ct-f24-012` createService 真实 WS write_file → mark_bad_case → replay_recorded 独立 dataRoot；use=recorded_replay 且 done；ScriptedModel 剩余次数不被吃；home/dataRoot 无回放新 notes | temp-root | covered | direct；本批新钉 CT-F24-012，不是复述 RP-F24-001 / f22-f24 直调；不升 RPL-03；非整约 accepted |
| F24-RPL-03 | 缺 response 失败，不调用真 ModelPort | 明确失败 | 不回退真执行 | 缺口失败 | persistence | RP-F24-002, CT-F24-013 | L3 | `ct-f24-013` createService 真实 WS 纯 reply → mark_bad_case → 同 home SQLite 删 model_response → replay_recorded 独立 dataRoot；error 或 status=failed；不得 done/live_eval；ScriptedModel 剩余次数不被吃 | temp-root | covered | direct；本批新钉 CT-F24-013，不是复述 CT-F24-012 / f22-f24 直调；不升 RPL-04；非整约 accepted |
| F24-RPL-04 | 缺工具正文必须失败，不得改 ok | 不兼容 | 不悄悄成功 | 证据损坏 | persistence | RP-F24-003, CT-F24-014 | L3 | `ct-f24-014` createService 真实 WS write_file → mark_bad_case → unlink tool blob → replay_recorded；失败不得 done/ok；get_bad_case lastVerification 不得记成功；ScriptedModel 剩余次数不被吃 | temp-root | covered | direct；本批新钉 CT-F24-014，不是复述 CT-F21-008 / CT-F20-010 / V2R-08 直调；不升 RPL-05；非整约 accepted |
| F24-RPL-05 | 选定第二轮不得回放第一轮 | 跨轮选择 | 记到该问题 | 身份 | identity | RP-F24-004, CT-F24-015 | L3 | `ct-f24-015` createService 真实 WS 第一轮纯 reply TURN_ONE → continue 第二轮 TURN_TWO → mark_bad_case 绑第二轮真实 turnId+operationId → replay_recorded 独立 dataRoot；done；reply 含 TURN_TWO、不得含 TURN_ONE；get_bad_case lastVerification 落到该 badCaseId | temp-root | covered | direct；本批新钉 CT-F24-015，不是复述 V2R-07 直插；不升 RPL-06；非整约 accepted |
| F24-RPL-06 | 同轮兄弟 operation 不得串入选定回放 | 父子闭包 | 不收集整轮 | 同 turn 多 op | identity | RP-F24-005, CT-F24-016 | L3 | `ct-f24-016` createService 真实 WS 选定 reply SELECTED_OP → mark_bad_case 绑该 operation → 同 turn ExecStore 插兄弟 SIBLING_OP → replay_recorded；reply 含 SELECTED、不得含 SIBLING | temp-root | covered | direct；本批新钉 CT-F24-016，不是复述 V2R-17 全直插；不升 ID-TURN-MULTI-OP / RPL-07；非整约 accepted |
| F24-RPL-07 | 回放根不得落用户 lumenHome | 隔离入口 | 拒绝用户根 | 权限 | security | RP-F24-006, CT-F24-017 | L3 | `ct-f24-017` createService 真实 WS 纯 reply → mark_bad_case → replay_recorded dataRoot=home 或 home 子目录必须 error 不得 done，home 无回放产物；独立 dest 可 done | temp-root | covered | direct；本批新钉 CT-F24-017，不是复述 V2R-15 纯函数 / RP-F24-006 binding；不升 SEC-REPLAY-ROOT；非整约 accepted |
| F24-RPL-08 | expected 对不上不得记 done | 质量评估 | 机械故障用确定断言 | 闭环 | identity | RP-F24-007, CT-F24-018 | L3 | `ct-f24-018` createService 真实 WS 纯 reply REPLY_CT_F24_018 → mark_bad_case expected 故意对不上 MUST_NOT_MATCH_DOI_CT_F24_018 → 独立 dest replay_recorded 不得 done；get_bad_case lastVerification 不得 done/passed，assertion=failed | temp-root | covered | direct；本批新钉 CT-F24-018，不是复述 V2R-16 直调 / RP-F24-007 binding；不升 RPL-09/10；非整约 accepted |
| F24-RPL-09 | bad case → 诊断包 → 回放 → 记录验证结果 | 完整路径 | 关联原问题与版本 | F22/F23 | identity | RP-F24-008, RP-F24-010 | L5 | `rp-f24-010` get_bad_case 读 lastVerification use/status/gaps+problem/version | temp-root | covered | 绑定测试候选；非业务 accepted；无 WebKit |
| F24-RPL-10 | 重新调用模型是显式质量评估，不承诺相同答案 | 与回放分开 | 不把工具结果当全部外部状态 | 重新调用模型 × 录制回放结果 × 质量评估 | identity | RP-F24-009 | L5 | `rp-f24-009` live_eval≠recorded_replay | temp-root | covered | 绑定测试候选；非业务 accepted |
| F24-RPL-11 | 真实调查入口走查 | UI 选操作回放 | 缺口失败可见 | installed-app | delivery | AT-F24-001 | L4 | `at-webkit-env` skipped: environment | real-webkit | uncovered | V2R-14；未设 LUMEN_AT_WEBKIT=1 |

---

## 2. 风险组合矩阵

组合必须有稳定 `combo_id`。文件名 `governance-roundN` 不是覆盖证明。`status` 同样禁止 `accepted`。

### 2.1 身份

| combo_id | 必测组合 | 映射行为 | test_ids | status | notes |
|---|---|---|---|---|---|
| ID-TURN-MULTI-OP | 同一 turn 多 operation 回放 | F24-RPL-06 | RP-F24-005 | partial | 有公开回归；未绑候选 |
| ID-SWITCH-UPLOAD | A 切 B 后上传/发送 | F05-DST-02, F05-DST-07 | CT-F05-002, CT-F05-007 | partial | jsdom；缺 WebKit |
| ID-STALE-CONN | 旧连接迟到响应 | F13-REQ-06 | CT-F13-006 | partial | |
| ID-MAIN-CHILD-OP | 主/子 operation 归属 | F07-RES-02、F10-ID-06 | IT-F07-001、CT-F10-006、CT-F10-013 | covered | `ct-f10-013` 真实 createService+spawn；子循环挂父 task；parentOperationId 保留；子 op 不改写成 main |
| ID-AUX-CALL | 标题/修图/识图辅助身份 | F10-ID-03, F10-ID-04, F10-ID-05 | CT-F10-003, CT-F10-004, CT-F10-005, CT-F10-020, CT-F10-021, CT-F10-022, CT-F10-024 | covered | F10-ID-03/04/05 均已钉；`ct-f10-024` 钉修图生产 cancel 仍属原 operation；非整约 accepted |
| ID-DRAFT-GEN | 会话/草稿/文件世代 | F05-DST-04, F05-DST-05, F05-DST-06 | CT-F05-004, CT-F05-005, CT-F05-006 | partial | 全矩阵未穷尽 |
| ID-PROVIDER-VS-HOST | provider toolCallId ≠ 宿主 operation | F10-ID-01, F10-ID-07 | CT-F10-001, CT-F10-007, CT-F10-014, CT-F10-015 | covered | `ct-f10-014` 钉宿主 operation ≠ providerCallId；`ct-f10-015` 钉生产工具已知失败不得 ok（含 run_code 非零 + 正文含 error 仍 ok） |

### 2.2 生命周期

| combo_id | 必测组合 | 映射行为 | test_ids | status | notes |
|---|---|---|---|---|---|
| LC-CANCEL-RESUME | cancel/crash × resume | F04-IDM-04、F07 | IT-F04-001 | partial | crash 未真杀进程 |
| LC-PARENT-LIVE-CHILD | 父完成 × live child | F03-DRN-08、F10-ID-09 | CT-F10-009, CT-F03-014, CT-F10-018 | covered | F03-DRN-08 已钉；`ct-f10-018` 真实 createService 钉 live 兄弟不误封 + 末子 complete 后同进程 unknown、不经 sweep、不跑工具 |
| LC-SHUTDOWN-MODEL | shutdown × pending model | F03-DRN-04 | CT-F03-004, CT-F03-012 | covered | abort-deaf close 超时失败且锁仍在 |
| LC-CLOSE-REOPEN | close 后再开旧任务不得 running | F03-DRN-05 | CT-F03-005, CT-F03-009 | covered | 第二实例必须 start |
| LC-REPEAT-CLOSE | 重复关闭 / 部分启动释放 | F03-DRN-06、F11 | CT-F03-006, CT-F11-006 | covered | close/组装/坏 DB 放锁 |
| LC-INTENT-PERSIST | 关闭常驻意图落盘后重开 | F15-INT-04 | AT-F15-001 | uncovered | 原生 |

### 2.3 并发

| combo_id | 必测组合 | 映射行为 | test_ids | status | notes |
|---|---|---|---|---|---|
| CON-REQID | 并发 requestId | F13-REQ-05 | CT-F13-005 | partial | |
| CON-DUAL-SUBMIT | 双 submit | F05-DST-03 | CT-F05-003 | partial | |
| CON-LOCK-SWAP | 锁发布/回收/释放交错 | F02-OWN-05, F02-OWN-06, F02-OWN-09 | CT-F02-005, CT-F02-006, CT-F02-009 | partial | 全入口未穷尽 |
| CON-TRIPLE-RECLAIM | 三进程回收窗口 | F02-OWN-02 | CT-F02-002 | partial | |
| CON-TWO-CREATE | 两新建上传并发 | F05-DST-09 | CT-F05-009 | partial | |
| CON-LOCK-SAME-INODE | 同 inode 全入口证据 | F02-OWN-05 | CT-F02-013 | covered | abandon/release/finish/publish/reclaim |

### 2.4 持久化

| combo_id | 必测组合 | 映射行为 | test_ids | status | notes |
|---|---|---|---|---|---|
| PER-DB-EVENT | DB 失败 × 事件回滚 | F08-TXN-01, F08-TXN-02, F08-TXN-03, F08-TXN-04, F08-TXN-05, F09-DUR-01, F09-DUR-02, F09-DUR-03, F09-DUR-04 | CT-F08-001, CT-F08-002, CT-F08-003, CT-F08-005, CT-F08-006, CT-F08-007, CT-F08-008, CT-F08-009, CT-F08-010, IT-F08-001, IT-F08-002, CT-F09-001, CT-F09-002, CT-F09-003, CT-F09-011, CT-F09-012, CT-F09-013 | covered | 四转换有 CT-F08-005；F08-TXN-01..05 与 F09-DUR-01..04 均 covered；非整约 accepted |
| PER-BLOB-EXPORT | blob 篡改 × 导出 | F20-STO-01、F23 | CT-F20-001 | partial | |
| PER-MIGRATE | 迁移中断 × 重启 | 保持性 schema | IT-F08-003 | partial | `governance-batch2`「未来 schema 拒绝打开;v10 半成品可重启」；非全迁移矩阵 |
| PER-ORPHAN | 孤立内容清理 | F20-STO-08 | CT-F20-006 | covered | |
| PER-JSONL | JSONL 失败不改执行 | F09-DUR-06 | CT-F09-006, CT-F09-015 | covered | `ct-f09-015` 文件级 jsonl 失败不改执行；只绑 F09-DUR-06 |
| PER-ATTEMPT | 重试 attempt 与流式中断 | F17-REQ-04, F17-REQ-06 | CT-F17-004, CT-F17-006, CT-F17-009 | covered | CT-F17-009 把 503 与 SSE 中断钉在同一路径 |

### 2.5 权限

| combo_id | 必测组合 | 映射行为 | test_ids | status | notes |
|---|---|---|---|---|---|
| SEC-SANDBOX-EVIDENCE | 真实 sandbox × evidence | F20-STO-06 | AT-F20-001 | covered | Darwin sandbox-exec；非 macOS skip |
| SEC-SYMLINK-WRITE | 软链别名 × 写入 | F02-OWN-07、F06-SEC-05 | CT-F02-007, CT-F06-005 | covered | 锁路径 + 凭证/evidence 软链写拒 |
| SEC-DIAG-REDACT | 诊断包脱敏 | F20-STO-02、F23 | CT-F20-002, CT-F20-008 | covered | 结构化字段+originalComplete；非 accepted |
| SEC-DEFAULT-CUSTOM | 默认根 × 自定义根 | F06-SEC-01, F06-SEC-02 | CT-F06-001, CT-F06-002, CT-F06-007, CT-F06-008 | covered | F06-SEC-01/02 本批 Darwin 读拒均已钉；非 Darwin skip 不得外推；非 accepted |
| SEC-REPLAY-ROOT | 回放根 ≠ 用户 lumenHome | F24-RPL-07 | RP-F24-006 | partial | |
| SEC-ORIGIN-TOKEN | 外站 Origin + 正确 token | F14-ORI-02, F14-ORI-03 | CT-F14-002, CT-F14-003 | partial | |

### 2.6 交付

| combo_id | 必测组合 | 映射行为 | test_ids | status | notes |
|---|---|---|---|---|---|
| DEL-INTENT-UNKNOWN | intent × unknown PID | F16-HAN-02 | CT-F16-001, CT-F16-009, CT-F16-014 | covered | `ct-f16-014` 意图 true/false 与未知活实例交叉：classifyLiveOwner=unknown、decideInstallAction=conflict；不得调用 installLaunchAgent；读回意图不变 |
| DEL-LAUNCHD-FAIL | launchd 失败 × 重开 | F16-HAN-07, F16-HAN-10 | CT-F16-006, CT-F16-013 | partial | F16-HAN-07 本批 covered；原生重开仍 uncovered |
| DEL-BUILD-HASH | 构建产物 × 安装 hash | F16-HAN-12 | AT-F16-004 | partial | 两侧 57ee40da…；本轮未新构建；服务未重装 |
| DEL-FIRST-BOOT | 首次无意图自动装 | F15-INT-01 | IT-F15-001, CT-F15-002 | covered | 隔离 HOME 真实 status；非生产 label / 非真机用户 HOME |
| DEL-OWNED-DRAIN | 自有 sidecar 排空交接 | F16-HAN-06, F16-HAN-11 | CT-F16-005 | partial | 待原生 |
| DEL-SETTINGS-NATIVE | 设置页关闭/开启可见态 | F15-INT-05、F16-HAN-09 | AT-F15-002、AT-F16-001 | uncovered | |

---

## 3. 环境分层与执行入口

| 环境 | 允许证明 | 禁止外推 | 命令 |
|---|---|---|---|
| temp-root | L0–L3、L5 隔离回放 | 用户 HOME、真实 launchd、WebKit | `npm test --workspace @lumen/agent-service`；`npm test --workspace @lumen/ui-client` |
| 主题合同 | L0 青瓷变量 | 视觉对比度实机 | `npm run check:theme -w packages/ui-client` |
| 统一门禁 | 上述命令集合的规模与退出码 | 任何 F 合同 `accepted` | `npm run verify` |
| isolated-home | F15/F16 意图与 plist | 真实用户 LaunchAgent | `LUMEN_AT_ISOLATED_HOME=1` 才跑 AT-F15-001；默认 skip |
| launchd | 隔离 label 真托管 | 用 PID 71847 当故障样本；bootstrap 生产 label | AT-F16-001 默认用 `com.lumen.agent-service.test.*`；AT-F16-003 仍须隔离 sidecar |
| real-webkit / installed-app | F05/F12/F22/F24 用户可见 | jsdom/hook 通过 | `LUMEN_AT_WEBKIT=1` 才跑 AT-F05/F12/F24；默认 skip |

Darwin 依赖：`CT-F06-002`、`IT-F06` Seatbelt、`CT-F06-010`、`AT-F20-001`。非 macOS 必须 `skipped: platform`。

---

## 4. 现有测试盘点（规模，不是覆盖）

公开测试文件：agent-service 98、ui-client 46。治理相关入口已映射到上表 `test_ids`。

未纳入 F 合同主路径、仅作保持性邻居的目录：`adapters/`、`research/`、`skills/`、`invariants/`（线程铁律）、`replay/`（厂商线格式，不是 F24 受控回放）、大量 UI 视觉/滚动测试。它们可以支撑保持性，不能填补上表 `uncovered`。

`/tmp/lumen-v2-*.mts|mjs` 私有探针：发现缺陷后须转为上表 CT/AT/RP。本阶段不把探针 exit 0 登记为证据。

---

## 5. 缺陷登记

完整 brief §8 字段（含 `symptom` / `minimal_repro` / `actual` / `expected` / `mechanism` / `structural_root_cause` / `fix_layer`）只写在 [`testing-defects.md`](testing-defects.md)。本节是索引，不能单独充当“已登记”。

同一根因类连续两次 → 暂停局部补丁，先修身份/状态/事务模型。P1 出现时停止扩展功能。原始反例消失但组合未覆盖 → 仍 `partial`。

| defect_id | 完整记录 | status |
|---|---|---|
| V2R-01 | [testing-defects.md#v2r-01](testing-defects.md#v2r-01) | open |
| V2R-02 | [testing-defects.md#v2r-02](testing-defects.md#v2r-02) | open |
| V2R-03 | [testing-defects.md#v2r-03](testing-defects.md#v2r-03) | partial-fix |
| V2R-04 | [testing-defects.md#v2r-04](testing-defects.md#v2r-04) | partial-fix |
| V2R-05 | [testing-defects.md#v2r-05](testing-defects.md#v2r-05) | partial-fix |
| V2R-06 | [testing-defects.md#v2r-06](testing-defects.md#v2r-06) | partial-fix |
| V2R-07 | [testing-defects.md#v2r-07](testing-defects.md#v2r-07) | partial-fix |
| V2R-08 | [testing-defects.md#v2r-08](testing-defects.md#v2r-08) | partial-fix |
| V2R-09 | [testing-defects.md#v2r-09](testing-defects.md#v2r-09) | partial-fix |
| V2R-10 | [testing-defects.md#v2r-10](testing-defects.md#v2r-10) | open |
| V2R-11 | [testing-defects.md#v2r-11](testing-defects.md#v2r-11) | partial-fix |
| V2R-12 | [testing-defects.md#v2r-12](testing-defects.md#v2r-12) | partial-fix |
| V2R-13 | [testing-defects.md#v2r-13](testing-defects.md#v2r-13) | partial-fix |
| V2R-14 | [testing-defects.md#v2r-14](testing-defects.md#v2r-14) | open |
| V2R-15 | [testing-defects.md#v2r-15](testing-defects.md#v2r-15) | partial-fix |
| V2R-16 | [testing-defects.md#v2r-16](testing-defects.md#v2r-16) | partial-fix |
| V2R-17 | [testing-defects.md#v2r-17](testing-defects.md#v2r-17) | partial-fix |

---

## 6. 统一报告字段与候选门禁

每轮报告至少：

```text
candidate_id
worktree: HEAD + dirty digest
commands: 命令与退出码
levels: L0..L5 实际跑了哪些
behaviors: 本轮触及的 behavior_id
combos: 本轮触及的 combo_id
environment
evidence_paths
defects_failed_or_reopened
uncovered_remaining
pass_count: 规模 only
```

门禁：

```text
代码/测试写入
→ 变更影响图（behavior_id + combo_id）
→ 失败复现与修复
→ 受影响层级及组合回归
→ npm run verify
→ candidate manifest（git diff、文件 hash、环境摘要）
→ 冻结候选
→ 主模型独立验收（禁止写入）
```

验收发现缺陷：当前候选作废；修复必须新候选。验收过程中补测试或改断言后，原候选证据作废。

`MAIN_PASS` 仅当同时满足：

1. 本轮范围内每个 `behavior_id` 为 `accepted`
2. P1/P2、reopened defect 均为零
3. 必测组合矩阵无 `uncovered`
4. L4/L5 必需交付证据已绑定同一候选
5. 未覆盖清单已明确归属，不存在用绿灯推断的隐藏路径

本基线五条全部不满足。

---

## 7. 本批已执行的补测任务（最小集，按风险）

2026-09-08 整批已落仓库测试入口。结果以 [`testing-manifest.json`](testing-manifest.json) 为准；跳过不得记通过。

| 优先级 | 计划 test_id | 行为/组合 | 层级 | 环境 | 说明 |
|---|---|---|---|---|---|
| P0 | AT-F16-001/003 | F16-HAN-09/11、DEL-OWNED-DRAIN | L4 | launchd + isolated-home | AT-F16-001 隔离 label 真装;003 与设置页仍环境阻塞；禁止动 PID 71847 |
| P0 | AT-F15-001 | F15-INT-04、LC-INTENT-PERSIST | L4 | isolated-home + installed-app | 关闭→退出→重开 |
| P0 | AT-F20-001 | F20-STO-06、SEC-SANDBOX-EVIDENCE | L4 | temp-root + sandbox-exec | 真实 evidence 写保护 |
| P0 | CT-F02-013 | CON-LOCK-SAME-INODE | L3 | temp-root | 发布/放弃/释放/完成同 inode |
| P0 | CT-F18-002 | F18-CTX-02/03 | L3 | temp-root | 来源 vs 注入；fold/vision/summary/filter/omit |
| P0 | CT-F18-003 | F18-CTX-04 | L3 | temp-root | 工具/limits/fold 约束快照 |
| P0 | CT-F07-006 | F07-RES-06、F18-CTX-05 | L3 | temp-root | 四类 resultSource |
| P1 | CT-F17-006 | F17-REQ-06、PER-ATTEMPT | L3 | temp-root | 流式中断采集 |
| P1 | CT-F08-005 | F08-TXN-07 | L3 | temp-root | 注册/恢复原子失败 |
| P1 | CT-F10-012 | F10-ID-13/14 | L3 | temp-root | 意图失败不启动；WS spawn exec_records |
| P1 | AT-F05-001 / AT-F12-001 | F05-DST-11、F12-VW-06 | L4 | real-webkit | 上传与 Reader 世代 |
| P1 | AT-F24-001 | F22-BAD-05、F24-RPL-11 | L4 | real-webkit | 调查入口 |
| P1 | CT-F19-004 | F19-TOL-04/05 | L3 | temp-root | run_code 进 exec_records + 信号 + 超时 |
| P1 | CT-F17-007 | F17-REQ-07 | L3 | temp-root | version/config 不精确标记 |
| P1 | CT-F17-008 | F17-REQ-08 | L3 | temp-root | 视觉变换前后对照 |
| P1 | CT-F22-004 | F22-BAD-04 | L3 | temp-root | 三类 bad case |
| P1 | CT-F23-003 | F23-PKG-03 | L3 | temp-root | 独立 destDir 无根检查 |
| P1 | CT-F23-004 | F23-PKG-04 | L3 | temp-root | 诊断包不上传 |
| P2 | CT-F20-006 | F20-STO-07/08 | L3 | temp-root | blob 上限、孤立清理、四条 EXEC_LIMITS |
| P2 | CT-F20-007 | F20-STO-09 | L3 | temp-root | 保留策略与过期清理 |
| P2 | CT-F21-004 | F21-QRY-04 | L3 | temp-root | 查询不触发模型/工具 |
| P2 | CT-F13-007 | F13-REQ-07 | L3 | temp-root | 全 type 超时 |
| P2 | CT-F13-011 | F13-REQ-01 | L3 | temp-root | 写业务 type 形状非法回同一 id;无副作用 |
| P2 | CT-F13-012 | F13-REQ-02 | L3 | temp-root | 非法 requestId 不伪造;随后合法 list |
| P2 | CT-F13-013 | F13-REQ-04 | L2 | temp-root | 活服务上未连接 list 立即拒绝;connect 后成功 |
| P2 | CT-F13-014 | F13-REQ-05 | L3 | temp-root | 生产 createService 两项目并发 list 不串;不升 CON-REQID |
| P2 | CT-F13-015 | F13-REQ-06 | L3 | temp-root | 生产 createService 旧 socket 迟到帧不得结算新 list;不升 ID-STALE-CONN |
| P2 | CT-F14-006 | F14-ORI-01 | L3 | temp-root | 生产 createService HTTP/WS 本机空 Origin 放行外站拒;不升 ORI-02/03/04 |
| P2 | CT-F14-007 | F14-ORI-02 | L3 | temp-root | 生产 createService POST /upload 外站 403+本机回显;不升 ORI-04 / SEC-ORIGIN-TOKEN |
| P2 | CT-F14-008 | F14-ORI-03 | L3 | temp-root | 生产 createService WS 外站 4403 无 hello/无 task;本机 hello+list;不升 ORI-04 |
| P2 | CT-F13-008 | F13-REQ-03/07 | L3 | temp-root | get_settings/list_projects 短超时；REQ-07 仍 partial |
| P2 | CT-F13-009 | F13-REQ-07 | L3 | temp-root | submit/continue 短超时；REQ-07 仍 partial |
| P2 | CT-F13-010 | F13-REQ-07 | L3 | temp-root | createProject/listSkills 短超时；REQ-07 仍 partial |
| P2 | CT-F01-011 | F01-PRE-01 | L2 | temp-root | decoder 前残握手/坏 target |
| P2 | CT-F02-014 | F02-OWN-11 | L2 | temp-root | 真实 FS 第二句柄不得删活锁 |
| P2 | CT-F21-006 | F21-QRY-01 | L2 | temp-root | 真实 WS list/read/export 同 requestId |
| P2 | CT-F21-007 | F21-QRY-02 | L2 | temp-root | 先落证据再错/无 token 三查询 4401；不写 destDir |
| P2 | CT-F21-008 | F21-QRY-03 | L3 | temp-root | destA 完整导出后删 blob；destB 同 operation 标 missing |
| P2 | CT-F21-009 | F21-QRY-06 | L3 | temp-root | export_exec_pack 后删 home；只读 dest 无凭证 |
| P2 | CT-F23-005 | F23-PKG-05 | L3 | temp-root | 改写 dest 副本后 sha256 ≠ 清单；不改源 blob |
| P2 | CT-F24-011 | F24-RPL-01 | L3 | temp-root | 四种能力服务路径分开 |
| P2 | CT-F01-012 | F01-DEC-01 | L2 | temp-root | decode 拒帧后无 upload/task；仍 partial |
| P2 | CT-F01-013 | F01-DEC-01 | L2 | temp-root | 未知 type + 非法 requestId 后无 upload/task；仍 partial |
| P2 | CT-F01-014 | F01-DEC-01 | L2 | temp-root | 截断/半帧后无 upload/task；仍 partial |
| P2 | CT-F01-015 | F01-DEC-01 | L2 | temp-root | 非法 settings/exec 写入后无副作用；仍 partial |
| P2 | CT-F01-016 | F01-DEC-01 | L2 | temp-root | 非法 set_model/create_project/mark_bad_case 后无副作用；仍 partial |
| P2 | CT-F01-017 | F01-DEC-01 | L2 | temp-root | 非法 rename/archive_project/install_skill/update_bad_case 后无副作用；仍 partial |
| P2 | CT-F16-010 | F16-HAN-03 | L1 | temp-root | live.pid==job.pid + 可连端口 + lastExit=1 → already |
| P2 | CT-F16-011 | F16-HAN-04 | L1 | temp-root | 无确认活持有者才 bootstrap；未知活 PID → conflict |
| P2 | CT-F16-012 | F16-HAN-08 | L2 | temp-root | 真实入口 SIGTERM 走 handle.close；短超时非 0 |
| P2 | CT-F16-013 | F16-HAN-07 | L2 | temp-root | 假 launchctl：wait 失败 bootout；冲突不 kickstart |
| P2 | CT-F03-008 | F03-DRN-07 | L3 | temp-root | close 后旧执行不得写 event / 通知 listener |
| P2 | CT-F03-009 | F03-DRN-05、LC-CLOSE-REOPEN | L3 | temp-root | close 后再开必须 start；旧任务不得 running |
| P2 | CT-F03-010 | F03-DRN-01 | L3 | temp-root | close 等后台 child；返回前锁仍在；再开 start |
| P2 | CT-F03-011 | F03-DRN-02 | L3 | temp-root | runtime.cancel 排空 child；服务仍可 submit；再开 start |
| P2 | CT-F03-012 | F03-DRN-04、LC-SHUTDOWN-MODEL | L3 | temp-root | abort-deaf close 超时失败；锁仍在；第二实例不得 start |
| P2 | CT-F03-013 | F03-DRN-03 | L3 | temp-root | 父已 done 后 child 仍 live；close/drain 仍等 child |
| P2 | CT-F03-014 | F03-DRN-08 | L3 | temp-root | 父 done 期间 child 仍 live；不得按父 running 误封 |
| P2 | CT-F15-002 | F15-INT-01、DEL-FIRST-BOOT | L2 | temp-root | 无意图文件允许装；显式 false 拒绝；意图与 plist 分开 |
| P2 | CT-F15-003 | F15-INT-02 | L2 | temp-root | 真实 uninstall 后无 plist、意图关、不得自动再装 |
| P2 | CT-F15-004 | F15-INT-03 | L2 | temp-root | 真实 status 填 shouldRepair；未知活实例不修不杀 |
| P2 | CT-F16-014 | DEL-INTENT-UNKNOWN | L2 | temp-root | 意图 true/false × 未知活实例交叉；不得 installLaunchAgent |
| P2 | CT-F09-009 | F09-DUR-08 | L3 | temp-root | 收尾失败摘 live；waitFor 失败；可再 submit |
| P2 | CT-F04-006 | F04-IDM-01 | L3 | temp-root | 真实服务同轮二次 complete；提醒不双写 |
| P2 | CT-F04-007 | F04-IDM-02 | L3 | temp-root | 真实服务新轮 complete 是新事件；历史完成不改写 |
| P2 | CT-F04-008 | F04-IDM-03 | L3 | temp-root | 真实服务旧 generation 迟到 complete 不改当前轮 |
| P2 | CT-F04-009 | F04-IDM-04 | L3 | temp-root | 真实服务新轮另有完成与完成通知 |
| P2 | CT-F09-010 | F09-DUR-02 | L3 | temp-root | 收尾失败 waitFor reject；status 不得写成 done |
| P2 | CT-F09-011 | F09-DUR-01 | L3 | temp-root | 库级 status 失败回滚同事务 turn_end；status 不得写成 done |
| P2 | CT-F09-012 | F09-DUR-03 | L3 | temp-root | 真实 WS 收 durable runtime_failure；status 不得伪造 failed |
| P2 | CT-F09-013 | F09-DUR-04 | L3 | temp-root | 真实 WS 库级 context_usage 失败；phase===context_usage；终态仍 done |
| P2 | CT-F09-014 | F09-DUR-05 | L3 | temp-root | EventHub 同步抛与 Promise.reject 不挡后续；终态不改 |
| P2 | CT-F09-015 | F09-DUR-06、PER-JSONL | L3 | temp-root | 文件级 JSONL 失败不改终态；live 仍见 model_step |
| P2 | CT-F08-006 | F08-TXN-01 | L3 | temp-root | 父任务 queued→running 库级失败回滚；解除后可重试 |
| P2 | CT-F08-009 | F08-TXN-04 | L3 | temp-root | 库级 turn_start 插入失败回滚 active_turn；status 仍 queued |
| P2 | CT-F08-010 | F08-TXN-05 | L3 | temp-root | 库级 status_change 失败回滚主表；解除后同一次 update 一致 |
| P2 | CT-F06-007 | F06-SEC-01、SEC-DEFAULT-CUSTOM | L2 | temp-root | 两根进策略 + Darwin 读拒 |
| P2 | CT-F06-008 | F06-SEC-02、SEC-DEFAULT-CUSTOM | L2 | temp-root | 两根 .env Darwin 读拒 |
| P2 | CT-F06-009 | F06-SEC-03 | L2 | temp-root | 自定义 lumenHome 的 agent-service.json Darwin 读拒 |
| P2 | CT-F06-010 | F06-SEC-04 | L2 | temp-root | 工作区写成功 + skills 可读 + 凭证仍拒 |
| P2 | CT-F16-008 | F16-HAN-01 | L1 | temp-root | 三种 print + 端口可连 ≠ 托管 |
| P2 | CT-F16-009 | F16-HAN-02 | L1 | temp-root | 活 PID+可连端口且 job 缺失/PID 不对 → conflict |
| P2 | CT-F20-009 | F20-STO-05 | L2 | temp-root | evidence realpath + write deny + Darwin 写拒 |
| P2 | CT-F01-009 | F01-SIDE-01 全 type | L3 | temp-root | 请求级副作用矩阵 |
| P2 | CT-F01-010 | F01-SIDE-01 HTTP 写入口 | L3 | temp-root | 穷尽现 HTTP 写入口(仅 POST /upload) |
| P1 | CT-F17-009 | F17-REQ-04、PER-ATTEMPT | L3 | temp-root | 503 后流式中断分 attempt |
| P2 | RP-F24-009 | F24-RPL-10 | L5 | temp-root | 显式质量评估与回放分家 |
| P2 | AT-F16-004 | DEL-BUILD-HASH | L4 | installed-app | 同候选构建/安装 hash |
| P2 | CT-F03-006 | F03-DRN-06、LC-REPEAT-CLOSE | L3 | temp-root | close/监听失败/组装失败放锁 |
| P2 | CT-F04-005 | F04-IDM-05 | L3 | temp-root | 两轮 turn/generation；同轮不双写 |
| P2 | CT-F06-005 | F06-SEC-05、SEC-SYMLINK-WRITE | L3 | temp-root | write_file+sandbox-exec 软链写拒 |
| P2 | UT-F06-006 | F06-SEC-06 | L0 | temp-root | Seatbelt 架构门禁 |
| P2 | CT-F09-007 | F09-DUR-07 | L3 | temp-root | appendEvent 失败不虚构已持久故障 |
| P2 | CT-F11-006 | F11-BOT-06、LC-REPEAT-CLOSE | L2 | temp-root | 坏 DB/组装失败及时拒绝 |
| P2 | CT-F14-005 | F14-ORI-05 | L3 | temp-root | 外站 upload/submit 无副作用 |
| P2 | CT-F19-006 | F19-TOL-06 | L3 | temp-root | 覆盖后旧正文;未跟踪网络/任意文件边界 |
| P2 | CT-F19-007 | F19-TOL-01 | L3 | temp-root | 生产 createService 写前/写后/覆盖旧正文;shared 写拒 after=missing；不升 TOL-03 |
| P2 | CT-F19-008 | F19-TOL-02 | L3 | temp-root | 生产 createService 写/读超长；persist 预览不得冒充原文 complete |
| P2 | CT-F19-009 | F19-TOL-03 | L3 | temp-root | 生产 createService edit_file 改不存在文件 after=missing；不是 007 shared 写拒 |
| P2 | CT-F20-010 | F20-STO-01 | L3 | temp-root | 生产 createService 写出 sha 后改 blob；list/read/export 不得 complete/present |
| P2 | CT-F20-011 | F20-STO-03 | L3 | temp-root | 生产 createService 主循环采集失败仍落正文+hash；不得 complete |
| P2 | CT-F20-012 | F20-STO-04 | L3 | temp-root | 生产 createService start 后内容目录不可写；新 record 不得 complete；任务终态不改写 |
| P2 | CT-F20-008 | F20-STO-02、SEC-DIAG-REDACT | L3 | temp-root | 结构化凭证脱敏;导出不宣称原文完整 |
| P2 | CT-F21-005 | F21-QRY-05 | L3 | temp-root | read_exec_record 完整/缺失/失败 |
| P2 | RP-F24-010 | F24-RPL-09 | L5 | temp-root | get_bad_case 消费 lastVerification |
| P2 | CT-F07-008 | F07-RES-02 | L3 | temp-root | 真实 spawn_subagent 后重建主线程无 worker 内部步骤 |
| P2 | CT-F07-009 | F07-RES-03 | L3 | temp-root | 生产 sweep 同 provider id 只封未配对 operation |
| P2 | CT-F07-010 | F07-RES-01 | L3 | temp-root | 生产 sweep 封口 child 悬空工具保留原角色 |
| P2 | CT-F07-011 | F07-RES-04 | L3 | temp-root | 同一 createService 上 tool_result 写失败后续跑配对完整 |
| P2 | CT-F07-012 | F07-RES-07 | L3 | temp-root | 真实 spawn 后 child operationId 不得被改写成 main |
| P2 | CT-F10-013 | F10-ID-06、ID-MAIN-CHILD-OP | L3 | temp-root | 真实 spawn 后子循环 exec_records 挂父 task 且 parentOperationId 保留 |
| P2 | CT-F10-014 | F10-ID-01、ID-PROVIDER-VS-HOST | L3 | temp-root | 真实 createService 未知工具宿主 operation ≠ providerCallId |
| P2 | CT-F10-015 | F10-ID-07、ID-PROVIDER-VS-HOST | L3 | temp-root | 真实 createService 生产工具已知失败含 run_code 非零不得 ok |
| P2 | CT-F10-016 | F10-ID-02 | L3 | temp-root | 真实 createService 生产 cancel 后仍有宿主 operationId 且结果 cancelled/unknown |
| P2 | CT-F10-017 | F10-ID-08 | L3 | temp-root | 真实 createService 生产 spawn 未知类型 failed、中止 cancelled |
| P2 | CT-F10-018 | F10-ID-09、LC-PARENT-LIVE-CHILD | L3 | temp-root | 真实 createService 末子 complete 同进程封 unknown；live 兄弟不误封 |
| P2 | CT-F10-019 | F10-ID-10 | L3 | temp-root | 真实 createService 归档父任务生产 sweep 一条 unknown，再 sweep 不重复 |
| P2 | CT-F10-020 | F10-ID-03 | L3 | temp-root | 真实 createService 标题回填 chat 前已有 operationId；失败可定位；晚到不覆盖 |
| P2 | CT-F10-021 | F10-ID-04 | L3 | temp-root | 真实 createService 修图成功/失败身份与主循环分开 |
| P2 | CT-F10-022 | F10-ID-05 | L3 | temp-root | 真实 createService 生产 look_at_image 写 vision record；成功/失败可定位且与主循环分开 |
| P2 | CT-F10-023 | F10-ID-11 | L3 | temp-root | 真实 createService 写工具中断恢复只补 unknown，不重跑写入 |
| P2 | CT-F10-024 | F10-ID-04、ID-AUX-CALL | L3 | temp-root | 真实 createService 修图生产 cancel 仍属原 operation 且 resultStatus=cancelled |
| P2 | CT-F10-025 | F10-ID-12 | L3 | temp-root | 真实 createService 生产重试两次 attempt 同 operationId；流式中断留原文 |
| P2 | CT-F17-010 | F17-REQ-01 | L3 | temp-root | 真实 createService 生产主循环 request JSON 含 tools 且无密钥；解析失败留原文 |
| P2 | CT-F17-011 | F17-REQ-05 | L3 | temp-root | 同一 createService 上标题/修图/识图/子循环都落 exec_records；失败可定位 |
| P2 | CT-F17-012 | F17-REQ-02 | L3 | temp-root | 真实 createService 改 settings 后历史 request/response 正文逐字节不变 |
| P2 | CT-F17-013 | F17-REQ-03 | L3 | temp-root | 真实 createService 关采集再开；历史标 not_collected 且不补造正文 |
| P2 | CT-F02-015 | F02-OWN-01 | L3 | temp-root | 两份真实 createService+start 不得双写；close 后再开 |
| P2 | CT-F02-016 | F02-OWN-02 | L3 | temp-root | 死 pid 可回收；活持有者不得被抢；不升 OWN-03 |
| P2 | CT-F02-017 | F02-OWN-03 | L3 | temp-root | 三进程过期观察不得删 B 新锁；publish/reclaim 交错；不升 CON-TRIPLE-RECLAIM |
| P2 | CT-F02-018 | F02-OWN-04 | L3 | temp-root | 写入后过期观察抢不走；SIGKILL 后才能被新实例取得 |
| P2 | CT-F02-019 | F02-OWN-05 | L3 | temp-root | createService 完成路径换 inode 失败且不接管；不升 CON-LOCK-SAME-INODE |
| P2 | CT-F02-020 | F02-OWN-06 | L3 | temp-root | createService close/放弃换 inode 须留第三者；不复述 019 finish |
| P2 | CT-F02-021 | F02-OWN-07 | L3 | temp-root | createService 预置软链与发布后换成软链失败且不写外文件 |
| P2 | CT-F02-022 | F02-OWN-08 | L3 | temp-root | createService 硬链出根失败且不改外文件；不是复述 021 |
| P2 | CT-F02-023 | F02-OWN-09、F11-BOT-05 | L3 | temp-root | 失败者 createService 仍活；第二份 createService.start 取得根并写出；不升 CON-LOCK-SWAP |
| P2 | CT-F02-024 | F02-OWN-12 | L3 | temp-root | 同进程打不开刚发布锁不留 PID；不是 023 跨进程第二人 |
| P2 | CT-F11-007 | F11-BOT-01、F11-BOT-02 | L3 | temp-root | 端口占用时 createService.start 有限时间拒绝并放根；第二人写出；随 007 诚实升 BOT-02 |
| P2 | CT-F11-008 | F11-BOT-03 | L3 | temp-root | portfile rename 失败关监听放锁；第二人 createService.start 写出；不复述 007 |
| P2 | CT-F01-019 | F01-AUTH-02 | L3 | temp-root | 显式空 token 不得关鉴权；写入口 401；对照生成 token 不得 401 |
| P2 | CT-F01-020 | F01-CONN-01 | L3 | temp-root | 非法帧+handler 失败后同连接与第二连接 list；不升 DEC-02 |
| P2 | CT-F01-021 | F01-HTTP-01 | L3 | temp-root | 错 token GET /pdf 不泄漏；错 token POST /upload 无新文件；对照正确 token 200 |
| P2 | CT-F01-022 | F01-DEC-02 | L3 | temp-root | 非法 UTF-8 后该连接失败；第二连接 hello+list；不升 DEC-01 |
| P2 | CT-F22-007 | F22-BAD-02 | L1 | temp-root | jsdom+createRoot 真实渲染 mark/list/update/export/replay；不是源码扫描 |
| P2 | CT-F22-008 | F22-BAD-03 | L1 | temp-root | 真实 reducer + Dialog 超长正文不进 transcript；不是只改 CT-F22-003 binding |

补测完成后只更新本矩阵状态，不得改合同去适配实现。新测试名称必须包含上表 ID。

---

## 8. 基线计数（进度只比这三项）

| 集合 | covered | partial | uncovered | accepted |
|---|---|---|---|---|
| behavior_id（183） | 168 | 7 | 8 | 0 |
| combo_id（37） | 18 | 17 | 2 | 0 |
| V2R defect（17） | — | 13 partial-fix | 4 open | 0 closed |

后续每轮只比较：新增 `behavior_id`/`combo_id`、重开缺陷、`uncovered` 减少数。禁止用 Round 数或测试总数表示进度。
