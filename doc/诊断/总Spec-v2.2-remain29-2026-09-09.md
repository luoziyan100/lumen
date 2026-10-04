# 总Spec v2.2 remain29 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain29-2026-09-09`。测试体系候选 `test-system-v1-gov-remain29-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain29-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain29-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain28-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F10-ID-05 | covered | CT-F10-022：真实 `createService`；脚本模型调生产 `look_at_image`；`listExecRecords` 有 `purpose=vision` 且非空 `operationId`，挂原 `taskId`；成功/失败各一条可定位，失败 `resultStatus` 不得 ok；vision operationId ≠ 同任务主循环 chat。未只改 v2r-paths binding，未直接 `new AgentRuntime` |
| F10-ID-11 | covered | CT-F10-023：真实 `createService`；`write_file` 后库级 trigger 让 `tool_result` 写失败；同一 service `continueTask` 恢复只补 `unknown`，共用原 `operationId`；篡改后的目标文件不得被恢复轮重写。未只改 R13 binding，未复述 015/011 |
| ID-AUX-CALL | partial | 映射 03+04+05。F10-ID-04 取消未测仍 partial，禁止升 covered |

## 实现要点

- 先写 CT-F10-022 / CT-F10-023。022 暴露缺口：生产 `look_at_image` 的 ALS 继承工具 `purpose=chat`。`recordVisionExchange` 在非 vision 身份下另开 `purpose=vision` 的宿主 operation，parent 挂原工具身份。
- `createService` 增加测试缝 `visionTransport`，走生产 `look_at_image`，不改生产 `LUMEN_VISION_*`。注入 transport 即可跑，不另要 key。
- 023 无恢复路径缺口：生产 `continueTask` 已先 `sealUnknownToolResults`，不重跑悬空 write。
- 未把 F10-ID-04/12 / ID-AUX-CALL / F01-DEC-01 / F13-REQ-07 标 covered。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

createService 上 look_at_image 的 vision record 可定位且与主循环分开；写工具中断恢复只补 unknown、不重跑写入。

## 建议打回点

- 直接 new AgentRuntime。
- 只改 v2r-paths / R13 binding。
- 恢复后写工具又跑了一次。
- 把 F10-ID-04 或 ID-AUX-CALL 标 covered。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain29-2026-09-09；已完成 F10-ID-05 生产 look_at_image vision 身份与 F10-ID-11 写工具中断恢复不重跑；F10-ID-04 取消未测保持 partial；ID-AUX-CALL 不升；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `4441c5871e75c9299566cf98e212bbd2db3c23773c2cc65941bbff61dab0eaab` |
| `doc/testing-defects.md` | `24e1de20ced928ba601e6c54ee7c423badcd9f106dd7b20d9cba50afb8ef5f76` |
| `doc/testing-historical-ids.json` | `77da339f84cfd7e6cc1779aa68681ba69000887af77af878e7f67a580070d7e6` |
| `doc/testing-manifest.json` | `85ee7d6927412b1fc1534825fc1f274083eb090045655fa6d63a999dad1a8487` |
| `doc/testing-matrix.md` | `0a1571d52e242372f86fa568c9aab478ab5f28b6eb94e24f321a78c14f92ce02` |
| `doc/测试体系-总合同-2026-09-08.md` | `34f1120624c8015dc9178849913b48eadde3b32e7e7c190f940b4830547f6ae7` |
| `doc/诊断/CLAUDE.md` | `6170fd6a84422856349aa79fa0a7eaa6250303cf1a1d8f3cb8dbf1447f4844dc` |
| `packages/agent-service/tests/CLAUDE.md` | `6afd8f6b36c53c71638a012ed6a51029fbbc6dc8c106fdfa83bd0588048ea41d` |
| `packages/agent-service/tests/service/ct-f10-022.test.ts` | `4839c80e4b9c2c034451f0f97dbbe638b21d747bd4f5a91dbde7f5f5254494cf` |
| `packages/agent-service/tests/service/ct-f10-023.test.ts` | `ed236c154cb02a765fe12347c10c8f104756ded15e848f988d299ce09d32e553` |
aggregate = `b6dcb205fc756f7c235f98a5443bf689fdb80d871f88f3dbbbb0e76e6b06f09a`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `0620db612018a81798b6fbf0bf8981846c37f79659f24a538e978838adb11002`
