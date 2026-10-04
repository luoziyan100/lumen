# 总Spec v2.2 remain17 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain17-2026-09-09`。测试体系候选 `test-system-v1-gov-remain17-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain17-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain17-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain16-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F09-DUR-04 | covered | CT-F09-013：真实 `createService` `start()` + `ws://127.0.0.1:<port>/?token=`；库级 trigger 打在 `context_usage` 插入；WS 收到 `runtime_failure` 且 `phase === 'context_usage'`、不得是 `session_projection`、`durable === false`；任务终态仍 done；须有 `turn_end`；失败的 `context_usage` 不得落库；JSONL 投影文件仍在 |
| F09-DUR-05 | covered | CT-F09-014：真实 `EventHub` + 真实 `TaskStore` + 真实 SQLite；两个 `test()` 分别钉 sync throw 与 `Promise.reject`；第二个 listener 仍收到该事件与下一条 record；不得有未处理拒绝；已 done 仍 done；`createService` 续跑路径 observation phase 为 `event_listener` |

## 实现要点

- 先写 CT-F09-013 / CT-F09-014。现有 `emitContextUsage` 失败报 `context_usage`、`EventHub.notify` 隔离 sync/async listener 已满足合同；未改业务 src。
- 013 必须真实 WS 看见 `phase === 'context_usage'`，禁止允许 `event_listener`，禁止只改 binding 把 G14-03 吹 covered，禁止复述 011/012 的 finishTurn/status 事务。
- 014 必须同时覆盖同步抛与 `Promise.reject`；EventHub 直测即 `AgentRuntime.subscribe` 的生产 `notify` 路径，并再经真实 `createService` 续跑一轮。禁止只扫 round14-a 标题。
- PER-DB-EVENT / PER-JSONL 仍 partial（F08-TXN-01..05 / F09-DUR-06 未齐），禁止升 covered。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未把 F15-INT-04/05 / F13-REQ-07 / F01-DEC-01 标 covered。

## 建议通过点

context_usage 失败后终态仍 done 且 phase≠session_projection；sync throw 与 Promise.reject 都不挡后续 listener、终态不改。

## 建议打回点

- 只改 binding。
- phase 写成 session_projection。
- 只测一种抛错。
- 把 PER-JSONL / PER-DB-EVENT 吹 covered。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain17-2026-09-09；已完成 F09-DUR-04 水位失败不改终态，以及 F09-DUR-05 listener 隔离；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `05dcfb9c06b2e76c4025723be5c47ff77ab30b1b067a188dcf2fa56b48793612` |
| `doc/诊断/CLAUDE.md` | `db3971108d2ceec5a2a9480d69b8966fc6307e5fafa96840d6abe66f348a0c25` |
| `packages/agent-service/tests/CLAUDE.md` | `fcc1ae257d678e9def2aba28747d268c03f412f077c0e84cf5418c7390db1a6b` |
| `packages/agent-service/tests/service/ct-f09-013.test.ts` | `5c7df97d6fef3d4ddbfc57086938721754ccf70a13069430e7381fa410067c23` |
| `packages/agent-service/tests/service/ct-f09-014.test.ts` | `48004a57efdbb116020e8a194ec90b661e807c518937bdf90c92b826503f83f8` |

aggregate = `b419bf6fae373f34909a9edd838da2112bb5d8154dfce7061ad14a5004f35de2`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `8fdd2d3802a713601e733c8ea7c2ccdac643882d588228614cd4fcaad5ad9b75`
