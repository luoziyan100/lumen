# 总Spec v2.2 remain57 2026-09-09

[INPUT]: briefs/active/governance-loop/执行.md v2.2；台账 testing-matrix / manifest / defects；生产 mark_bad_case / useComposerDraft
[OUTPUT]: F22-BAD-06 / F05-DST-01 公开回归 CT-F22-006 / CT-F05-012
[POS]: 治理 Loop remain57 实现推进说明，不是验收裁决
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain57-2026-09-09`。测试体系候选 `test-system-v1-gov-remain57-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain56-2026-09-09` 已作废。

implementation_candidate_id: governance-impl-remain57-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain57-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain56-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F22-BAD-06 | covered | CT-F22-006：生产 `createService` + 真实 WS。第一轮纯 reply，从 exec_records / 该操作事件取真实 turn，不猜。`continue` 第二轮再答完。`mark_bad_case` `turnId=unknown` + 第一轮 `operationId` 必须落到第一轮，不得第二轮 / `unknown` / 最后一条 `turn_start`。对照第二轮 `operationId` + `unknown` 落到第二轮。`get_bad_case` / `list_bad_cases` 一致。不是复述 V2R-13 直调。不升 BAD-02/03/05。V2R-13 保持 partial-fix。`process.pid !== 71847` |
| F05-DST-01 | covered | CT-F05-012：真实 `useComposerDraft` / `mountComposerDraft`。A 点 submit（带上传以冻结 dest）后切到 B 改输入，发出命令 dest 仍是 A 的 projectId/taskId，文本仍是 A 的。不是复述 CT-F05-001 源码扫描 / G14-07 binding。建议 ID CT-F05-010 已是 DST-10 historical-unbound，故新钉 CT-F05-012。不升 DST-02..11。未改 UI 业务 src，不重装 App |

## 实现要点

- 先写 CT-F22-006 / CT-F05-012。F22 取得权走生产 `createService` + `start` + 真实 WS。F05 走已有 `mountComposerDraft` harness，不 `readFile` 源码。
- `resolveTurnId` 与 dest 冻结已够，本批未改业务 src。
- 不升 F13-REQ-07、DEC-01、OWN-10、CON-*、F22-BAD-02/03/05、PER-BLOB-EXPORT、F24-RPL-09..11、ID-TURN-MULTI-OP、SEC-REPLAY-ROOT。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。未修 CT-F16-012 / AT-F16-001。未改 UI/Rust 业务 src。

## 建议通过点

旧操作 `unknown` 落到该操作自己的 turn。第二轮对照落到第二轮。不得回退最后一条 `turn_start`。submit 冻结 dest 后切走，命令 dest/文本仍是 A。

## 建议打回点

- 只改 RP-F22-001 / V2R-13 binding。
- 复述 V2R-13 直调 `markBadCase` + `appendEvent` 当 BAD-06。
- 只改 CT-F05-001 / 源码扫描 / G14-07 binding。
- 旧操作 `unknown` 落到第二轮或最后一条 `turn_start`。
- 切到 B 后命令 dest/文本变成 B。
- 默认升 DEC-01 / REQ-07 / OWN-10 / CON-* / BAD-02/03/05 / DST-02..11 / RPL-09..11 / SEC-REPLAY-ROOT。
- 把 V2R-13 标 closed。
- 动生产 label / PID 71847。
- 用已占用的 CT-F05-010 当绑定 ID（它是 DST-10 historical-unbound）。

人话状态：正在第 governance-impl-remain57-2026-09-09；已完成 F22-BAD-06 / F05-DST-01；不升 F13-REQ-07 / F01-DEC-01 与 F20 整簇；CON-REQID / ID-STALE-CONN 不升；不升 F22-BAD-02/03/05 / PER-BLOB-EXPORT / F24-RPL-09..11 / ID-TURN-MULTI-OP / SEC-REPLAY-ROOT；V2R-13 保持 partial-fix；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：本批新测 + CT-F22-005 / CT-F24-017 / G14-07 已绿。agent-service 740 pass / 3 fail / 2 skip（AT-F16-001 与 CT-F16-012，本批禁止修）；ui-client 339 pass / 3 skip；theme 54 键。未动生产 label / PID 71847。未改业务 src。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain57 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。不含本报告。算法段只写名为 报告自身哈希 的二级标题。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `d3d354e67b712bd9ad32b3499af47480ca6261f61fefde219cde16e08512b82a` |
| `doc/testing-defects.md` | `44cab4835c669778a8eb4d1b83da844d81eabb9a37d5f23c67b42cfbffa3d8cb` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `d037c7bc7d76d6f373eefb0918aeaa43d6463a50d4785b85a95f6e687c3774c2` |
| `doc/testing-matrix.md` | `716986429f91bae755a7959d938b20ecbaf6620234235e7ea9fdf9697706b858` |
| `doc/测试体系-总合同-2026-09-08.md` | `e42961934b672a2474fcebfa5adf9b1eb119ebe9e147a1f29e058e0499f94883` |
| `doc/诊断/CLAUDE.md` | `ebe5a745eebb17e978a1c4df6662a0be556c019fd3c79744dd2856776e16a431` |
| `packages/agent-service/tests/CLAUDE.md` | `58da9582c9cc6da8f8b34491953cc7a29ac5cfea1afebb699c934ce55f4a23e2` |
| `packages/agent-service/tests/service/ct-f22-006.test.ts` | `a50ae7951d98fbd58a9b6dd0ce7efe6df90148cfb4390cae098ed89a4c715091` |
| `packages/ui-client/tests/CLAUDE.md` | `0d0e4d88d47ae6bf5b66bf4a86917c9d801ef123185823cb087cd05f88296910` |
| `packages/ui-client/tests/ct-f05-012.test.ts` | `629657602123238e7502a71fd48c51302c006b5805ba4924c334ad787f739577` |
aggregate = `8c0481b36502acbf9634f6f8a5ab9572d988e55f42d17ff8ab2296dd01273a0e`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
不含本报告
自身 hash: `9152eb2fa9b64d0844d9035e6bb111193a4c215437a9b6f1ae1d6d63ac86ff96`
