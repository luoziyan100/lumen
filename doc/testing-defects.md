# Lumen 测试缺陷登记

状态: 2026-09-09-remain65。测试体系候选 `test-system-v1-gov-remain65-2026-09-09`。实现候选 `governance-impl-remain65-2026-09-09`。V2R-01 至 V2R-17 的完整 brief §8 字段仍在；不关闭业务缺陷，不宣称合同通过。BATCH-GAP-01 仍 open（F13 已钉 list / get_settings / list_projects / submit / continue / create_project / list_skills）。BATCH-GAP-02 仍为 partial-fix。本批 F22-BAD-02 / F22-BAD-03 升 covered。剩余 7 partial（DEC-01、REQ-07、OWN-10、HAN-05/06/09/12）与 8 uncovered 全是停放/禁止 covered。F12-VW-01..05 保持 covered，不重磨。不升 F13-REQ-07、F01-DEC-01、F20 整簇。F15-INT-04/05、LC-INTENT-PERSIST、F01-DEC-01 与 F13-REQ-07 保持原状，不关闭 V2R。V2R-13 保持 partial-fix，不 closed。不升 CON-REQID、ID-STALE-CONN、CON-TRIPLE-RECLAIM、CON-LOCK-SAME-INODE、CON-LOCK-SWAP、SEC-ORIGIN-TOKEN、SEC-SYMLINK-WRITE，不升 F02-OWN-10，不升 F22-BAD-05 / PER-BLOB-EXPORT / F24-RPL-09..11 / ID-TURN-MULTI-OP / SEC-REPLAY-ROOT。不升 CON-DUAL-SUBMIT、ID-SWITCH-UPLOAD、CON-TWO-CREATE、F05-DST-11、ID-DRAFT-GEN、F12-VW-06。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

索引与组合见 [`testing-matrix.md`](testing-matrix.md)。字段定义与门禁见 [`测试体系-总合同-2026-09-08.md`](测试体系-总合同-2026-09-08.md)。披露原文见 [`诊断/总Spec-v2-独立复核-2026-09-08.md`](诊断/总Spec-v2-独立复核-2026-09-08.md)。

每条记录自含全部 §8 字段。当前 17 条的 `first_fix_candidate` 均为 `unbound`，`reopen_count` 均为 `0`。`open` = 原生或组合仍缺。`partial-fix` = 有公开回归但候选未冻、环境不足，不得关闭。

---

## V2R-01

```text
defect_id: V2R-01
contracts: F16
risk_class: delivery
symptom: 开启常驻时壳直接强杀自有 sidecar，任务与证据写入可能被打断。
minimal_repro: 壳持有仍在跑的临时 sidecar，从设置开启常驻；观察安装路径对 Child 的信号与等待。
actual: kill_owned_sidecar 先 take() 清空槽再 child.kill()（SIGKILL 语义）；wait 看见空槽即返回；服务入口未走可核对的排空。
expected: 先 SIGTERM / handle.close，排空、关库、放锁后再交接；超时如实失败，不按未确认 PID 强杀，期间防自愈抢占。
mechanism: ui-client/src-tauri/src/main.rs 安装路径调用 kill_owned_sidecar；清空 Child 后 wait_owned_sidecar_gone 不再等原进程。agent-service/src/service.ts 入口原先未接优雅停机。
structural_root_cause: 把“槽内 Child 消失”当成“执行已排空”。所有权与退出结果没有独立事实，生命周期被杀进程捷径代替。
fix_layer: 壳与服务既有生命周期（shutdown / drain / 关库 / 放锁），不是再包一层安装重试。
regression_test_ids: CT-F16-005, CT-F16-007, CT-F16-012
first_fix_candidate: unbound
reopen_count: 0
status: open
verification_evidence: 安装与 Cmd+Q 均走 drain(SIGTERM→wait,超时 SIGKILL)；原生仍跑任务的 sidecar 排空 AT 未做。禁止用 PID 71847 当故障样本。
```

## V2R-02

