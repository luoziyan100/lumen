# 总Spec v2.2 remain10 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain10-2026-09-09`。测试体系候选 `test-system-v1-gov-remain10-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain10-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain10-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain9-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F03-DRN-03 | covered | CT-F03-013：真实 `createService` `start()`；父任务 `spawn_subagent` 后台 child；`waitFor` 后父 `done` / 不再 running；此时 child 仍 hanging；断言父结束 ≠ child 已结束；然后 `handle.close()` 须等 child 退出才返回；返回前 `acquireInstanceLock(home)` 失败；close 后 child 不得仍 running；同一 home 第二实例必须 `await start()` |
| F03-DRN-08 | covered | CT-F03-014：真实服务父已 done，hang child 仍 running/live；quick 兄弟已结束；`sweepInterrupted` 与再 spawn 另一父任务不得把 live child 标成已结束或补 unknown；本条不测 close/drain |
| LC-PARENT-LIVE-CHILD | partial | 随 CT-F03-014 补了父完成 × live child 的服务路径；F10-ID-09 仍 partial，combo 不升 covered |

## 实现要点

- 先写 CT-F03-013 / CT-F03-014。现有 `complete` 后 `drainLive` 等 departing、以及 `sealIdleParent` 在 `hasLiveForParent` 时不封，已满足合同；未改业务 src。
- 013 必须先等父 done 再 close，禁止父还 running 冒充 DRN-01。014 必须独立断言父 done 期间 child 仍 live，不能只测 drain。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未碰 F16-HAN-05/06/09。
- 未把 F13-REQ-07 / F01-DEC-01 / F15-INT-* 标 covered。

## 建议通过点

父已 done 时 child 仍 live；close/drain 仍等 child；不得按父 running 误封 child。

## 建议打回点

- 只复述 coordinator 单测。
- 父未 done 就 close 冒充 DRN-03。
- 一个测试同时吹两行却只测 drain。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain10-2026-09-09；已完成 F03-DRN-03 父 done 后 close/drain 仍等 child，以及 F03-DRN-08 父 done 期间不得按父 running 误封 child；F13-REQ-07 与 F01-DEC-01 仍 partial。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `877a8e293c78fdcda510afff9b4b5d923b9b63978411b319f47634cd6bfabc37` |
| `doc/诊断/CLAUDE.md` | `327db718ee26a7a70b340d212028b2343aab5770a3c1efefe387b03d15274682` |
| `packages/agent-service/tests/CLAUDE.md` | `a8c5bbba452258505cf161c3b96b3aa011c93bfe8140c5d7d9c984d480fdc619` |
| `packages/agent-service/tests/service/ct-f03-013.test.ts` | `7d6f421e5f76b743e6907a32973d2a5c019a024d68782d4b6d09b14a012c6b3e` |
| `packages/agent-service/tests/service/ct-f03-014.test.ts` | `aa8497dc5d37e113d2af4d7941cc3db98ff7f5bd7080af19c59e873d9daf8690` |

aggregate = `bcd745f9349cd90c31e0b99f45b8a7e5df2f3669328c9ee9def496d75c106e81`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希

去掉「## 报告自身哈希」
自身 hash: `ef8d81a85752f5ad4ff4c4b0733c0f2b0cfcd728b596c78dfbccd75db07cf263`
