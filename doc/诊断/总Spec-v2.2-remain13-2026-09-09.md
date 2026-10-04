# 总Spec v2.2 remain13 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain13-2026-09-09`。测试体系候选 `test-system-v1-gov-remain13-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain13-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain13-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain12-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F09-DUR-08 | covered | CT-F09-009：真实 `createService` `start()`；submit 会跑完的任务；在 `finishTurn` 注入一次失败；`waitFor` 必须失败；失败后 `isRunning===false`；再 submit 短任务并 `waitFor` 完成 |
| F04-IDM-01 | covered | CT-F04-006：真实 `createService` 父 spawn 会 complete 的 child；runner 落第一份完成后再对同一 `subagent_id`/`run_generation` 二次 `complete`；`subagent_completed` 只有 1 条；`subagent_completion_reminder` 至多 1 条；不是新轮 |

## 实现要点

- 先写 CT-F09-009 / CT-F04-006。现有 `executeMainTurn` finally 摘 `running`、`complete` 同轮幂等已满足合同；未改业务 src。
- 009 必须走真实服务收尾失败，禁止只扫 finally；失败后仍 live 不得标 covered。006 必须走真实 spawn 后再同轮 complete，禁止只复述 round4，禁止新轮冒充同轮。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未把 F15-INT-04/05 / F13-REQ-07 / F01-DEC-01 标 covered。

## 建议通过点

收尾失败后 isRunning 为 false 且可再 submit；同轮二次 complete 只有一份完成事实。

## 建议打回点

- 只扫 finally。
- 失败后仍 live。
- 用新轮冒充同轮。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain13-2026-09-09；已完成 F09-DUR-08 收尾失败摘 live 且可再 submit，以及 F04-IDM-01 同轮二次 complete 一份完成事实；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `785c9760953aa9d491aef9793e0f07957a0eaad1e56b9f8e35aa7a62faebc84d` |
| `doc/诊断/CLAUDE.md` | `1a57a04c83f5a009c693bf123df85a338dcec448f0ec5a7f8074c6a31eeab39f` |
| `packages/agent-service/tests/CLAUDE.md` | `84203b8882a466b0c150515bb569d276d3ccdb0915343092a41147a29273e4f4` |
| `packages/agent-service/tests/service/ct-f04-006.test.ts` | `cdba69d14a2560ed1625292bf2a4efb3c193daab0eeeefff2269de30e037b4da` |
| `packages/agent-service/tests/service/ct-f09-009.test.ts` | `c09c7ce0d3f3d60a17740cc8c9af82d5c264890373ffc78c44b32c2b71206cc4` |

aggregate = `509e8c61f5dccc304f4ba53aa13219ebe1fa0d01e20bf6b77f92dbafcdf72eb6`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希

去掉「## 报告自身哈希」
自身 hash: `e42c6d078db6449d90febecd35af29f97d8c638aab4adf8f7a714c5b1d5946f2`
