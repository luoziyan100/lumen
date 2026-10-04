# 总Spec v2.2 remain56 2026-09-09

[INPUT]: briefs/active/governance-loop/执行.md v2.2；台账 testing-matrix / manifest / defects；生产 replay_recorded 入口
[OUTPUT]: F24-RPL-07 / F24-RPL-08 公开回归 CT-F24-017 / CT-F24-018；isolateReplayRoot 补 resolve+realpath
[POS]: 治理 Loop remain56 实现推进说明，不是验收裁决
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain56-2026-09-09`。测试体系候选 `test-system-v1-gov-remain56-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain55-2026-09-09` 已作废。

implementation_candidate_id: governance-impl-remain56-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain56-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain55-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F24-RPL-07 | covered | CT-F24-017：生产 `createService` + 真实 WS。纯 reply → `mark_bad_case`。WS `replay_recorded` 且 `dataRoot` 等于服务 home 或 home 子目录：必须 `error`，不得 `done`，home 不得写出回放产物。对照独立 dest 可 `done`。不是复述 V2R-15 纯函数。不升 SEC-REPLAY-ROOT。`process.pid !== 71847` |
| F24-RPL-08 | covered | CT-F24-018：生产 `createService` + 真实 WS。纯 reply 字面量 `REPLY_CT_F24_018` → `mark_bad_case` expected 故意对不上 `MUST_NOT_MATCH_DOI_CT_F24_018`。独立 dest WS `replay_recorded`：不得 `status=done`；`get_bad_case.lastVerification` 不得 `done`/`passed`，assertion=failed。不是复述 V2R-16 直调。不升 RPL-09/10。`process.pid !== 71847` |

## 实现要点

- 先写 CT-F24-017 / CT-F24-018。取得权走生产 `createService` + `start` + 真实 WS。回放走 WS `replay_recorded`，不直调 `replayRecorded()`。
- F24-RPL-08 现有 `assertionFor` 已够，未改断言逻辑。
- F24-RPL-07：home 本体已被拒；Darwin `/var` → `/private/var` 时未存在的 home 子目录 `realpath` 失败会漏过。`isolateReplayRoot` 改为 resolve 与 realpath 都比。单文件仍 ≤800。
- 不升 F13-REQ-07、DEC-01、OWN-10、CON-*、F22-BAD-02/03/05/06、PER-BLOB-EXPORT、F24-RPL-09..11、ID-TURN-MULTI-OP、SEC-REPLAY-ROOT。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。未修 CT-F16-012 / AT-F16-001。未改 UI/Rust。

## 建议通过点

dataRoot=home 与 home 子目录 WS 回放均 `error` 且含 lumenHome。独立 dest `done`。expected 对不上时 replay 不得 done，lastVerification.assertion=failed。

## 建议打回点

- 只改 governance-v2r-replay / RP-F24-006 / RP-F24-007 binding。
- 复述 V2R-15 纯函数当 RPL-07。
- 复述 V2R-16 直调当 RPL-08。
- dataRoot=home 仍 `done`，或 home 里写出回放 workspace。
- expected 对不上仍记 done/passed。
- 默认升 DEC-01 / REQ-07 / OWN-10 / CON-* / ID-TURN-MULTI-OP / BAD-02/03/05/06 / RPL-09..11 / SEC-REPLAY-ROOT。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain56-2026-09-09；已完成 F24-RPL-07 / F24-RPL-08；不升 F13-REQ-07 / F01-DEC-01 与 F20 整簇；CON-REQID / ID-STALE-CONN 不升；不升 F22-BAD-02/03/05/06 / PER-BLOB-EXPORT / F24-RPL-09..11 / ID-TURN-MULTI-OP / SEC-REPLAY-ROOT；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：agent-service 全量 741 pass / 1 fail / 2 skip（失败项 AT-F16-001 首次 job_failed，本批禁止修；同文件重跑通过）；ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain56 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。不含本报告。算法段只写名为 报告自身哈希 的二级标题。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `690af467b43bd3b1b6a75e03503c155c406afb6655bfcd8ac9329c0b11a34635` |
| `doc/testing-defects.md` | `7d628338135b890fab7d34cdc5c235514bcfe935d1971a73b13a19e45222a094` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `842459785d755619b2b9bbb0f4eccdd5a503a29ea58b6cc7a369f9d533d56c6c` |
| `doc/testing-matrix.md` | `0667512d66e532d290905df77eab62ad412c110daa470a80777a58cb6183e9ac` |
| `doc/测试体系-总合同-2026-09-08.md` | `ea9c5562efffb5ab3b5d5202179d3cf3fcd7bd2ebedf4fd41e7d295a491ccd64` |
| `doc/诊断/CLAUDE.md` | `4c69278643b5eea89f04317884111aad51995d55b932588a038d012177708491` |
| `packages/agent-service/tests/CLAUDE.md` | `954e23688cc58896867618bbf2889e73f42aabfa26e56d4aba123bd9a279b65c` |
| `packages/agent-service/tests/service/ct-f24-017.test.ts` | `0e80652a6ae7f850154fd4d9dfe4cfe4bcaef5c3ccc6a7dd4f3adc38aa7cc720` |
| `packages/agent-service/tests/service/ct-f24-018.test.ts` | `537f2c1251ba933700ee9c077d80c3d50e02c695e2b8b87de605d7059b9eb876` |
aggregate = `67fe536ae2187a5b9d5a56c8812a49fbc4f62fbb905c90599bc7dbbe28ed318d`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。



## 报告自身哈希
不含本报告
自身 hash: `e2dccee1838afee31991956f2b8994eac27511cdec8d76f92c57033a56e0689c`
