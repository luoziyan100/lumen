# 总Spec v2.2 remain9 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain9-2026-09-09`。测试体系候选 `test-system-v1-gov-remain9-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain9-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain9-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain8-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F03-DRN-02 | covered | CT-F03-011：真实 `createService` `start()`；父任务 `spawn_subagent` 后台 child，child 进入模型后父仍 running；调用 `runtime.cancel(parentId)`，不用 close 冒充；等到父不 running 且 child 退出（发信号≠已退出）；cancel 后服务仍活，再 submit 短任务并 `waitFor`；最后 `handle.close()`，同一 home 第二实例必须 `await start()` |
| F03-DRN-04 | covered | CT-F03-012：真实 `createService` abort-deaf 模型；`handle.close({ timeout: 400 })` 必须失败；失败后 `acquireInstanceLock(home)` 失败，第二 `createService({home})` 抛 `InstanceLockError`；无 unhandledRejection。不是只扫 G14-10 |
| LC-SHUTDOWN-MODEL | covered | 随 F03-DRN-04：超时失败 + 锁仍在 |
| F13-REQ-07 | partial | 本批未再切超时。禁止标 covered |
| F01-DEC-01 | partial | 本批未再磨写入口。禁止标 covered |

## 实现要点

- 先写 CT-F03-011 / CT-F03-012。cancel 发信号后测试等到 child 退出；现有 `cancel` + abort 路径已满足，未改 cancel 语义。
- `handle.close({ timeout })` 把时限注入 `runtime.shutdown`；生产默认仍是 10s/12s。close 超时失败本来就不 `dispose`/放锁，测试钉同进程第二实例不得 start。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未碰 F16-HAN-05/06/09。
- 未把 F03-DRN-03 / F03-DRN-08 / F13-REQ-07 / F01-DEC-01 / F15-INT-* 标 covered。

## 建议通过点

必须调用 cancel 而非 close；cancel 后服务仍可 submit；abort-deaf 超时 close 失败且锁仍在。

## 建议打回点

- 用 close 冒充 cancel。
- 超时后仍放锁却标 covered。
- 把 F01/F13/F15 标 covered。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain9-2026-09-09；已完成 F03-DRN-02 runtime.cancel 排空 child 且服务仍可 submit，以及 F03-DRN-04 abort-deaf close 超时失败且锁仍在；F13-REQ-07 与 F01-DEC-01 仍 partial。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `19024405c25314d7103b6516c226544c1a560adc5d83e29162b451cec3e02e63` |
| `doc/诊断/CLAUDE.md` | `6f06840303287db15c9c8897b7ce46832a6448f1c879cd4fd5d206b47c2223b2` |
| `packages/agent-service/CLAUDE.md` | `adc783d710ca37cba0c2267741b90122cf5b4be03206ab460092701aabec3ae8` |
| `packages/agent-service/src/protocol/CLAUDE.md` | `6c0562e17ddc032dd87eb7d52d274bd650191944a20be046c0757414bd1982df` |
| `packages/agent-service/tests/CLAUDE.md` | `f5fb95ab66a5c0cfa109ec2c6695e5975901e1be2998ea830dea20b7905311a6` |
| `packages/agent-service/tests/service/ct-f03-011.test.ts` | `61d9d97ff900aea5cb1c551c89a7e5f581387a5359e20d8f12f19665a131024a` |
| `packages/agent-service/tests/service/ct-f03-012.test.ts` | `55f715b5d2de61b697e7069a7226ea51a96bcf986f62832394a16dcb21009340` |

aggregate = `910ed63ed8960bd8a3a0a62878c2abc32ebfaa4da330908d9b6782a9cfd1fe30`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希

去掉「## 报告自身哈希」
自身 hash: `528818f50fb1720bddf805ec126ea1af2a240ec34773160dd0f80c25b23a0627`