```text
defect_id: V2R-02
contracts: F20
risk_class: security
symptom: 真实沙箱能读写证据；篡改 blob 后查询/导出仍显示完整。
minimal_repro: 自定义数据根经软链指向可写临时目录，在 sandbox-exec 内读/改 evidence sentinel；或直接改 ExecStore blob 后再 read/export。
actual: 沙箱读到 EVIDENCE_SENTINEL 并可写成 MODIFIED_BY_SANDBOX；改字节后状态仍 complete/present，导出 hash 与清单不符。
expected: evidence 路径 realpath 后拒绝读写；损坏内容不得沿用 complete/present；导出须核字节。
mechanism: run-code/sandbox.ts 的 evidence deny 不做 realpath，且只有读限制。exec-content 读不核 hash；exec-store 导出只看路径存在。
structural_root_cause: “放在工作区外”被当成访问控制。保护按字面路径，完整性按“文件还在”，都不核实际 inode 与字节。
fix_layer: 执行器资源边界 + 内容/导出层的引用一致性，而不是换目录位置。
regression_test_ids: CT-F20-001, CT-F20-005
first_fix_candidate: unbound
reopen_count: 0
status: open
verification_evidence: CT-F20-010 经生产 createService.start+submit 写出 sha 后改 blob，list/read/export 不得 complete/present。AT-F20-001 已在 Darwin sandbox-exec 跑通。业务合同仍未独立验收，本条不关闭。
```

## V2R-03

```text
defect_id: V2R-03
contracts: F20, F23
risk_class: security
symptom: 诊断包带出反馈/事件中的凭证模式；正文脱敏不完整。
minimal_repro: 把假 apiKey / Bearer / query token 写入 bad case 反馈与事件，再 export_diagnostic。
actual: manifest.json 与 events.json 保留原值；Authorization 只剥 Bearer，TOKEN 留下；query token 未处理。
expected: 包内反馈、事件、配置、文本与内容文件统一脱敏，删减位置可辨认；脱敏包不得宣称保留原文。
mechanism: agent-runtime 导出把 badCase 与事件原样写入；exec-content 正则未覆盖完整凭证值。blob 脱敏管不到包内其他来源。
structural_root_cause: 脱敏是局部字符串替换，不是导出图上的统一策略。检查“settings 无 apiKey 字段”不能代表包安全。
fix_layer: 记录与整包导出的凭证处理，保留删减标记。
regression_test_ids: CT-F20-002, CT-F20-008
first_fix_candidate: unbound
reopen_count: 0
status: partial-fix
verification_evidence: CT-F20-008 对象字段 Authorization/apiKey/token/query 整值 redact；导出 originalComplete=false。根清单/events/exec 仍走 redactSecrets。不关闭。
```

## V2R-04

```text
defect_id: V2R-04
contracts: F17
risk_class: persistence
symptom: 只保存一次逻辑请求，重试与中断的实际 attempt 正文丢失。
minimal_repro: 假 transport 先 503 再 SSE 成功；或 SSE 收到部分文本后断流。
actual: 两次真实请求只采 attempt=1；wire 有 stream:true 而证据没有；503 与部分 SSE 正文不可读；失败只有 failed 状态。
expected: 每次 transport 尝试一条 attempt；保留已收原文、解析结果与错误；失败仍可落盘正文。
mechanism: openai/claude adapter 在整个 transport 结束后采集，stream 在发送时另加。exec-store 对 contentStatus=failed 跳过内容。
structural_root_cause: 采集边界等于“逻辑 operation 结束”，不等于“每一次实际发出”。失败被当成“没有可存正文”。
fix_layer: 提供商发送与逐次 attempt 边界；失败不等于禁止存证。
regression_test_ids: CT-F17-004, CT-F20-003
first_fix_candidate: unbound
reopen_count: 0
status: partial-fix
verification_evidence: 503 后两次 attempt 与 stream:true 有公开测试。CT-F20-011 经生产 createService.start+submit，OpenAI stream 503 无正文时 model_response 仍 failed 落盘正文+hash。本条不关闭。
```

## V2R-05

