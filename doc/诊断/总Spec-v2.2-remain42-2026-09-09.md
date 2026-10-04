# 总Spec v2.2 remain42 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain42-2026-09-09`。测试体系候选 `test-system-v1-gov-remain42-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain41-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain42-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain42-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain41-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F20-STO-03 | covered | CT-F20-011：生产 `createService.start` + `submit`；生产 OpenAI stream 503 无正文；经 `listExecRecords` / `readExecRecord` 至少一条 `contentStatus=failed` 仍有可读正文与 `contentSha256`；hash 对得上保存正文；不得 complete。不是只改 V2R-04 / CT-F20-003 binding，不是手插 `ExecStore.insert`，不是复述 CT-F20-010 改 blob mismatch |
| F20-STO-04 | covered | CT-F20-012：生产 `createService.start` 后再让 `exec-evidence` 不可写；主循环写出至少一条新 record；不得 `contentStatus=complete`；须 failed / writeError / collection_gap；`listTasks` 终态仍 done。不是只改 V2R-11 / CT-F20-004 binding，不是手插空库 |

## 实现要点

- 先写 CT-F20-011 / CT-F20-012。取得权走生产 `createService` + `start` + 真实主循环。
- 现有 `ExecStore.insert`：`contentStatus=failed` 仍落盘正文；内容目录不可写则 failed + `meta.writeError`，不装 complete。`safeRecord` 失败写 collection_gap。本批不改业务 src。
- 不升 F20-STO-01/02/05..09、F19 整簇、OWN-10、CON-*、PER-BLOB-EXPORT、F23-PKG-05、F01-DEC-01、F13-REQ-07。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

生产主循环采集失败时 failed 记录仍保存可读正文与 hash，不得伪装 complete；start 后再让内容目录不可写，新 record 须 failed/缺口标记，任务终态不得被正文落盘失败改写。

## 建议打回点

- 只改 CT-F20-003 / CT-F20-004 / V2R-04 / V2R-11 binding。
- 只测 `wrapToolsForEvidence` / 手插 `ExecStore.insert` 不经 `createService`。
- 把 CT-F20-010 的改 blob mismatch 改名当 011。
- failed 没有正文，或不可写仍标 complete。
- 默认升 STO-01/02/05..09 / F19 / OWN-10 / CON-*。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain42-2026-09-09；已完成 F20-STO-03 / F20-STO-04；不升 F20-STO-01/02/05..09 与 F19 整簇；CON-LOCK-SAME-INODE / CON-LOCK-SWAP / SEC-SYMLINK-WRITE 不升；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：本批 ct-f20-011/012/010 + at-f20-001 5 pass。agent-service 全量两次 711 pass / 2 fail / 2 skip（AT-F16-001 隔离重跑绿；CT-F16-012 本批禁止修）。ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain42 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `be2353eb8988202cf93b35a0322b31ff9607ac9c236489c161bbe85dc3c6a68a` |
| `doc/testing-defects.md` | `76e73c9ef28fde0fa2292cc9684b14c45e3365970123543476246a6fff87bc39` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `0f319274e8a68d20577eef2714f9f57ecabfc5cb25210128a210c2a7236da70d` |
| `doc/testing-matrix.md` | `bd69ebc940d76c327567704904d4c898ad6b9bd5ebfa5b9f30482ead2378a51a` |
| `doc/测试体系-总合同-2026-09-08.md` | `f96956c40658e9a9c902c3dd5ff9d1a85ba4d30b1a3701dc78756ef4989028df` |
| `doc/诊断/CLAUDE.md` | `85f2d4a68e2e805c0e785654e7ea30e0b2d1a1dbcda5e0e1f7522a7469c16c8e` |
| `packages/agent-service/tests/CLAUDE.md` | `6a438b34cae2a0263bc29f00aa0e68055d287c682daa75d4700a90b016a759d1` |
| `packages/agent-service/tests/service/ct-f20-011.test.ts` | `a1b37f838b84746372e7e20789507ef8998f3df207bec3c00971fd7dbdd56ee9` |
| `packages/agent-service/tests/service/ct-f20-012.test.ts` | `efce7f28c7c9aba6cbe67339c1004292512d5bd2cac2df8f1b164c80ea62b272` |
aggregate = `6957c9189615bd54c4e001bb73946b261fbbd423eb15d4fc921bc2fa8a7bedb3`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `bb359859840761a74a071b5193e7422b168d0bd8c60bc2d3c365c3d2ced40537`
