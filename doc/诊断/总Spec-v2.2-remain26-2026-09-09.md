# 总Spec v2.2 remain26 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain26-2026-09-09`。测试体系候选 `test-system-v1-gov-remain26-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain26-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain26-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain25-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F10-ID-02 | covered | CT-F10-016：真实 `createService`；脚本模型第一次 `chat` 挂起；任务 running 后生产 `runtime.cancel(taskId)`；落库 error/model_step/取消结果带非空宿主 `operationId`；`resultStatus` 为 `cancelled` 或 `unknown`，不得 `ok`/`failed`；`waitFor` 后 `isRunning===false`。未只改 round1 binding |
| F10-ID-08 | covered | CT-F10-017：真实 `createService` + 生产 `spawn_subagent`；未知类型 `ghost-f10-017` 落库 `tool_result` `resultStatus=failed` 不得 ok/cancelled；另一 submit spawn 真实 `searcher` 且 child 挂起后生产 `runtime.cancel(parentId)`；child 不再 running；落库 spawn `tool_result`/spawn 事件 `resultStatus=cancelled` 不得 failed/ok。未只改 round14-c binding |

## 实现要点

- 先写 CT-F10-016 / CT-F10-017。生产 `createService` → `runtime.cancel` 已在模型 abort 路径落库宿主 `operationId` 与 `resultStatus=cancelled`；生产 `spawn_subagent` 未知类型 `failed`，前台中止后 `cancelled`。本批无业务缺口，未改 `src/`。
- 016 不是直接 `runAgent` + 测试自 abort signal，也不是只改 round1 binding，不复述 014 未知工具。
- 017 不是直接 `new ChildRunner` + `createSubagentTools`，全部读持久 `task_events`。
- 未把 F10-ID-03/04/05/09/10/11/12 / F01-DEC-01 / F13-REQ-07 标 covered。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。combo 未发明 02+08 专用行，ID-AUX-CALL 不升。

## 建议通过点

createService 上 cancel 后仍有宿主 operationId 且结果 cancelled/unknown；生产 spawn 未知类型 failed、中止 cancelled。

## 建议打回点

- 直接 runAgent / new ChildRunner 冒充。
- 只改 round1 / round14-c binding。
- 未知类型与中止的 resultStatus 写反。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain26-2026-09-09；已完成 F10-ID-02 生产 cancel 仍有宿主 operationId 且结果 cancelled/unknown，以及 F10-ID-08 生产 spawn 未知类型 failed、中止 cancelled；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `2dde188a76d0155fe475d1b4b37bcd7333696aeaa4815b0b6de90cf3aa466572` |
| `doc/testing-defects.md` | `837f81f1de3c4384fbf86bf4a4438c7330c1b8aaf9293a49415fbb96e6620a8f` |
| `doc/testing-historical-ids.json` | `77da339f84cfd7e6cc1779aa68681ba69000887af77af878e7f67a580070d7e6` |
| `doc/testing-manifest.json` | `88e8ab6069e8fa49e63d0fbe9a799b25fc3eb2cf8ae57e0d78597295981b2bd4` |
| `doc/testing-matrix.md` | `c8ddfac23f21947a64acfec2d5af3cd8afe34b1d4536a51bbc5717a3938e3004` |
| `doc/测试体系-总合同-2026-09-08.md` | `5d258125375111aaefdc3d58feec28a4ba59e104d1c3261881a4d436106c53e5` |
| `doc/诊断/CLAUDE.md` | `2743aabac1b3a753c4056aa232993e106882310c1f8aad30fa18bdffc84fda25` |
| `packages/agent-service/tests/CLAUDE.md` | `1cdb56a7f773473385e2e30dae1e5a859ead2b301bf948a532f02427ca5d55f0` |
| `packages/agent-service/tests/service/ct-f10-014.test.ts` | `9197363717cdead45fa1a6333f8a531eb84e3dcfb47b3a5ca995bae38e68e3d8` |
| `packages/agent-service/tests/service/ct-f10-015.test.ts` | `fc92d93b3ecb9a20d01f1ecd432da538fe7924d1af5e74a82e3cf096cc42928f` |
| `packages/agent-service/tests/service/ct-f10-016.test.ts` | `f235f07c7ee13a3e1ac369030df4d80e9d10824b2c767d3ece74d400eeae2097` |
| `packages/agent-service/tests/service/ct-f10-017.test.ts` | `04c12c671650f5bc2c343317bf777c048a259aaee5ccc73226a53af12bc543f2` |
aggregate = `1233661fccb826c535ab8676d1fb24599d8f51feca98e35680aefa88365b4074`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。


## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `56e31c334418552347f00a4ac2dfb5cf78454aac250d2becafd47a7791166004`