```text
defect_id: V2R-05
contracts: F17, F18, F10
risk_class: persistence
symptom: 正常主循环没有 context/transform；识图等生产调用缺采集身份。
minimal_repro: 真实 runAgent + adapter + ExecStore 跑一轮；另调 look_at_image。
actual: 库中只有 model_request/model_response。recordContext 在 runWith 外调用被跳过。look_at_image 直打 transport。
expected: 与宿主操作同一 ALS 身份写入来源、变换、版本/权限/预算；标题/修图/识图/子循环均可定位。
mechanism: loop.ts 在 evidence.runWith 前 recordContext；无 ALS 则跳过。vision-tools 不挂采集端口。
structural_root_cause: 采集身份是调用栈可选上下文，不是“进入循环即存在”的操作事实。辅助调用另开旁路。
fix_layer: 上下文组装与 EvidencePort 共用宿主 identity；补齐已有生产路径，不另起 trace 状态机。
regression_test_ids: CT-F18-001, CT-F17-005, CT-F10-003, CT-F10-004, CT-F10-005, CT-F10-006
first_fix_candidate: unbound
reopen_count: 0
status: partial-fix
verification_evidence: ALS context 与四条生产路径有写入测试；来源 vs 注入、变换记录仍 uncovered。
```

## V2R-06

```text
defect_id: V2R-06
contracts: F19
risk_class: persistence
symptom: 长工具结果只存模型预览，却标 complete。
minimal_repro: 真实 read_file 读约 2 万字，走生产 withResultPersist，再读 exec 正文。
actual: 证据约 2,190 字，原文尾消失，contentStatus=complete，structured 只有 totalChars；原文留在可变 cache。
expected: 调查用原文与给模型的摘要分开；达上限须标截断，不得用长度数字冒充正文。
mechanism: agent-runtime 先 withResultPersist 裁剪；loop 采集拿到裁后结果。
structural_root_cause: 采集点挂在“已适合喂模型”的值上，而不是工具返回的实际结果。
fix_layer: 工具完成与摘要变换的边界；原文、摘要、变换分存。
regression_test_ids: CT-F19-002, CT-F19-008
first_fix_candidate: unbound
reopen_count: 0
status: partial-fix
verification_evidence: CT-F19-008 生产 createService 主循环写/读超长文件；模型看见 persist 预览，证据仍有原文尾巴。不关闭。
```

## V2R-07

```text
defect_id: V2R-07
contracts: F24
risk_class: identity
symptom: 选定第二轮问题，回放却跑第一轮，并把 done 写回该问题。
minimal_repro: 同任务两轮，bad case 绑第二轮 operation；执行 replay_recorded。
actual: 输出第一轮 OLD UNRELATED ANSWER，选定 bad case 的 lastVerification.status=done。
expected: 回放范围由已保存的 task/turn/operation 与调用配对决定；无法关联则失败，不得记 done。
mechanism: replay-recorded 拉整个 task 的多轮记录，用反馈 actual 重建用户输入，工具按名字排队，结果回写选定问题。
structural_root_cause: 回放脚本用时间相邻和工具同名代替因果身份。
fix_layer: 从已保存操作身份生成回放计划，拒绝无法关联的脚本。
regression_test_ids: RP-F24-004, CT-F24-015
first_fix_candidate: unbound
reopen_count: 0
status: partial-fix
verification_evidence: CT-F24-015 生产 createService + 真实 WS 两轮纯 reply，选定第二轮回放不得含第一轮。不关闭。
```

## V2R-08

```text
defect_id: V2R-08
contracts: F24
risk_class: persistence
symptom: 缺失或失败的工具证据被回放成成功。
minimal_repro: 工具正文标 missing 或原结果 failed，再 replay。
actual: 回放返回 done / I CLAIM SUCCESS / gaps=[]；failed 被桩转成 ok。
expected: 证据缺失或不兼容必须失败并记录；原工具失败应重放失败事实，不得改 ok。
mechanism: replay-recorded 对无正文/坏正文构造空字符串 ok，固定成功状态；缺队列异常被内核当普通失败继续；gaps 恒空。
structural_root_cause: 回放把“模型最后仍给出答案”当成“证据可用”。证据校验与执行结果未分开。
fix_layer: 回放入口的证据校验，先于脚本执行。
regression_test_ids: RP-F24-003
first_fix_candidate: unbound
reopen_count: 0
status: partial-fix
verification_evidence: 缺工具正文必须失败的公开测试已有；未绑候选。
```

