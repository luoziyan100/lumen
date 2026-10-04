# 总Spec v2.2 remain27 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain27-2026-09-09`。测试体系候选 `test-system-v1-gov-remain27-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain27-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain27-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain26-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F10-ID-09 | covered | CT-F10-018：真实 `createService`；父任务生产 `spawn_subagent` 出两个 child（一个挂起 live，一个可 complete）；父先 done；注入悬空 `write_file`；仍有 live 兄弟时生产 complete 不得封口；末子 kill/complete 后同进程补 `resultStatus=unknown`，测试未调用 `sweepInterrupted()` 完成这次封口；封口不跑工具；再 sweep 不双写。未只改 idle-seal binding，未复述 CT-F03-014 |
| F10-ID-10 | covered | CT-F10-019：真实 `createService`；父 done 后生产 `archiveTask`；向已归档父任务注入悬空 `tool_call`；生产 `sweepInterrupted()` 封一条 unknown（`operationId` 对上）；再 sweep 不追加。未只改 round14-d binding，未复述 007 |
| LC-PARENT-LIVE-CHILD | covered | CT-F10-018 走真实 createService，并断言 live 兄弟不误封 + 末子 complete 后同进程 unknown、不经 sweep、不跑工具 |

## 实现要点

- 先写 CT-F10-018 / CT-F10-019。生产 `createService` → Coordinator `onParentIdle` / `sealIdleParent` 已在末子 complete 后同进程封 unknown；`sweepInterrupted` 已扫归档父任务。本批无业务缺口，未改 `src/`。
- 018 不是直接 `new AgentRuntime` + 手写 coordinator，也不是测试里 `sweepInterrupted()` 冒充同进程封。
- 019 不是直接 `AgentRuntime` + 手改 `archived_at`，走生产 `archiveTask`。
- 未把 F10-ID-03/04/05/11/12 / F01-DEC-01 / F13-REQ-07 标 covered。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

createService 上末子 complete 同进程封 unknown（不经 sweep、不跑工具、live 兄弟不误封）；归档父任务悬空 op 生产 sweep 一条 unknown，再 sweep 不重复。

## 建议打回点

- 直接 new AgentRuntime 冒充。
- 只改 idle-seal / round14 binding。
- 用测试里 sweepInterrupted 冒充「末子 complete 同进程封」。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain27-2026-09-09；已完成 F10-ID-09 末子 complete 同进程封 unknown，以及 F10-ID-10 归档父任务生产 sweep；LC-PARENT-LIVE-CHILD 已诚实升 covered；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `a2fa2a091c2ef03d11555857de30bf4f4b034474c765a15fb2916dd956d7c785` |
| `doc/testing-defects.md` | `827dbc8d5b66119751600a6face497e37321eb6f41b0a00674d5fa09c6a321dd` |
| `doc/testing-historical-ids.json` | `77da339f84cfd7e6cc1779aa68681ba69000887af77af878e7f67a580070d7e6` |
| `doc/testing-manifest.json` | `a1d7a3ab40e47de32476cf8f3a35cfd519da1315e8180e3b3b66389529f6db29` |
| `doc/testing-matrix.md` | `e4f4c8ad089f00fd45a8c1f45c3cf52d3dcff27ac1e0302c401382cf07306c80` |
| `doc/测试体系-总合同-2026-09-08.md` | `798ab94f669d9d3149657e96429556410f05e0166cfb2b062591bc7e50d419dc` |
| `doc/诊断/CLAUDE.md` | `1878523b1432cabe8786f292a1a62b58f66f3fbf26cc74ee4ac2b9d507e720f7` |
| `packages/agent-service/tests/CLAUDE.md` | `b1df10575bde525f43fed9d771ea07b2edab8d3ea7393af2d4d0098e8a08c20e` |
| `packages/agent-service/tests/service/ct-f10-018.test.ts` | `7c1de14279461a22b35eb878dccd1d7d946009864b8fcc9bb95a85c7e2ed6ab5` |
| `packages/agent-service/tests/service/ct-f10-019.test.ts` | `cf00c8ee7861d0fc4d8311606e8a5e265f364c4b7f95b3205894e501421d12b3` |
aggregate = `cd79dd01c0306ea9b649e318b4d6804834f50cf47e2ccc1c8c496ca7c63bbdbc`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。


## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `7862e0d0e09633fc38765976ead90fb596567984bd5b2018388c8dea68514ab5`
