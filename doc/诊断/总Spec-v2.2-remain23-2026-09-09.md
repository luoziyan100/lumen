# 总Spec v2.2 remain23 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain23-2026-09-09`。测试体系候选 `test-system-v1-gov-remain23-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain23-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain23-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain22-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F07-RES-01 | covered | CT-F07-010：真实 `createService`；父任务跑完后写入 child 角色悬空 `tool_call`（`agent_role=searcher`，带 `subagent_id` + `operationId`）；生产 `sweepInterrupted` 封口 `tool_result` 仍是原 child 角色，不得改成 `main`；payload 保留原 `operationId` / `subagent_id`，`resultStatus=unknown`。未把 F07-RES-07 标 covered |
| F07-RES-04 | covered | CT-F07-011：真实 `createService` 全程（同一 service：submit → 失败 → drop trigger → continueTask）；库级 trigger 打在 `tool_result` 插入；`waitFor` 失败且 `isRunning===false`；解除后同一 service `continueTask` 续跑完成；`rebuildThread(...).forModel()` 每个 assistant tool_use 都有配对 tool_result；最后一条不得是孤立 `tool_result`；再 sweep 不得再写封口。未复述 009 |

## 实现要点

- 先写 CT-F07-010 / CT-F07-011。010 走生产 `sweepInterrupted`，现有 `sealUnknownToolResults` 已按原 `agent_role` 落封口，无业务缺口。
- 011 发现续跑只在内存 `repairDanglingToolCalls` 配对、库里仍悬空，再 sweep 会补封口。`continueTask` / `resume` 在无 live 子时先 `sealUnknownToolResults` 再重建，配对落库后 sweep 不再追加。
- 010 不是测试里直接 `sealUnknownToolResults`，也不是只改 round1 binding。
- 011 是同一 `createService` 续跑，不是直接 `AgentRuntime` + 后开 `createService`，也不是复述 009。
- 未把 F07-RES-07 / F10-ID-07 / ID-MAIN-CHILD-OP 标 covered。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未把 F15-INT-04/05 / F13-REQ-07 / F01-DEC-01 标 covered。

## 建议通过点

生产 sweep 封口保留 child agent_role；tool_result 写失败后续跑线程配对完整、无孤立结果。

## 建议打回点

- 直接 sealUnknown 冒充服务路径。
- 只改 round1 / round6 binding。
- 不是同一 createService 续跑。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain23-2026-09-09；已完成 F07-RES-01 生产 sweep 封口保留 child agent_role，以及 F07-RES-04 同一 createService 上 tool_result 写失败后续跑线程配对完整；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `c81aac4807445940446c6fa81b049ae16b356bafdc7069e0d2c01f0180016894` |
| `doc/testing-defects.md` | `167e7daff3439b6a143e07011a3f7b09654d3b134d92861c4c80bc0e6f75b776` |
| `doc/testing-historical-ids.json` | `77da339f84cfd7e6cc1779aa68681ba69000887af77af878e7f67a580070d7e6` |
| `doc/testing-manifest.json` | `0c65b6a325e99dd6447d8bb2deaa735b04147f433a3ef977983db4fd5eefc088` |
| `doc/testing-matrix.md` | `ea78c13523fdc2addfac4616f96fcc9f36ea19591cdc7381d88452cd1fd91195` |
| `doc/测试体系-总合同-2026-09-08.md` | `5729a3d430debbadbb70b025817956b7021df0bda219084107c9270fd3b506ad` |
| `doc/诊断/CLAUDE.md` | `429c2d6b36f193625c7bc8858eb3781fc21ce1697f13f7d59191f719f7a0a78e` |
| `packages/agent-service/tests/CLAUDE.md` | `90ea0512781275ee780314a977c9c965748c306d4988ccf4d44c208c9020f206` |
| `packages/agent-service/tests/service/ct-f07-010.test.ts` | `5bc6071e3900731b9a0e80c85d5dab1ab7d5b53228727ee74a868d094da436d5` |
| `packages/agent-service/tests/service/ct-f07-011.test.ts` | `1d8058172dee12d187dc83c839ff3b3a7639349f21ed730e2e7ad673c76f8e9a` |
aggregate = `36032a5f86ff49b3af511469e88f46695c910803999452d057c2de588d3980a4`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `b438ce98074d11925cfef66f8ec7289baa176e105d2968dc45d43f5ad879b736`
