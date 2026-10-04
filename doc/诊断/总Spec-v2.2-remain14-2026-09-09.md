# 总Spec v2.2 remain14 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain14-2026-09-09`。测试体系候选 `test-system-v1-gov-remain14-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain14-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain14-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain13-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F04-IDM-02 | covered | CT-F04-007：真实 `createService` 父 spawn 会 complete 的 child；记下历史 `subagent_completed` 的 id/payload/run_generation/turn_id；`continueTask` + `spawn_subagent resume_from` 开新轮并完成；历史那条事件 id/payload/generation/turn 不变；新完成是另一条事件、另一 generation |
| F04-IDM-03 | covered | CT-F04-008：真实 `createService` 第一轮完成后 `continueTask` resume，child 进入新轮 running；再对旧 `run_generation` 调 `complete`；当前轮 status/generation/turn 不被改写；历史完成 id/payload 不被替换；不得多出当前轮完成事件 |

## 实现要点

- 先写 CT-F04-007 / CT-F04-008。现有 `complete` 的 `run_generation` 闸与按 turn 追加完成事件已满足合同；未改业务 src。
- 007 必须走真实服务 resume 新轮，禁止同轮重试冒充新轮，禁止只复述 round1 / coordinator。
- 008 必须在新轮已 running 后注入旧 generation 迟到 complete，禁止只扫源码，禁止只复述 round14-c。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未把 F15-INT-04/05 / F13-REQ-07 / F01-DEC-01 标 covered。

## 建议通过点

新轮完成是新事件且不改历史；旧 generation 迟到 complete 不改当前轮。

## 建议打回点

- 同轮重试冒充新轮。
- 只扫源码。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain14-2026-09-09；已完成 F04-IDM-02 新轮完成不改写历史，以及 F04-IDM-03 旧 generation 迟到 complete 不改当前轮；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `98190c0aa3de7e9eeed3913525ab9235c767d0069bfcee786dafe373f4685f4b` |
| `doc/诊断/CLAUDE.md` | `35219b55b306c4652bb46e23599bf721cdfcb94c2280650e3c1504620197e832` |
| `packages/agent-service/tests/CLAUDE.md` | `e75827cc353ded6601bbb0f9c8ee7f9a10c8f7cf7c8cc4a6dac0dfc4f7abbe33` |
| `packages/agent-service/tests/service/ct-f04-007.test.ts` | `f472eee5afeb71725a8cb90e1078d152e2d633589ca6f41d991cb2e8dd5bd80a` |
| `packages/agent-service/tests/service/ct-f04-008.test.ts` | `415e0f297ba628771903f9dabe47259261c3f01516d444bfd8d81ccc2b3e7b1b` |

aggregate = `673128f0af573e6491537d4e0a98576a3760c8dab89ceed5d6642dd835360c02`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希

去掉「## 报告自身哈希」
自身 hash: `3abe20eba2ae8975a7f8759c6cb6a64795cce86ab203e7c5e9faa4537179f72e`
