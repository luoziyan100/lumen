# 总Spec v2.2 remain20 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain20-2026-09-09`。测试体系候选 `test-system-v1-gov-remain20-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain20-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain20-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain19-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F08-TXN-04 | covered | CT-F08-009：真实 `createService` + 真实 SQLite；库级 trigger 专打 `turn_start` 插入（不是 `status→running`）；失败后 `getActiveTurnId` 为 null、无 `turn_start`、父任务仍 queued、`waitFor` 看见失败、`isRunning===false`；解除后同一任务可 beginTurn 并完成 |
| F08-TXN-05 | covered | CT-F08-010：真实 `TaskStore` + 真实 SQLite，并经 `createService` 走 `updateTaskStatus`；库级 trigger 专打 `status_change` 插入；失败后不得留下 status=running 却没有对应事件，也不得只落事件不改主表；解除后同一次 update 主表与事件一致 |

## 实现要点

- 先写 CT-F08-009 / CT-F08-010。现有 `beginTurnTx` / `statusTx` 与 runtime `transact(beginTurn+updateTaskStatus)` 已同回滚，本批无业务代码缺口。
- 009 钉 `turn_start` 插入，不是 CT-F08-006 的 `tasks.status→running`，也不是只扫 batch2 标题。
- 010 钉生产写入口 `TaskStore.updateTaskStatus`，并再走 `createService`；禁止只改 binding。
- PER-DB-EVENT 因 F08-TXN-01..05 与 F09-DUR-01..04 均已 covered，诚实升 covered。未把 F08-TXN-06 标 covered。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未把 F15-INT-04/05 / F13-REQ-07 / F01-DEC-01 标 covered。

## 建议通过点

turn_start 失败后无孤立 active_turn；updateTaskStatus 主表与事件同回滚。

## 建议打回点

- 复述 006 的 status→running trigger。
- 只改 binding。
- 把 F08-TXN-06 吹 covered。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain20-2026-09-09；已完成 F08-TXN-04 turn_start 失败无孤立 active_turn，以及 F08-TXN-05 updateTaskStatus 主表与事件同回滚；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `f5864b4f2315335545cd1e0f1f762eec6cef02b704a8f4cb4d52ba309f2a9494` |
| `doc/testing-defects.md` | `25f12db25ccc48cbb3ad48da411ad7a03491047456e00b3f8510687c6d22c03c` |
| `doc/testing-historical-ids.json` | `77da339f84cfd7e6cc1779aa68681ba69000887af77af878e7f67a580070d7e6` |
| `doc/testing-manifest.json` | `368798bc30e4cb687ceb223aca08eeaa2405e47ea46faa326c71ab88339cfe0b` |
| `doc/testing-matrix.md` | `9c008294b1676576ff210b43dbdc861c442e6f598025332dd73d242223ba5f76` |
| `doc/测试体系-总合同-2026-09-08.md` | `c4bf5960f7a890f4d8eada67a9551ff2944db22520e0b77cb365c9b0e352358b` |
| `doc/诊断/CLAUDE.md` | `4c9920d8b7f9d9ac05e707b2fc7b302ec8e9877a10d6676a5f73615c57e27b82` |
| `packages/agent-service/tests/CLAUDE.md` | `45bcb20b084b105c600a8dbabf3119331f9087152d030ce1fe1e11360980c62d` |
| `packages/agent-service/tests/service/ct-f08-009.test.ts` | `1efcfe37759f039868fad3da9ebe395eff04f15118bdcc39393c6fcd87ec808e` |
| `packages/agent-service/tests/service/ct-f08-010.test.ts` | `3c1f4dac0421dca98a4ab18a37669f5682898c8f5291273cbe0c0254fc9ee66b` |

aggregate = `2ad438117a39512b00357e937e33bdd616c6c5ac6ec6d83918d6b2324ecf12f4`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `4ef74a07f335ae142594c932d66be525bfba8f14e0cd76eca00f477869b7cd01`
