# 总Spec v2.2 remain51 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain51-2026-09-09`。测试体系候选 `test-system-v1-gov-remain51-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain50-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain51-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain51-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain50-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F21-QRY-06 | covered | CT-F21-009：生产 `createService` + 真实 WS + `export_exec_pack` 到独立 dest（dest 不在 home 下）。导出后 `handle.close()`，再 `rm -rf home`。之后只读 dest：`manifest.json` 可打开，列出 operation/文件。dest 内不得出现 `settings.json` / `.env` / `agent-service.json` / `lumen.sqlite` / token / apiKey 字面量。不是复述 CT-F23-003（`exportDiagnostic`）。不是复述 CT-F21-008（missing）。不升 F23-PKG-01 / F23-PKG-03。`process.pid !== 71847` |
| F23-PKG-05 | covered | CT-F23-005：生产 `createService` + 真实 write_file 落 hash，`export_exec_pack` 到 dest。用清单 sha256 定位 dest 内对应文件；原文件 sha256 等于清单。改写 dest 内该文件字节后，重算 sha256 ≠ 清单。不改 home 里的源 blob。不是复述 CT-F20-010（源 blob 篡改）。不是复述 CT-F21-008（缺文件 missing）。不升 PER-BLOB-EXPORT。`process.pid !== 71847` |

## 实现要点

- 先写 CT-F21-009 / CT-F23-005。取得权走生产 `createService` + `start` + 真实 WS。
- 现有 `exportPack` + 清单 hash 已够；本批不改业务 src。
- 不升 F13-REQ-07、DEC-01、OWN-10、CON-*、F23-PKG-01、PER-BLOB-EXPORT。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。未修 CT-F16-012 / AT-F16-001。

## 建议通过点

export_exec_pack 后删 home，只读 dest 仍能打开 manifest 并列出 operation/文件；dest 无用户根与凭证字面量。清单 sha256 能定位 dest 副本且原 hash 相等；改写 dest 后 hash 不等于清单；home 源 blob 不变。

## 建议打回点

- 只改 CT-F23-001 / CT-F23-003 / CT-F20-001 / CT-F21-008 binding。
- 走 `exportDiagnostic` 当 F21-QRY-06。
- 只测 missing，没有删 home 后独立检查 dest。
- dest 落在 home 下，或 dest 出现 settings.json / .env / agent-service.json / lumen.sqlite / token / apiKey。
- 改 home 源 blob 当 F23-PKG-05，或只复述 CT-F20-010。
- 默认升 DEC-01 / REQ-07 / OWN-10 / CON-* / F23-PKG-01 / PER-BLOB-EXPORT。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain51-2026-09-09；已完成 F21-QRY-06 / F23-PKG-05；不升 F13-REQ-07 / F01-DEC-01 与 F20 整簇；CON-REQID / ID-STALE-CONN 不升；不升 F23-PKG-01 / PER-BLOB-EXPORT；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：本批 ct-f21-009 / ct-f23-005 / ct-f21-008 / ct-f23-003 4 pass。agent-service 全量 732 pass / 0 fail / 2 skip（AT-F16-001 / CT-F16-012 本轮整包绿；整包偶发闪红本批禁止修）。ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain51 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。不含本报告。算法段只写名为 报告自身哈希 的二级标题。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `5fc4ed6151e8b5345e63b659f9c35789cb7f282c12c9d631a96d0273c76428dd` |
| `doc/testing-defects.md` | `7246101c531088c77218fb2a1a6b90548bc7e2f9d40cd9227cf3ae67d85a868c` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `36c7bc0d2f0d3efbba715f05552a643ef4e80a5a2fe6392059c0146bd8315a32` |
| `doc/testing-matrix.md` | `283898e92a1d177c01e512d1b0381272fb24dd60e107f4d8b2ca46f9f5488d68` |
| `doc/测试体系-总合同-2026-09-08.md` | `ff9ef72e9bc44730f04b92d6bd3f6aee81b84630b27bc1fc9e2b9f90df77c59f` |
| `doc/诊断/CLAUDE.md` | `db1cc8ed9249eff20dbadc887b35749a46199bc34e652ff4e3b6e39584e35210` |
| `packages/agent-service/tests/CLAUDE.md` | `68aebbaa984ff46c9395523e0a62014f9ba40435252ab7406a734e7b8a302911` |
| `packages/agent-service/tests/service/ct-f21-009.test.ts` | `087a0c79266a5b226f069dc5fed409fff59ead2eb4d671e4a2d2db1c192ccd91` |
| `packages/agent-service/tests/service/ct-f23-005.test.ts` | `d1d5b85caefcac106bdf1390186e03e3d01e5deaedf1eeff57f646ae8578b9d0` |
aggregate = `64b93286b5ca64c87f30fbdcc7be6954fbd53bc241f5182daab4b5fc5d139e53`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `849387791ff76fb33eca4fe771260e0de25a185abe205662ee52cb853061b8cf`
