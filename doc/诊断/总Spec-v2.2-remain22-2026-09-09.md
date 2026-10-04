# 总Spec v2.2 remain22 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain22-2026-09-09`。测试体系候选 `test-system-v1-gov-remain22-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain22-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain22-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain21-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F07-RES-02 | covered | CT-F07-008：真实 `createService` + 真实 `spawn_subagent`；background child 写文件；child 事件落库且 `agent_role !== 'main'`；`rebuildThread(store.listEvents(taskId))` 与 `continueTask` 第一次 chat 主线程无 child `write_file` / `toolCallId` / model_step 正文；只见 main 的 spawn_subagent 父可见结果。未把 ID-MAIN-CHILD-OP 标 covered |
| F07-RES-03 | covered | CT-F07-009：真实 `createService`；父任务跑完后写入同 `providerCallId`、不同 `operationId`（op-a / op-b）的两条 `tool_call`，只给 op-a 落 `tool_result`；生产 `sweepInterrupted` 只封 op-b 为 unknown；op-a 不得被改写；再 sweep 不得再追加。未把 F10-ID-07 标 covered |

## 实现要点

- 先写 CT-F07-008 / CT-F07-009。现有 `rebuildThread` 只回放 `agent_role` 为 main/NULL 的事件；`sweepInterrupted` → `sealUnknownToolResults` 按宿主 operationId 配对，同 provider id 不互吞。本批无业务代码缺口。
- 008 走真实 `createService` + 真实 `spawn_subagent`，不是旧 `spawn` 工具 + 直接 `AgentRuntime`，也不是复述 CT-F04-009（009 只钉完成通知）。
- 009 走真实 `createService` + 生产 `sweepInterrupted`，不是测试里直接 `sealUnknownToolResults`，也不是只改 round4 binding。
- 未把 ID-MAIN-CHILD-OP / F10-ID-07 标 covered。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未把 F15-INT-04/05 / F13-REQ-07 / F01-DEC-01 标 covered。

## 建议通过点

真实 spawn_subagent 后重建主线程无 worker 内部步骤；同 provider id 两条 operation 只封未配对那条。

## 建议打回点

- 只改 resume.test / round4 binding。
- 直接调 sealUnknown 冒充服务路径。
- 把 ID-MAIN-CHILD-OP 吹 covered。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain22-2026-09-09；已完成 F07-RES-02 真实 spawn_subagent 后重建主线程无 worker 内部步骤，以及 F07-RES-03 同 provider id 只封未配对 operation；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `5f6fa89033f44c990ef2dfc62303d743b4e996f989bf3b41e4dfff2c212c379e` |
| `doc/testing-defects.md` | `0082046c914d57417f5a681c31e904250bed636e62bfc1c1e5e6f2a1e8d949ca` |
| `doc/testing-historical-ids.json` | `77da339f84cfd7e6cc1779aa68681ba69000887af77af878e7f67a580070d7e6` |
| `doc/testing-manifest.json` | `0db3cada3bf8f3967136db2aba3f34c794f846cadcea3e3f4953a3a01ce509c6` |
| `doc/testing-matrix.md` | `ae24d6a52b76252beb40c44d3fb12a73b61598d83b3550a1c547f58de409f269` |
| `doc/测试体系-总合同-2026-09-08.md` | `9e7e34d00183873dfd21fa90acd793a20acc6c08633a969483c53290067b2582` |
| `doc/诊断/CLAUDE.md` | `46ed09e57a30d1cac757dfc79112643f40107c5e614b5a22650e2dd14f931c2d` |
| `packages/agent-service/tests/CLAUDE.md` | `546570345f32502d20d379dec580df4e4994ba073b8ef0a74a4d4ded33cec734` |
| `packages/agent-service/tests/service/ct-f07-008.test.ts` | `5c7203729f729b0f75dddf016783d5b18d80f0efce9856dffedd034e57a33d34` |
| `packages/agent-service/tests/service/ct-f07-009.test.ts` | `cf0573328c5eaf6ab30e3fe9085c1ed22b389a89841472957847e5de99bc7137` |
aggregate = `dac72326be4a071a6761282eb1679becbdc6b2ac940abd1ffcd29f740257f232`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `e3ef3995b971ba47dbedac130a95210f5ca49b05cae0384b3fe92fa8560511c9`
