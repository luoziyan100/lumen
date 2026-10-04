# 总Spec v2.2 remain18 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain18-2026-09-09`。测试体系候选 `test-system-v1-gov-remain18-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain18-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain18-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain17-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F09-DUR-06 | covered | CT-F09-015：真实 `createService` `start()`；第一轮成功写出 `sessions/<taskId>.jsonl` 后把该文件换成目录；`continueTask` 后续 `appendFileSync` 失败；任务终态仍 done；已提交 user / turn_end 或 model_step 仍在；live 订阅仍见 model_step；若有 `runtime_failure` 则 `phase === 'session_projection'` 且 `durable === false`；不得是 context_usage |
| F08-TXN-01 | covered | CT-F08-006：真实 `createService` + 真实 SQLite；库级 trigger 打在父任务 `tasks.status` 更新到 running；失败后持久 status 仍 queued，不得是 running；无 active turn / turn_start；`isRunning===false`；解除后同一父任务 `continueTask` 可进入 running 并完成 |

## 实现要点

- 先写 CT-F09-015 / CT-F08-006。JSONL 文件级失败路径已由 `appendSessionEntry` 返回 false + `session_projection` 报告满足；未改 JSONL 业务语义。
- 父任务 queued→running 原先 `beginTurn` 与 `updateTaskStatus('running')` 分两笔。现改为 `transact` 同提交；失败保持 queued，不 `finishTurn(failed)`，并同步写入 `durableErrors` 让 `waitFor` 可见。`governance-batch2` 的 turn_start 注入现与该同事务对齐，断言改为回滚 queued。
- PER-JSONL 只绑 F09-DUR-06，本批诚实升 covered。PER-DB-EVENT 因 F08-TXN-02..05 未齐，禁止升 covered。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未把 F15-INT-04/05 / F13-REQ-07 / F01-DEC-01 标 covered。

## 建议通过点

JSONL 文件级失败后任务仍 done 且事件还在；父任务 queued→running 库级失败回滚 queued 且可重试。

## 建议打回点

- 只 JS wrap finishTurn。
- 复述 CT-F08-005 子代理 markRunning。
- 把 PER-DB-EVENT 吹 covered。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain18-2026-09-09；已完成 F09-DUR-06 文件级 JSONL 失败不改终态，以及 F08-TXN-01 父任务 queued→running 回滚；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `83ef7d5536b4132a7e96eb7f3bc364e218e1d01b28f4f4f97143c4798887359b` |
| `doc/诊断/CLAUDE.md` | `d3aa1416e59116b4b4997ec05f2067b718cc1c9b036ce5dc94a8d28c889bf13d` |
| `packages/agent-service/tests/CLAUDE.md` | `439e1cd6a386a4b1538751de18b9a54a3e30c83b1275205ba4e6b62aa1f5c9ae` |
| `packages/agent-service/tests/service/ct-f08-006.test.ts` | `7e4503d32778bf28f5136782763f59e272c9255ba160eef30b7d00c81222c2b3` |
| `packages/agent-service/tests/service/ct-f09-015.test.ts` | `7b3be65c03b4eb808e308cdd242e3d004b2055b3c2686b0d760f10e2a131452d` |
| `packages/agent-service/tests/service/governance-batch2.test.ts` | `49f9687a4f8ab9b0df1bea6c2fd5b40c080d9da0042b7e4de37c53b5a17dc0aa` |

aggregate = `486763c8e5a0a4c116a6b56d8fbc0a29159ec8a95f198e5435a90eaaac51f369`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `037426f9115f3963faca16833b5993f45a11025adaa8c40e6469a4f1f94682ef`
