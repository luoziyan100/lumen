# 总Spec v2.2 remain8 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain8-2026-09-09`。测试体系候选 `test-system-v1-gov-remain8-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain8-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain8-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain7-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F03-DRN-05 | covered | CT-F03-009：真实 `createService` A `start()` → hanging submit → `handle.close()`；同一 home B **必须 `await B.start()`**；B 库内旧任务不得 `running`；A 关闭后不得再成功 `submit`/`continue`；B 能再 submit 短任务并 `waitFor` 完成。close 返回前 `acquireInstanceLock` 失败。不是只复述 R04 |
| F03-DRN-01 | covered | CT-F03-010：真实 `createService` 父任务 `spawn_subagent` 后台 child，child 进入模型后仍 live；`handle.close()` 等 child 退出才返回；返回前同进程 `acquireInstanceLock` / 第二 `createService` 失败；close 后第二实例 **必须 `start()` 成功**；再开后 child 不得仍 `running`。不是只扫 round1 |
| LC-CLOSE-REOPEN | covered | 随 F03-DRN-05：第二实例真 `start()` |
| F13-REQ-07 | partial | 本批未再切超时。禁止标 covered |
| F01-DEC-01 | partial | 本批未再磨写入口。禁止标 covered |

## 实现要点

- 先写 CT-F03-009 / CT-F03-010。现有 close 排空、放锁、`sweepInterrupted` 路径已满足；未改 `service.ts` / `agent-runtime.ts` / lock 实现。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未碰 F16-HAN-05/06/09。
- F03-DRN-05 不是只 `listTasks`：第二实例必须 `start()`，且能写短任务。
- F03-DRN-01 不是只扫旧字符串：close 返回前锁仍在，返回后第二实例 `start()`，child 不得仍 running。

## 建议通过点

第二实例必须 `start()` 成功；旧任务不得 running；后台 child close 后不得 running；close 返回前锁仍在。

## 建议打回点

- 只复述 R04/round1 且第二实例未 start。
- 把 F13-REQ-07 / F01-DEC-01 / F15-INT-01/02/03 标 covered。
- 真的 launchd:install / 动生产 label / PID 71847。
- 停放环境行仍 uncovered。

人话状态：正在第 governance-impl-remain8-2026-09-09；已完成 F03-DRN-05 close 后再开必须 start，以及 F03-DRN-01 close 等后台 child 后放锁再 start；F13-REQ-07 与 F01-DEC-01 仍 partial。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `22054b55e820fb05e0fa16f4143afcdaa96678a9017f257d7273cbe8f51c0127` |
| `doc/诊断/CLAUDE.md` | `12273ccaec2a501850824300de19a19482d68f4bab97587a6e65fb278d42af81` |
| `packages/agent-service/tests/CLAUDE.md` | `55bcdb5065b7c56d124e9c7592f0a0f49d1f38bfccac47468776e1c1bd30ef1a` |
| `packages/agent-service/tests/service/ct-f03-009.test.ts` | `9831666f23b6f751e056d90dbc1af3281de43f4c4962fa54cda56a9cff8b28eb` |
| `packages/agent-service/tests/service/ct-f03-010.test.ts` | `42f669fd7fdd5ab56480ef287ffee91cc3c4b6c64dc739e9ea1993d7f6181db0` |

aggregate = `9c177f6b14997f27d6c1ebdee9661fff89c81e5642ed1a728fd938bf8221655d`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希

去掉「## 报告自身哈希」
自身 hash: `6b23c6e72804a094ab53c14fa84b58c34416f813aa8a5fd0249b4b0e3a1fc5a2`
