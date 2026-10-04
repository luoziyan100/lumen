# 总Spec v2.2 remain15 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain15-2026-09-09`。测试体系候选 `test-system-v1-gov-remain15-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain15-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain15-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain14-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F04-IDM-04 | covered | CT-F04-009：真实 `createService` 第一轮 child complete；`continueTask` + `resume_from` 开新轮并完成；新轮另有 `subagent_completed`（另一 generation）；新轮另有一条 `subagent_completion_reminder`，不得只有历史那条；不得因历史上已 complete 丢掉新轮完成 |
| F09-DUR-02 | covered | CT-F09-010：真实 `createService` 收尾 `finishTurn` 注入失败；`waitFor` 必须 reject；任务持久 status 不得写成 done；监控见 durable `runtime_failure`；与 DUR-08 摘 live 分开断言 |

## 实现要点

- 先写 CT-F04-009 / CT-F09-010。现有 resume 清 reminder 消费位、按 generation 换 reminder key、finishTurn 失败回滚且 waitFor 抛 durableErrors 已满足合同；未改业务 src。
- 009 必须走真实服务 resume 新轮并钉完成通知，禁止只复述 007（007 不钉通知）。
- 010 必须钉 waitFor reject 且持久 status 不是 done，禁止只复述 009 的 isRunning===false。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未把 F15-INT-04/05 / F13-REQ-07 / F01-DEC-01 标 covered。

## 建议通过点

新轮有自己的完成与通知；waitFor 失败且 status 不是 done。

## 建议打回点

- 只复述 007/009。
- 新轮没有 reminder。
- 失败后 status=done。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain15-2026-09-09；已完成 F04-IDM-04 新轮完成与完成通知，以及 F09-DUR-02 收尾失败 wait 不装成功；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `a8f2ddff41eaab0688ce0094fcb718aeeaf8cae659c2307ffa9881394a9b849e` |
| `doc/诊断/CLAUDE.md` | `991e1465cec823ce99a374a396d83acd8706a91eeb78a3f86b8968aa6bab6f67` |
| `packages/agent-service/tests/CLAUDE.md` | `1d56256481fe88ffe3468bd513e744b00c9b752c225337d41e4190daa0c475d4` |
| `packages/agent-service/tests/service/ct-f04-009.test.ts` | `aab542401f3a3f86a9f8c3f88f7d3e93f364b796b66239caf21ea1837b367f6e` |
| `packages/agent-service/tests/service/ct-f09-010.test.ts` | `e31b0bc86e1cc4672359f5f72f1714356bf2bc8e2433cd8031713e77642d9802` |

aggregate = `8175f412a2b889481c463b4e925bcb740f431e4308e566063b136b7ac3bf7066`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希

去掉「## 报告自身哈希」
自身 hash: `0570d4ff09f6a816e018d5f02c4262a40e0d92244b4a5e3d07481f4ff0141156`
