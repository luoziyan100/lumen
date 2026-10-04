# 总Spec v2.2 remain54 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain54-2026-09-09`。测试体系候选 `test-system-v1-gov-remain54-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain53-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain54-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain54-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain53-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F24-RPL-03 | covered | CT-F24-013：生产 `createService` + 真实 WS。纯 reply → `mark_bad_case` → 同 home SQLite 删该 task 的 `model_response` 行 → `replay_recorded` 独立 dataRoot。error 或 `result.status=failed`。不得 `done` / `live_eval`。ScriptedModel 剩余 chat 次数不被吃。不是复述 CT-F24-012。不升 RPL-04。`process.pid !== 71847` |
| F24-RPL-04 | covered | CT-F24-014：生产 `createService` + 真实 WS。write_file 落任务 → `mark_bad_case` → unlink 对应 tool blob → `replay_recorded`。必须失败，不得 `done`/`ok`。`get_bad_case` lastVerification 不得把这次记成成功。ScriptedModel 剩余次数不被吃。不是复述 CT-F21-008 / CT-F20-010。不升 RPL-05。`process.pid !== 71847` |

## 实现要点

- 先写 CT-F24-013 / CT-F24-014。取得权走生产 `createService` + `start` + 真实 WS。改库/删 blob，不直调 `replayRecorded()`。
- 现有 replay 缺 response / 缺工具正文 fail-closed 已够；本批不改业务 src。
- 不升 F13-REQ-07、DEC-01、OWN-10、CON-*、F22-BAD-02/03/05/06、PER-BLOB-EXPORT、F24-RPL-05..11。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。未修 CT-F16-012 / AT-F16-001。

## 建议通过点

删掉 model_response 后 WS 回放失败且不打 ScriptedModel。unlink tool blob 后 WS 回放失败，lastVerification 不得记成功，剩余脚本次数不被吃。

## 建议打回点

- 只改 governance-v2r-replay / governance-f22-f24 / RP-F24-002 / RP-F24-003 binding。
- 复述 CT-F24-012 完整录制成功当 RPL-03。
- 复述 CT-F21-008 / CT-F20-010 当 RPL-04。
- 回放走 live_eval，或 status=done，或 ScriptedModel 被再吃。
- lastVerification 把缺工具正文这次记成成功。
- 默认升 DEC-01 / REQ-07 / OWN-10 / CON-* / BAD-02/03/05/06 / RPL-05..11。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain54-2026-09-09；已完成 F24-RPL-03 / F24-RPL-04；不升 F13-REQ-07 / F01-DEC-01 与 F20 整簇；CON-REQID / ID-STALE-CONN 不升；不升 F22-BAD-02/03/05/06 / PER-BLOB-EXPORT / F24-RPL-05..11；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：agent-service 全量 738 pass / 0 fail / 2 skip（AT-F16-001 / CT-F16-012 本轮整包绿；整包偶发闪红本批禁止修）；ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain54 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。不含本报告。算法段只写名为 报告自身哈希 的二级标题。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `e2cb07c58bb994e9b4de8c3d6c72001930ad462c42d218ade0c7e5fe1887b379` |
| `doc/testing-defects.md` | `558f93e9b767bc1341d782545b63deecb2ee41cca20716d62968bef970a296d4` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `ce94204eae0763f2c9f9071e3d28c3a25cf415ae8c166fea93ba19c04a7538ab` |
| `doc/testing-matrix.md` | `700666cbf2f5b8155a99809af285c6bcc5637be674889a6422ba2f19da2b6d92` |
| `doc/测试体系-总合同-2026-09-08.md` | `7c0b2bdcdfed91e6621fc2fe55203c518688eb6b00f16ee7dbfbbf3bf9877cd6` |
| `doc/诊断/CLAUDE.md` | `49884851f3a6cc88b184caee4591e1f38ae058b3054364c3332840b23f1c804d` |
| `packages/agent-service/tests/CLAUDE.md` | `2439757f1aa50c095ec7d00aa561556cdb2aeaecb9ef974ae23c3e4d390bb79a` |
| `packages/agent-service/tests/service/ct-f23-007.test.ts` | `7631342c5591e6f7151d58ec812bfcb6d02bc7e0aa36599697de115a729e88b5` |
| `packages/agent-service/tests/service/ct-f24-012.test.ts` | `20c804a83ce16af7f014a6415eaf049ae869e69cf2f0d7936a07fcc82049dfd8` |
| `packages/agent-service/tests/service/ct-f24-013.test.ts` | `33747c85fc527c95d3e86c1938c5710899b4e8fa73eba21601099dca587b091c` |
| `packages/agent-service/tests/service/ct-f24-014.test.ts` | `ab55d10990fea84ba38ad02c87fcce57798b0f165372955c194d410f0090ec52` |
aggregate = `0f043ea6e92ed13debcda4f0069f2218f37e19e7a3f5f39243b2c2e4f2eae947`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
不含本报告
自身 hash: `3c9b87438be4796c49baf63760dcaefa382a75e6b89c85a53cc64a25b641f3b0`
