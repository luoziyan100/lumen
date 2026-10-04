# 总Spec v2.2 remain55 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain55-2026-09-09`。测试体系候选 `test-system-v1-gov-remain55-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain54-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain55-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain55-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain54-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F24-RPL-05 | covered | CT-F24-015：生产 `createService` + 真实 WS。第一轮 submit 纯 reply 含 `TURN_ONE_…`；`continue` 第二轮纯 reply 含 `TURN_TWO_…`。`mark_bad_case` 绑第二轮真实 turnId + operationId。`replay_recorded` 独立 dataRoot：`done`；reply 含 TURN_TWO、不得含 TURN_ONE。`get_bad_case` lastVerification 落到该 badCaseId。不是复述 V2R-07 直插。不升 RPL-06。`process.pid !== 71847` |
| F24-RPL-06 | covered | CT-F24-016：生产 `createService` + 真实 WS 先落选定 reply `SELECTED_OP_…`，`mark_bad_case` 绑该 operation。同 turn 用 ExecStore 插兄弟 `model_response` `SIBLING_OP_…`。WS `replay_recorded`：reply 含 SELECTED、不得含 SIBLING。不是复述 V2R-17 全直插。不升 ID-TURN-MULTI-OP。`process.pid !== 71847` |

## 实现要点

- 先写 CT-F24-015 / CT-F24-016。取得权走生产 `createService` + `start` + 真实 WS。回放走 WS `replay_recorded`，不直调 `replayRecorded()`。
- 现有 `relatedRecords` 按 operation 闭包 + turn 过滤已够；本批不改业务 src。
- 不升 F13-REQ-07、DEC-01、OWN-10、CON-*、F22-BAD-02/03/05/06、PER-BLOB-EXPORT、F24-RPL-07..11、ID-TURN-MULTI-OP。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。未修 CT-F16-012 / AT-F16-001。

## 建议通过点

两轮生产任务后选定第二轮，回放 reply 只有 TURN_TWO。同轮插兄弟 op 后回放只有 SELECTED。lastVerification.problem.badCaseId 对上。

## 建议打回点

- 只改 governance-v2r-replay / RP-F24-004 / RP-F24-005 binding。
- 复述 V2R-07 直插两轮 exec 当 RPL-05。
- 复述 V2R-17 全直插当 RPL-06。
- `mark_bad_case` 仍绑 `unknown` 且能拿到真实 turn。
- 回放含 TURN_ONE 或 SIBLING。
- 默认升 DEC-01 / REQ-07 / OWN-10 / CON-* / ID-TURN-MULTI-OP / RPL-07..11。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain55-2026-09-09；已完成 F24-RPL-05 / F24-RPL-06；不升 F13-REQ-07 / F01-DEC-01 与 F20 整簇；CON-REQID / ID-STALE-CONN 不升；不升 F22-BAD-02/03/05/06 / PER-BLOB-EXPORT / F24-RPL-07..11 / ID-TURN-MULTI-OP；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：agent-service 全量 740 pass / 0 fail / 2 skip（AT-F16-001 / CT-F16-012 本轮整包绿；整包偶发闪红本批禁止修）；ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain55 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。不含本报告。算法段只写名为 报告自身哈希 的二级标题。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `37e093884bd851decaccac10dfaa0bbd2640ae422c9e06c87ab74b90c4406084` |
| `doc/testing-defects.md` | `21a4008d54099cd927278a8d38b929c32d41b115b96ad0968d936eb5ef3683bd` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `c058b55b4764c861d84dfb3daf5539b839dc22f224bfef860240fcfdb469bdbd` |
| `doc/testing-matrix.md` | `0c1bbd4b208192673be74e58ef2560ee396131fcf528b038581129f5766ec5c9` |
| `doc/测试体系-总合同-2026-09-08.md` | `111688b8d337c8433f726dddd3171522937429289ca3ad431a6685f1c6b549ac` |
| `doc/诊断/CLAUDE.md` | `58406fd2292bee36cde71ad81b6f0e33fd83c3d5165a1316a6a880bda34670c5` |
| `packages/agent-service/tests/CLAUDE.md` | `9011dea9e65c44efa12666f9609658bddfcb5e6d5324c8716da5fb85a6a67b5a` |
| `packages/agent-service/tests/service/ct-f24-013.test.ts` | `33747c85fc527c95d3e86c1938c5710899b4e8fa73eba21601099dca587b091c` |
| `packages/agent-service/tests/service/ct-f24-014.test.ts` | `ab55d10990fea84ba38ad02c87fcce57798b0f165372955c194d410f0090ec52` |
| `packages/agent-service/tests/service/ct-f24-015.test.ts` | `9b1eca1b77c50b0fd171469eb3a48e0a64b65722e4fcbcbaac99ab61baecad67` |
| `packages/agent-service/tests/service/ct-f24-016.test.ts` | `5f2ebed14eadb465f7af2634bcff126e23e1ab96343083751433574223f013a8` |
aggregate = `6fe45453590ebbb0b085ab73f3acb0877cffcd0b6a6a11104804f7146d83a732`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
不含本报告
自身 hash: `7b6829cc24a7680a4efd9e80b4dab60fce2e4e3ca5aa0daccd75b0fe2df890d3`
