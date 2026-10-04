# 总Spec v2.2 remain53 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain53-2026-09-09`。测试体系候选 `test-system-v1-gov-remain53-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain52-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain53-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain53-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain52-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F23-PKG-02 | covered | CT-F23-007：生产 `createService` + 真实 WS。只跑纯 reply（不要 write_file）→ `mark_bad_case` → `export_diagnostic` 到独立 dest。dest 可开。`completeAudit === false`。gaps 非空（redacted/not_collected，absent/missing 一类）。不是复述 CT-F23-006。不升 PKG-03/04/05。`process.pid !== 71847` |
| F24-RPL-02 | covered | CT-F24-012：生产 `createService` + 真实 WS。write_file 落任务 → `mark_bad_case` → `replay_recorded` 独立 dataRoot（不得是 home）。`use=recorded_replay` 且 done。ScriptedModel 剩余 chat 次数不被吃。home 与 dataRoot 不得因回放新写 notes。不是复述 RP-F24-001 / f22-f24 直调。不升 RPL-03。`process.pid !== 71847` |

## 实现要点

- 先写 CT-F23-007 / CT-F24-012。取得权走生产 `createService` + `start` + 真实 WS。
- 现有 exportDiagnostic gaps + replay_recorded 已够；本批不改业务 src。
- 不升 F13-REQ-07、DEC-01、OWN-10、CON-*、F22-BAD-02/03/05/06、PER-BLOB-EXPORT、F24-RPL-03..11。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。未修 CT-F16-012 / AT-F16-001。

## 建议通过点

纯 reply 诊断包 dest 可开，completeAudit 为假，gaps 声明不完整。write_file 任务经 WS 回放 use=recorded_replay 且 done；脚本剩余次数不被吃；home/dataRoot 无回放新 notes。

## 建议打回点

- 只改 governance-v2r-replay / governance-f22-f24 / RP-F23-001 / RP-F24-001 binding。
- 复述 CT-F23-006 write_file 完整包当 PKG-02。
- dest 未生成，或 completeAudit 仍为 true，或 gaps 空。
- 回放走 live_eval，或 ScriptedModel 被再吃，或 home/dataRoot 因回放新写 notes。
- 默认升 DEC-01 / REQ-07 / OWN-10 / CON-* / BAD-02/03/05/06 / RPL-03..11。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain53-2026-09-09；已完成 F23-PKG-02 / F24-RPL-02；不升 F13-REQ-07 / F01-DEC-01 与 F20 整簇；CON-REQID / ID-STALE-CONN 不升；不升 F22-BAD-02/03/05/06 / PER-BLOB-EXPORT / F24-RPL-03..11；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：agent-service 全量 736 pass / 0 fail / 2 skip（AT-F16-001 / CT-F16-012 本轮整包绿；整包偶发闪红本批禁止修）；ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain53 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。不含本报告。算法段只写名为 报告自身哈希 的二级标题。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `740142d3b61c9acbd446ff32241a149812689f484c71763a42c06fdefd6248ba` |
| `doc/testing-defects.md` | `a9c28979b7107e9990774d6f36690a888eacbd787a1ad1da8506593c4fc6b403` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `925239f215f1afcdf86a63545c6850ddf62fc5452acd1e8c60c377e937ab8ed2` |
| `doc/testing-matrix.md` | `bb57d4df1626e12547ce9f5762cef9e95dc067e5e5efe72c4cbaf837e1701031` |
| `doc/测试体系-总合同-2026-09-08.md` | `031088098833a62996bb74837832ac80bce22d13cebfb8113c64d9e54f9828d0` |
| `doc/诊断/CLAUDE.md` | `807f9589d6a908a8af9cba02d4122953e35ee26ec3cfe951b9824a925a8c5af6` |
| `packages/agent-service/tests/CLAUDE.md` | `89a3b3cb0e1f6b946fd545418a12a4f891f7c29f50741f5265b0b8a992a6d8f9` |
| `packages/agent-service/tests/service/ct-f23-007.test.ts` | `7631342c5591e6f7151d58ec812bfcb6d02bc7e0aa36599697de115a729e88b5` |
| `packages/agent-service/tests/service/ct-f24-012.test.ts` | `20c804a83ce16af7f014a6415eaf049ae869e69cf2f0d7936a07fcc82049dfd8` |
aggregate = `d4685655301a3c694a08bd14f707e6f2763e7aa9d163d737e24e278390342503`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
不含本报告
自身 hash: `882e8a8fb716cfdb46df4c6cf0b5525735b2cfa82a5d9ed64f23f7f015af0685`
