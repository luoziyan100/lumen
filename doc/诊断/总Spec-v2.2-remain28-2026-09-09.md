# 总Spec v2.2 remain28 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain28-2026-09-09`。测试体系候选 `test-system-v1-gov-remain28-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain28-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain28-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain27-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F10-ID-03 | covered | CT-F10-020：真实 `createService`；标题轮用同源 `TITLE_PROMPT_MARKER`；标题 chat 开始前已有非空 `operationId`；失败同 op / `purpose=title_backfill` / `resultStatus=failed` 可对上原 `taskId`；晚到回填不得覆盖人手改过的标题。未只改 round2 binding，未直接 `new AgentRuntime` |
| F10-ID-04 | partial | CT-F10-021：真实 `createService`；`service.runtime.repairMermaidSource` 成功/失败各一条；`purpose=mermaid_repair`；`operationId` 非空且 ≠ 主循环 chat。公开入口无 cancel/abort 参数，取消未测，禁止标 covered |
| ID-AUX-CALL | partial | 映射 03+04+05。F10-ID-05 未做，禁止升 covered |

## 实现要点

- 先写 CT-F10-020 / CT-F10-021。生产 TitleHub / repairMermaidSource 已在 chat 前分配宿主 operation。本批无业务缺口，未改 `src/`。
- 020 不套 `withIgnoredTitleChats`，自己识别 `TITLE_PROMPT_MARKER`，避免把标题轮吞掉。
- 021 走 `service.runtime.repairMermaidSource`，不是 `new AgentRuntime`。
- 未把 F10-ID-04/05/11/12 / ID-AUX-CALL / F01-DEC-01 / F13-REQ-07 标 covered。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

createService 上标题回填 chat 前已有 operationId，失败可定位，晚到不覆盖；修图 sidecar 与主循环分开且成功/失败可定位。F10-ID-04 因取消未测保持 partial。

## 建议打回点

- 直接 new AgentRuntime。
- 只改 round2 / v2r-paths binding。
- 用 withIgnoredTitleChats 把标题轮吞掉还声称测了标题。
- 把 ID-AUX-CALL 或 F10-ID-04/05 标 covered。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain28-2026-09-09；已完成 F10-ID-03 标题回填身份；F10-ID-04 成功/失败身份已钉但取消未测保持 partial；ID-AUX-CALL 不升；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `1ccd177edfd767207e82cc889baa38f66f9e8e8f0943ec2eab8099c4114e10b5` |
| `doc/testing-defects.md` | `0b5117b95d68b55e7e24cfcdc8ba1e44cc9a1b949021fbb98ad144342e1033a9` |
| `doc/testing-historical-ids.json` | `77da339f84cfd7e6cc1779aa68681ba69000887af77af878e7f67a580070d7e6` |
| `doc/testing-manifest.json` | `ea544c444cbd6816d6a70a85c3a120dba19a06701cdbba569fdecb785707db04` |
| `doc/testing-matrix.md` | `78a740678ff039f95bbc393ee60af648dda68d64d9caa91c20da30c733444fb9` |
| `doc/测试体系-总合同-2026-09-08.md` | `f7acb958be4cb1ff2e3eb2e3e59943e78d7aa440141e7f80dc7fef0c501cf57c` |
| `doc/诊断/CLAUDE.md` | `8cf287a0886672d857731b7d1d84772f0379c386bd45264be0534f1c6ccc0aa9` |
| `packages/agent-service/tests/CLAUDE.md` | `dce6d6e37cc9792ebb8e93831b0e104231000c4220b1f90451bc69bd3930a6cd` |
| `packages/agent-service/tests/service/ct-f10-020.test.ts` | `0b52c52552428e83c9fb8aa32999db52209e504a85c5ad7e0a43f68531802d9b` |
| `packages/agent-service/tests/service/ct-f10-021.test.ts` | `9decf883125123d51b55f234c9282c178ff9447921ede49b129d70267e45b2c8` |
aggregate = `688ce766f855333fb96f1a00086fc82fa4e41770b8f37a1cfd34e8ebd5a1f795`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `0019359222052d0ab191d1ef48c214a75aba858f508522b8ee49efa863707d97`
