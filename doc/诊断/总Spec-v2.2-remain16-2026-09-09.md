# 总Spec v2.2 remain16 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain16-2026-09-09`。测试体系候选 `test-system-v1-gov-remain16-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain16-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain16-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain15-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F09-DUR-01 | covered | CT-F09-011：真实 `createService` + 真实 SQLite；`CREATE TRIGGER ... RAISE(ABORT)` 打在 finishTurn 事务内 `tasks.status` 更新；失败后不得残留 `turn_end`；持久 status 不得写成 done；证明同进同退，不是先落 turn_end 再改 status |
| F09-DUR-03 | covered | CT-F09-012：真实 `createService` `start()` + `ws://127.0.0.1:<port>/?token=`；经 WS `submit` 收尾库级失败；inbox 有 `runtime_failure` 且 `durable===true`；持久 status 不得是 failed；不得有 `status_change` to=failed |

## 实现要点

- 先写 CT-F09-011 / CT-F09-012。现有 finishTurn 同事务、durable 失败推 runtime_failure 且不伪造 failed 已满足合同；未改业务 src。
- 011 必须用库级 trigger 打在事务内部 status 更新，禁止 JS 包装 finishTurn 先抛（那是 009/010，写都没发生）。
- 012 必须真实 WS 客户端看见 durable runtime_failure，禁止只走 onRuntimeFailure 内存监听，禁止只改 binding 把 010 或 round14 吹成 covered。
- PER-DB-EVENT 仍 partial（F08-TXN-01..05 / F09-DUR-04 未齐），禁止升 covered。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未把 F15-INT-04/05 / F13-REQ-07 / F01-DEC-01 标 covered。

## 建议通过点

库级失败后无残留 turn_end 且 status 非 done；真实 WS 收到 durable runtime_failure 且 status 不是 failed。

## 建议打回点

- 只用 JS 包装抛错。
- 没有真实 WS。
- 把 010 改 binding 冒充。
- combo PER-DB-EVENT 被吹 covered。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain16-2026-09-09；已完成 F09-DUR-01 库级同事务回滚，以及 F09-DUR-03 真实 WS durable 失败且不伪造 failed；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `c8078469e7785d688eab4385dbebd0774d425acf93bf4a0ff4563cf2ee82f879` |
| `doc/诊断/CLAUDE.md` | `5e950eb6b40846447ef60fe6a32e79283aec73ba05ddb82524dc256c97441b77` |
| `packages/agent-service/tests/CLAUDE.md` | `038f5d64cf33b317c24385a2e6bca40892b400521b24249098be151539f9c0fe` |
| `packages/agent-service/tests/service/ct-f09-011.test.ts` | `a668bf983500392ecc7b36601bb02974dde79b51b78bd88dae19c09a435ebc0b` |
| `packages/agent-service/tests/service/ct-f09-012.test.ts` | `f00277251d0b05305cb273df5a228d76fd30ca552c3cf040b5a90c884387b7c8` |

aggregate = `d5a7d1c2174877bcb67804e1a981f7570c8cc84f5142b2f4390a6e587a128711`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `065d8e41c47bf24f5c1559912bc45c93da64db291de60f6484c90ed2443ee6e2`