## V2R-09

```text
defect_id: V2R-09
contracts: F23
risk_class: persistence
symptom: 不完整诊断包宣称 completeAudit，并用导出时配置冒充历史配置。
minimal_repro: 只写一条 model_response，无 request/context/版本，再 export_diagnostic。
actual: completeAudit=true；diagnosticConfig 来自当前 publicSettings。
expected: 按目标执行检查应有证据，缺项显式登记；历史配置来自执行证据；允许不完整包。
mechanism: agent-runtime 只遍历已有记录，未见 gaps 即完整；配置读导出时刻 settings。
structural_root_cause: “没有记到缺口”被当成“没有缺口”。完整性和历史配置都是负向证明。
fix_layer: 目标执行的应有证据清单 + 执行期配置快照，不是导出环境。
regression_test_ids: RP-F23-001
first_fix_candidate: unbound
reopen_count: 0
status: partial-fix
verification_evidence: 仅 response 不得 completeAudit 有公开测试；独立无根复验仍 partial。
```

## V2R-10

```text
defect_id: V2R-10
contracts: F15, F16
risk_class: delivery
symptom: 运行判定、安装失败恢复与设置显示不一致：恢复中的 job 被当不健康；失败 KeepAlive 无收束；用户看不见具体原因。
minimal_repro: 1) running+pid+lastExit=1 喂 jobLooksHealthy；2) 安装等待超时看 bootout/bootstrap 序列；3) SettingsModal 收字符串 rejection。
actual: lastExit 非零否决当前 running；超时抛 job_failed 不 bootout 失败 job；字符串 rejection 变成“操作失败”，UI 按 plist 拼开启态。
expected: 只认当前 running+pid；失败必须 bootout 且冲突不 kickstart；意图/配置/托管分开展示；失败不把开启偏好改成关。
mechanism: launchd-job 用 lastExit 否决 running。launchd.ts 等待失败不收束。SettingsModal 只认 Error，plist 当托管。
structural_root_cause: 把历史退出码、plist 存在、KeepAlive 意图混成“当前是否托管”。状态、动作和用户可见报告不是同一组事实。
fix_layer: 当前所有权与安装结果语义；设置页消费同一组字段。幂等 already 不能代替新候选已重装。
regression_test_ids: CT-F16-002, CT-F16-003, CT-F16-004, CT-F16-006, UT-F16-001, CT-F15-001
first_fix_candidate: unbound
reopen_count: 0
status: open
verification_evidence: 纯函数与设置态解析有公开测试；原生设置页关闭→退出→重开未做。
```

## V2R-11

```text
defect_id: V2R-11
contracts: F20
risk_class: persistence
symptom: 内容落盘失败被吞掉，没有采集失败记录。
minimal_repro: 已有 model_request 后让内容目录不可写，再跑采集端口并回读。
actual: 只有原 request，无 response，也无 failed marker。
expected: 可选正文失败不改任务结果，但须留下可查询的采集缺口/failed；DB 全不可用时明确降级。
mechanism: exec-evidence.safeRecord 吞掉全部异常。
structural_root_cause: “正文故障不得改执行结果”被实现成“正文故障不得留下任何事实”。
fix_layer: 采集端口的失败标记，与任务状态机分离。
regression_test_ids: CT-F20-004
first_fix_candidate: unbound
reopen_count: 0
status: partial-fix
verification_evidence: CT-F20-012 经生产 createService.start 后再让 exec-evidence 不可写；主循环新 record 不得 complete，须 failed/writeError；任务终态仍 done。本条不关闭。
```

## V2R-12

