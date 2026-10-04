# 总Spec v2.2 remain4 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain4-2026-09-09`。测试体系候选 `test-system-v1-gov-remain4-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain4-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain4-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain3-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F06-SEC-04 | covered | CT-F06-010：同一 Seatbelt profile 工作区写成功、合法 skills 可读；凭证读/写仍拒；不得整树 deny 数据根。Darwin sandbox-exec 真跑。非 Darwin skip 不得记 covered |
| F16-HAN-02 | covered | CT-F16-009：活 PID=`process.pid` + 本地 TCP 可连；print 缺失或 PID 不对时 classifyLiveOwner=unknown、decideInstallAction=conflict，不得 bootstrap/already。未碰生产 label / PID 71847 |
| F01-DEC-01 | partial | CT-F01-016：向真实 WS 发送非法 set_model / create_project / mark_bad_case（缺字段/坏形状），error 后 settings 不改、无新 task/项目/bad_case，随后合法 list 仍结算。仍缺 rename_project / archive_project / install_skill / update_bad_case 等其余写入口。禁止标 covered |

## 实现要点

- 三条回归先写后跑，现实现已满足，未改业务 src / UI / Rust。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未碰 F16-HAN-05/06/09。
- F06-SEC-04 必须有本行自己的 test_id，Darwin 真跑工作区写成功且凭证仍拒才 covered。
- F16-HAN-02 不是只扫旧 f16 字符串：活 PID + 真实 TCP + 判定函数。
- F01-DEC-01 / F13-REQ-07 禁止标 covered。

## 建议通过点

同一 profile 下工作区可写、合法 skills 可读，凭证仍拒读/写，且未整树 deny 数据根。活 PID 可连且 job 缺失或 PID 对不上时必须 conflict，不得 bootstrap。非法 set_model / create_project / mark_bad_case 不改盘、不建 task/项目/bad_case。

## 建议打回点

- F01-DEC-01 仍缺 rename_project / archive_project / install_skill / update_bad_case 等其余写入口全矩阵。
- F13-REQ-07 仍缺其余异步 type 的逐条超时。
- DEL-INTENT-UNKNOWN 仍缺 intent 落盘交叉；停放环境行仍 uncovered。
- 非 Darwin 宿主上 F06-SEC-04 的 sandbox-exec 会 skip，不得把 skip 记 covered。

人话状态：正在第 governance-impl-remain4-2026-09-09；已完成 F06-SEC-04 工作区/skills 可读写与 F16-HAN-02 未知活 PID 必须 conflict；F01-DEC-01 与 F13-REQ-07 仍 partial。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `d8e3745c91e02063beaad4b1f1c8ba408de0d124a615f9b681d44013490961fe` |
| `doc/诊断/CLAUDE.md` | `970f7bc459b7889a45ed2a22cd9b8bc88cc9a33ef586ab128f77c0275ac1e111` |
| `packages/agent-service/tests/CLAUDE.md` | `b88ee3237af3c6ceb26519b4c8ba53772a3d6f1b5c66e7760dbd9fc7b30732fe` |
| `packages/agent-service/tests/service/ct-f01-016.test.ts` | `afb8031fe24858787dab97bf398bafcf72fa97172e6face1b8b58f310eb8b134` |
| `packages/agent-service/tests/service/ct-f06-010.test.ts` | `c4f8cee22ea819aa7660e7672a209832d1fe506863de943f9970b62a6b06e9a3` |
| `packages/agent-service/tests/service/ct-f16-009.test.ts` | `68fb923a3b1a28bfec463b604465d983b354d120e3b62051e071edd296c39fda` |

aggregate = `c4cc8f297a49ebf951f5fbcb0a4b55221748146a2dd7370c1e1227bbd852d60b`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希

去掉「## 报告自身哈希」
自身 hash: `f95f73fb74a6cbbdfb67ca6cac92b6fa172925cae014790814c7d1b9bff1d28b`
