# 总Spec v2.2 remain24 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain24-2026-09-09`。测试体系候选 `test-system-v1-gov-remain24-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain24-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain24-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain23-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F07-RES-07 | covered | CT-F07-012：真实 `createService` + 生产 `spawn_subagent`；child `write_file` / `model_step` 的 `operationId` 落库且 `agent_role !== main`；父账 **main** 的 tool_call/tool_result 不得使用 child 的 `operationId`；生产 `listExecRecords(parentTaskId)` 里 child write 不得变成无子身份、看起来像父主循环自己的 operation；`rebuildThread` / `continueTask` 后再查仍不得改写成 main。未把 F10-ID-07 标 covered |
| F10-ID-06 | covered | CT-F10-013：真实 `createService` + 生产 `spawn_subagent`；child 跑完后父 task 的 `exec_records` 有子循环写入（kind 含 context 或 tool，taskId=父任务）；这些 record 的 `parentOperationId` 指向父 spawn / 父 model，不得空、不得改成 child 自己的 operationId、不得抹掉；生产 `listExecRecords`；continue 后仍保留。未只改 v2r-paths binding |
| ID-MAIN-CHILD-OP | covered | CT-F10-013 同时断言：子循环 record 挂父 task + parentOperationId 保留 + 子 op 不改写成 main。F07-RES-02 已 covered |

## 实现要点

- 先写 CT-F07-012 / CT-F10-013。012 走真实 spawn 后查 operation 归属，现有事件 `agent_role` 与 exec `purpose/agentId` 已能把 child write 与父主循环分开，无业务缺口。
- 013 发现子循环 `context` 的 `parentOperationId` 为空：child model identity 未挂父 spawn。`ChildRunner.start()` 在任何 await 前从父 spawn 的 ALS 捕获 `evidence.current().operationId`（或 `parentOperationId`），`runLoop` 用 `evidenceWithParentOp` 写入子循环 exec_records。
- 012 不是复述 008「主线程看不见 worker 步骤」，而是钉 **operation 归属**。
- 013 不是直接 `new ChildRunner`，也不是只改 v2r-paths binding。
- 未把 F10-ID-07 / F01-DEC-01 / F13-REQ-07 标 covered。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

真实 spawn 后 child operationId 不被改写成 main；子循环 exec_records 挂父 task 且 parentOperationId 保留。

## 建议打回点

- 只复述 008 线程过滤。
- 直接 new ChildRunner 冒充。
- 只改 v2r-paths / IT-F07-002 binding。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain24-2026-09-09；已完成 F07-RES-07 父账不吞子 operation，以及 F10-ID-06 真实 spawn 子循环 parentOperation 保留；ID-MAIN-CHILD-OP 已诚实升 covered；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `9110bfb7247b02ab029586a178aa9197ff6ec5bc2da84389c2a289becdb57764` |
| `doc/testing-defects.md` | `3ab85063e1ecc493f7c98160f980de35e48230425574fea23d100b047faa7865` |
| `doc/testing-historical-ids.json` | `77da339f84cfd7e6cc1779aa68681ba69000887af77af878e7f67a580070d7e6` |
| `doc/testing-manifest.json` | `0486a48b1074107126b32f08e993125120f3a378f207940f2e2a49d3564ddc3b` |
| `doc/testing-matrix.md` | `65617d7d51241b513b78f39708a5664a683b085a882c04a43b085b23a21b99a7` |
| `doc/测试体系-总合同-2026-09-08.md` | `efaeacd8e9a89861a75f795280c42a2188c02273af8624204c534ad3c8fa1e03` |
| `doc/诊断/CLAUDE.md` | `edebde8946d2d89e985355608a1b88199fd43df47d71f5b3f0822fb68609c7e9` |
| `packages/agent-service/tests/CLAUDE.md` | `7c96b3d9f6029979e037b5995ea331fea8065bae3920afba73b6a5bd42c0fff2` |
| `packages/agent-service/tests/service/ct-f07-012.test.ts` | `8ab14d211d21e7b0342edf5bb0bc5397bb1dec91c91d235c30c3454422b441bf` |
| `packages/agent-service/tests/service/ct-f10-013.test.ts` | `d36efef7ac1de6f74694664993414f529b670abaf8726e2ef4698382ec38830c` |
aggregate = `fce51dec84c2a7f18aab42b03f2886d02c69b4c574d586543267340f9e6adc79`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `3c25da6b2cdc3f3d61a5dc65415d325a35bdcd81fca27e62b545fb391d92a92a`
