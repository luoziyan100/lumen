# 总Spec v2.2 remain21 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain21-2026-09-09`。测试体系候选 `test-system-v1-gov-remain21-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain21-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain21-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain20-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F08-TXN-06 | covered | CT-F08-011：真实 `createService` + 真实 `spawn_subagent`；第一轮 child complete 后一条 `subagent_completion_reminder`；连续两次 `coordinator.rehydrateReminders` 不追加；`coordinator.consumeReminder` 后再 rehydrate 仍不追加；`continueTask` + `resume_from` 新轮另有 reminder 且 `dedupe_key` 不同；历史 reminder payload 不变；新轮后再 rehydrate 总数不涨 |
| F07-RES-05 | covered | CT-F07-007：真实 `createService`；注入悬空 `tool_call` 后连续两次生产 `sweepInterrupted`；unknown / 合成封口只一条；第二次不得再追加。未把 F10-ID-07 标 covered |

## 实现要点

- 先写 CT-F08-011 / CT-F07-007。现有 `reminder.ts` rehydrate 按 `dedupe_key` 去重、consume 后 `listNeedingReminderRehydrate` 不再选出、resume 换 `run_generation`；`sealUnknownToolResults` 再 sweep 不双写。本批无业务代码缺口。
- 011 走真实服务生产入口 `rehydrateReminders` / `consumeReminder`，不是 G14-11 coordinator/harness，也不是复述 CT-F04-009（009 只钉新轮有 reminder）。
- 007 走真实 `createService` + 生产 `sweepInterrupted`，不是只扫 round14-d 标题。
- 未把 F10-ID-07 标 covered。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未把 F15-INT-04/05 / F13-REQ-07 / F01-DEC-01 标 covered。

## 建议通过点

同轮 rehydrate 不追加；消费后不追加；新轮换 key；再 sweep 不双写 unknown。

## 建议打回点

- 只改 G14-11 binding。
- 把 F10-ID-07 吹 covered。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain21-2026-09-09；已完成 F08-TXN-06 reminder 同轮 rehydrate 幂等/消费后不追加/新轮换 key，以及 F07-RES-05 再 sweep 只一条 unknown；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `21699ca7bd4ebd0b677047c53392277381cbc324da48d4878f7a6bec7a1ef67e` |
| `doc/testing-defects.md` | `800538e3b6cd414a89676911382aa94ca580ee41fb3f456750d103b64dc4343d` |
| `doc/testing-historical-ids.json` | `77da339f84cfd7e6cc1779aa68681ba69000887af77af878e7f67a580070d7e6` |
| `doc/testing-manifest.json` | `93bd5152efd9fc55f51691fbadd20f51f9030534b4797788f5d1915f8f5e0b2d` |
| `doc/testing-matrix.md` | `d7da6e6ae7d5ed352dc1706748fea974d9405a2fd1eb501270600dd8a79664a5` |
| `doc/测试体系-总合同-2026-09-08.md` | `a75f067b1758f3c8627b91842b3b597e2b9229d79b240f5b08bf6a20a5fa7d36` |
| `doc/诊断/CLAUDE.md` | `f09a4ecb8cf5deb1a14e5fe594e7a26045aa6a4d5a747090a5ed3edbf7a17645` |
| `packages/agent-service/tests/CLAUDE.md` | `b6790b7450347af274724c8a6545aff6122b11f7c502e62e51395a6978ccab9d` |
| `packages/agent-service/tests/service/ct-f07-007.test.ts` | `38e084e50e7331f3237f58ea0c21b284159132ba0e24e8a375ba7593b651ced9` |
| `packages/agent-service/tests/service/ct-f08-011.test.ts` | `1a9d8e7161a148a849edc5414c4546c412669b7d7c92cdf3554f25274530f0a9` |
aggregate = `0232e2bdc43fd5e2676f5b1a5d43751311878c39bb6680bbb854a3c43ff004b5`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `d6c30498cd79eb6c13a8ec05d2f0cdf557ff6334c9109d84a453257c96787f16`
