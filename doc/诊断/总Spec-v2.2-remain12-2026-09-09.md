# 总Spec v2.2 remain12 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain12-2026-09-09`。测试体系候选 `test-system-v1-gov-remain12-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain12-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain12-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain11-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F15-INT-03 | covered | CT-F15-004：隔离 temp HOME + `LUMEN_HOME` + 测试 label + 假 launchctl；`writeBackgroundIntent(true)`、无 plist / 无 portfile、print 缺失时真实 `launchAgentStatus` 填进 `shouldRepairLaunchAgent` 为 true；未知活 PID=`process.pid` + 本地 TCP 可连时 `portfileAlive===true` 且 shouldRepair 为 false；意图 false 即使 job 缺失也不修；不得 bootstrap / bootout / 按 PID 杀 |
| DEL-INTENT-UNKNOWN | covered | CT-F16-014：同套隔离；意图 true + 未知活实例 → `classifyLiveOwner===unknown`、`decideInstallAction===conflict`，不得调用 `installLaunchAgent`，读回意图仍 true；意图 false + 同一未知活实例仍 conflict / shouldRepair false，读回意图仍 false |
| LC-INTENT-PERSIST | uncovered | 原生重开仍属 F15-INT-04，停放 |

## 实现要点

- 先写 CT-F15-004 / CT-F16-014。现有 `shouldRepairLaunchAgent` / `classifyLiveOwner` / `decideInstallAction` 已满足合同；未改业务 src。
- 004 必须走真实 `launchAgentStatus(env, home)` 再填 `shouldRepairLaunchAgent`，禁止只手传 boolean。014 必须落盘意图交叉，禁止调用 `installLaunchAgent`，禁止只复述 CT-F16-009。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未把 F15-INT-04/05 / F13-REQ-07 / F01-DEC-01 标 covered。

## 建议通过点

status 填进 shouldRepair，不是手填；未知活实例不修不杀；意图 true/false 与 unknown 交叉后意图不变。

## 建议打回点

- 只调纯函数手传 boolean。
- 调用 installLaunchAgent 污染意图。
- 动生产 label / PID 71847。
- 把 F15-INT-04/05 标 covered。

人话状态：正在第 governance-impl-remain12-2026-09-09；已完成 F15-INT-03 意图开且 job 缺失才修、未知活实例跳过，以及 DEL-INTENT-UNKNOWN 意图 true/false 与未知活实例交叉后意图不变；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `5817c5dd01fd3bd429e8408629a422690ad1882b8a99c1f801f215657f3a36dc` |
| `doc/诊断/CLAUDE.md` | `8ffa422eb9c0a28f1fa58a5d6f653c27c55ffa359c548881eb6399a1e9f5f4f9` |
| `packages/agent-service/tests/CLAUDE.md` | `d03a915ee3762ef7e26dbf2655ac9bb1b57885e90c726dad0ce5454c9efadfc2` |
| `packages/agent-service/tests/service/ct-f15-004.test.ts` | `e1a3e2a14a22587e407313911bc705b65d8e3420b8cfe7ab7d5e19b4684b2f72` |
| `packages/agent-service/tests/service/ct-f16-014.test.ts` | `1ec0cdd1a0ede6f435ff780af195348c0fe151e1acee6c98702c9247eacc5a33` |

aggregate = `22319e7d62b2606c2d48900a1da337bdc18e16ec5517d716b52a528518e114de`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希

去掉「## 报告自身哈希」
自身 hash: `2a28e1f7b2156dc0407d089a2f945f3ac4bf6498ce16cdb9642018295b6e5080`
