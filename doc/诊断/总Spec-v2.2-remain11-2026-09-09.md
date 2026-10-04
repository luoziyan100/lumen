# 总Spec v2.2 remain11 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain11-2026-09-09`。测试体系候选 `test-system-v1-gov-remain11-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain11-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain11-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain10-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F15-INT-01 | covered | CT-F15-002：隔离 temp HOME + `LUMEN_HOME` + 测试 label + 假 launchctl；无 `background-intent.json` 时真实 `launchAgentStatus` 读出 `intentEnabled===true` 且 `shouldAutoInstallLaunchAgent(status.plistInstalled, status.intentEnabled)===true`；`writeBackgroundIntent(..., false)` 后不可装；plist 不因此被创建 |
| F15-INT-02 | covered | CT-F15-003：同套隔离 + 假 plist + 真实 `uninstallLaunchAgent`；之后意图文件为 false、plist 不存在、status 反映这两点；`shouldAutoInstall===false`；`shouldRepairLaunchAgent({...从 status 填...})===false`；假 launchctl 可有 bootout，uninstall 之后不得 bootstrap / kickstart |
| DEL-FIRST-BOOT | covered | 随 CT-F15-002 诚实钉死无意图文件允许装；非生产 label / 非真机用户 HOME |
| LC-INTENT-PERSIST | uncovered | 原生重开仍属 F15-INT-04，停放 |

## 实现要点

- 先写 CT-F15-002 / CT-F15-003。现有 `readBackgroundIntent` 无文件为 true、`uninstallLaunchAgent` 写 intent false 并删 plist，已满足合同；未改业务 src。
- 002 必须走真实 `launchAgentStatus(env, home)` 读隔离文件，禁止只手传 boolean 给纯函数。003 必须走真实 `uninstallLaunchAgent`，禁止只复述纯函数。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未把 F15-INT-03/04/05 / F13-REQ-07 / F01-DEC-01 标 covered。

## 建议通过点

无意图文件时 status.intentEnabled 为 true 且可自动装；显式 false 后不可装；真实 uninstall 后无 plist + 意图关 + 无 bootstrap。

## 建议打回点

- 只调纯函数手传 boolean。
- 动生产 label / PID 71847。
- 把 F15-INT-04/05 标 covered。

人话状态：正在第 governance-impl-remain11-2026-09-09；已完成 F15-INT-01 无意图文件允许装、显式 false 拒绝，以及 F15-INT-02 真实 uninstall 后不得自动再装；DEL-FIRST-BOOT 升 covered；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `bf9b804fe0faa566a5d0ee52104e9ae585c437f3383020a07fedec9d20dcefa0` |
| `doc/诊断/CLAUDE.md` | `6dc944321b31f4db1a85fa362eef5c3abafe0201abb5758c9fcb259a3bb5dfa4` |
| `packages/agent-service/tests/CLAUDE.md` | `06af41bc36f0c3c581e6d9a1ca680ee84dc3b7ab6d9a23479970960bb078c145` |
| `packages/agent-service/tests/service/ct-f15-002.test.ts` | `4340af9b9edd4d249f8545ca2da93b9e9ae874b476b03e0f2f75583f9386ac24` |
| `packages/agent-service/tests/service/ct-f15-003.test.ts` | `54bf7b7b6e91d31428ce0c8bae3217599dd5d8bce306b70710e2e633fa7dcb2b` |

aggregate = `fb9d0e33abda57ee10f00c883c2343596b0388d7b128f1a06d5f1a1b6d5ccfab`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希

去掉「## 报告自身哈希」
自身 hash: `7e7c976cf71718cef2edaaadca2df227f7e606f64722687024b754f9c9b71d7e`