```text
defect_id: V2R-12
contracts: F19
risk_class: persistence
symptom: 进程被信号终止或文件不存在时，证据仍像正常完成。
minimal_repro: Seatbelt 内 process.kill(pid, SIGTERM)；或 edit_file 操作不存在的文件后读 after 版本。
actual: resultStatus=ok、exitCode=null；信号只在 llmContent。stdout 实际完整仍标 truncated。after 为 existed=false 的 complete 空文件 hash。
expected: 结构化保留 signal/退出/截断；文件不存在或读失败不得变成“已完整保存的空版本”。
mechanism: run-code 只认 SIGKILL 或非零数字；clipped 预览当成 stdoutTruncated。exec-evidence 只处理 before 缺失，after 默认空串 complete。
structural_root_cause: 工具“有返回值”与“结果语义”折叠。取消/信号/缺失都被压成可写入的成功形状。
fix_layer: 工具结果契约与内容可用性，分别表达已知失败、取消、未知与缺失。
regression_test_ids: CT-F19-003
first_fix_candidate: unbound
reopen_count: 0
status: partial-fix
verification_evidence: CT-F19-009 经生产 createService 主循环 edit_file 改不存在文件，after=missing、existed=false，不得 complete 空文件。V2R 不关闭。
```

## V2R-13

```text
defect_id: V2R-13
contracts: F22, F24
risk_class: identity
symptom: 标记历史回答或中间工具时，turn/operation 可能归到新轮或最后一步。
minimal_repro: 旧 operation 事件带旧 turn，新轮开始后再标该 operation；或过程块先失败 A 后成功 B，从块上标记。
actual: 无 exec_records.turnId 时回退到最后一条 turn_start，写成新 turn。UI 传 unknown。ProcessRow 固定选最后一个带 operationId 的工具。
expected: 归属来自原操作/事件；证据不足保留 unknown。工具问题能标到具体步骤。
mechanism: agent-runtime.resolveTurnId 猜最新 turn_start。ChatTranscript 传 unknown。ProcessRow 没有逐步标记入口。
structural_root_cause: 用“当前视图里最新的身份”填缺失字段，而不是承认 unknown。
fix_layer: F22 身份合同：事件/记录优先，禁止猜测。
regression_test_ids: RP-F22-001, CT-F22-006
first_fix_candidate: unbound
reopen_count: 0
status: partial-fix
verification_evidence: CT-F22-006 经生产 createService + 真实 WS：两轮纯 reply 后 mark_bad_case(turnId=unknown, 第一轮 operationId) 落到第一轮 turn，不得第二轮 / unknown / 最后一条 turn_start；对照第二轮 operationId+unknown 落到第二轮。不是复述 V2R-13 直调。UI 逐步标记与切会话持久查看仍缺。V2R 不关闭。
```

## V2R-14

```text
defect_id: V2R-14
contracts: F21, F22, F23, F24
risk_class: delivery
symptom: 查询/导出/回放 API 存在，但没有可走完的调查工作流。
minimal_repro: 在已安装 App 中从一条回答或工具行标记问题，定位证据、导出诊断包、回放或记录验证。
actual: WS API 与 typed client 可用；BadCaseDialog 能回填/更新。没有消费 list/read/export/replay 的完整操作路径；回放主要在测试里调用。
expected: 用户能完成调查：加载、失败、缺失、持久查看更新。不强制独立页面或一键按钮，但不能只用内部 API 代替交付。
mechanism: 协议与 runtime 方法已暴露；UI 未把它们串成从标记到验证的路径。
structural_root_cause: 把“有接口”当成“有工作流”。交付面停留在测试调用。
fix_layer: 最简可用入口（现有对话标记 + 诊断/回放消费），不是新状态机。
regression_test_ids: AT-F24-001, UT-F22-001
first_fix_candidate: unbound
reopen_count: 0
status: open
verification_evidence: 组件静态入口有；原生调查走查未做。
```

## V2R-15

```text
defect_id: V2R-15
contracts: F24
risk_class: security
symptom: 隔离回放入口接受用户数据根当工作目录。
minimal_repro: 把源证据的 lumenHome/dataRoot 传给 replay_recorded。
actual: 对任意 dataRoot mkdir 并成功；在该根下建 workspace。
expected: 回放必须使用宿主管理的隔离根；用户 lumenHome 及别名须拒绝；不得对用户根产生副作用。
mechanism: replay-recorded 对传入 dataRoot 直接 mkdir，无 canonical/别名边界。
structural_root_cause: 隔离被理解成“这次没跑真工具”，而不是“工作目录所有权”。
fix_layer: 回放入口的数据根边界，与 F02 独占同一套路径语义。
regression_test_ids: RP-F24-006
first_fix_candidate: unbound
reopen_count: 0
status: partial-fix
verification_evidence: 回放根不得落用户 lumenHome 有公开测试；未绑候选。
```

## V2R-16

```text
defect_id: V2R-16
contracts: F24
risk_class: identity
symptom: 录制脚本跑完就被记成坏例已验证。
minimal_repro: expected 与回放输出故意不一致，或只断言 runAgent done。
actual: replay 把 runAgent done 写成 verification done；不用 expected/断言/被评估版本。闭环测试从原库回放只断言 done。
expected: 机械故障用确定断言；质量评估用明确目标；对不上不得记 done。用例关联原问题与候选版本。
mechanism: replay-recorded 用执行完成当验证完成；dto 验证结构不足。
structural_root_cause: “脚本能跑通”与“问题已被判定”是同一状态。
fix_layer: 验证结果与回放执行分家；done 只在断言或评价目标通过后写入。
regression_test_ids: RP-F24-007, RP-F24-008
first_fix_candidate: unbound
reopen_count: 0
status: partial-fix
verification_evidence: expected 对不上不得记 done 有公开测试；RP-F24-009 已把 live_eval 与 recorded_replay 分家。业务闭环未 accepted。
```

## V2R-17

```text
defect_id: V2R-17
contracts: F24
risk_class: identity
symptom: 同一 turnId 下不同 operation 会串入选定回放。
minimal_repro: 同轮写入 op-other → OTHER SAME TURN 与 op-selected → SELECTED SAME TURN；bad case 绑 op-selected 后 replay。
actual: 回放先返回 OTHER SAME TURN（或因 expected 不匹配失败），说明兄弟 operation 进入了选定脚本。
expected: 从选定 operation 沿 parentOperationId 做父子闭包；兄弟 operation 排除；缺关联字段则失败，不用整轮兜底。
mechanism: relatedRecords 找到选定 operation 的 turn 后返回该 turn 全部 chat/subagent 记录。跨轮测试不能证明同轮隔离。
structural_root_cause: 回放范围用 turn 当操作身份。turn 是会话轮次，不是因果闭包。
fix_layer: 回放计划的 operation 闭包，禁止 turn 范围兜底。
regression_test_ids: RP-F24-005, CT-F24-016
first_fix_candidate: unbound
reopen_count: 0
status: partial-fix
verification_evidence: CT-F24-016 生产任务选定 reply 后同轮直插兄弟 op，WS 回放不得含 SIBLING。不关闭。不升 ID-TURN-MULTI-OP。
```

---

## BATCH-ENV-01

```text
defect_id: BATCH-ENV-01
contracts: F15, F16
risk_class: delivery
symptom: 原生 LaunchAgent / 关闭重开 / sidecar 排空无法在假 HOME 下执行。
minimal_repro: 不设 LUMEN_AT_LAUNCHD_ISOLATED / LUMEN_AT_ISOLATED_HOME，跑 AT-F16-001/003 与 AT-F15-001。
actual: AT-F16-001 已用 com.lumen.agent-service.test.* 真装；AT-F16-003 / AT-F15-001 仍 skip。Rust 仍写死生产 label。
expected: 隔离 label 或隔离 gui domain 后才能真装/排空/重开。
mechanism: Node launchd.ts 已允许 test.*；壳 main.rs 仍绑生产 label。
structural_root_cause: 安装身份与用户数据根未分开。
fix_layer: 测试环境隔离，不是改合同。
regression_test_ids: AT-F16-001, AT-F16-003, AT-F15-001
first_fix_candidate: test-system-v1-batch-2026-09-08
reopen_count: 0
status: open
verification_evidence: AT-F16-001 隔离真装已过；设置页重开与 sidecar 排空仍缺。禁止动 PID 71847。
```

## BATCH-ENV-02

```text
defect_id: BATCH-ENV-02
contracts: F05, F12, F22, F24
risk_class: delivery
symptom: WebKit 上传竞赛、Reader 世代、调查入口没有真实宿主路径。
minimal_repro: 不设 LUMEN_AT_WEBKIT=1，跑 AT-F05-001 / AT-F12-001 / AT-F24-001。
actual: skipped: environment；jsdom 绿不得外推。
expected: 已装 App / WebKit 用户路径走完标记→导出→回放。
mechanism: 本批只加环境门，未接 Computer Use。
structural_root_cause: 用户可见合同被 Node/jsdom 宿主代替。
fix_layer: 真实 WebKit 入口，不是再写 hook。
regression_test_ids: AT-F05-001, AT-F12-001, AT-F24-001
first_fix_candidate: test-system-v1-batch-2026-09-08
reopen_count: 0
status: open
verification_evidence: packages/ui-client/tests/at-webkit-env.test.ts
```

## BATCH-GAP-01

```text
defect_id: BATCH-GAP-01
contracts: F13
risk_class: identity
symptom: 全 type 超时未逐条挂起，只证明部分 type 超时与全 type 非法形状。
minimal_repro: 读 CT-F13-007 / CT-F13-008 / CT-F13-009 / CT-F13-010；除 list / get_settings / list_projects / submit / continue / create_project / list_skills 外无短超时挂起。
actual: 非法形状与 WS error 带回 requestId；超时已钉 list + get_settings + list_projects + submit + continue + create_project + list_skills。
expected: 每类异步请求都有 timeout/断线结算。
mechanism: 为保持 verify 可完成，按 type 分片短超时，未对全部 type 各挂。
structural_root_cause: 超时矩阵成本与覆盖完整冲突。
fix_layer: 后续继续按 type 分片超时，而不是一次套件打满。
regression_test_ids: CT-F13-007, CT-F13-008, CT-F13-009, CT-F13-010
first_fix_candidate: test-system-v1-batch-2026-09-08
reopen_count: 0
status: open
verification_evidence: ct-f13-007 形状+list 超时；ct-f13-008 钉 get_settings/list_projects；ct-f13-009 钉 submit/continue；ct-f13-010 钉 createProject/listSkills。其余异步 type 仍缺。
```

## BATCH-GAP-02

```text
defect_id: BATCH-GAP-02
contracts: F18, F20
risk_class: persistence
symptom: 变换种类与保留策略未穷尽。
minimal_repro: CT-F18-002 只有 fold/vision；CT-F20-006 无产品级保留天数。
actual: 摘要/过滤/遗漏无记录；F20-STO-09 仍 uncovered。
expected: 全部变换可查询；保留/清理规则已登记并验证。
mechanism: 实现只暴露 fold/vision 与孤立清理入口。
structural_root_cause: 合同枚举宽于当前采集面。
fix_layer: 采集面补齐后再补测，不改合同去适配。
regression_test_ids: CT-F18-002, CT-F18-003, CT-F20-006, CT-F20-007
first_fix_candidate: test-system-v1-batch-2026-09-08
reopen_count: 0
status: partial-fix
verification_evidence: CT-F18-002 真实组装记 summary/filter/omit/truncate；CT-F20-007 登记 EXEC_RETENTION 并验证过期孤儿清理。CT-F20-006 已钉流式/查询/导出/内存四条 EXEC_LIMITS 运行时强制；未跑多小时会话。不关闭。
```

## CONV-DEFER-01

```text
defect_id: CONV-DEFER-01
contracts: none — 测试体系范围外工程
risk_class: delivery
symptom: 全面 CI、正式分发、长会话性能不在测试体系 v1 收口范围。
minimal_repro: 读 briefs/active/test-system-v1-convergence.md §5/§9。
actual: 本批不建 CI、不打正式包、不采 WebKit 帧预算。
expected: 另开工作单；不回写 v1 结论。
mechanism: 收口 Spec 明确延期。
structural_root_cause: 宿主与发布管道不是当前测试台账对象。
fix_layer: 独立工作单，不是再加 checker。
regression_test_ids: —
first_fix_candidate: unbound
reopen_count: 0
status: open
verification_evidence: 收敛报告延期清单。
```

