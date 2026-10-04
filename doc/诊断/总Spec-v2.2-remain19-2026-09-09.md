# 总Spec v2.2 remain19 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain19-2026-09-09`。测试体系候选 `test-system-v1-gov-remain19-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain19-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain19-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain18-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F08-TXN-02 | covered | CT-F08-007：真实 `createService` + 真实 `spawn_subagent`；child 已 running 且有 live 后，库级 trigger 打在 complete 事务（`subagents.status→done`）；失败后 child 仍 running、live 仍在、`active_turn` 仍在；`process` 无未处理拒绝；解除后同一 child 可 complete |
| F08-TXN-03 | covered | CT-F08-008：真实 `createService` + 真实 spawn；库级 trigger 专打 `subagent_completed` 事件；失败后不得留下 done 而无完成事件；解除后重试恰好补一条 `subagent_completed` |

## 实现要点

- 先写 CT-F08-007 / CT-F08-008。现有 `complete` 同事务回滚已够；缺口在 runner：run 成功后 complete 失败被改写成 error 终态并摘 live。现改为 complete 事务失败直接返回，保留 running/live 供重试。
- 007 钉 live/running/无未处理拒绝；008 钉事件失败 ⇒ 状态回滚 + 重试补一条。禁止复述 CT-F08-005 coordinator 单测，禁止复述 F09-DUR-08。
- PER-DB-EVENT 因 F08-TXN-04/05 未齐，禁止升 covered。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未把 F15-INT-04/05 / F13-REQ-07 / F01-DEC-01 标 covered。

## 建议通过点

真实 spawn 后 complete 失败仍 live/running 且无未处理拒绝；事件失败则状态回滚，重试补上一条完成事件。

## 建议打回点

- 只跑 coordinator。
- 复述 005。
- 把 PER-DB-EVENT 吹 covered。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain19-2026-09-09；已完成 F08-TXN-02 真实 spawn 后 complete 失败仍 live/running，以及 F08-TXN-03 完成事件失败则状态回滚并重试补一条；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `2dbe243c06bb89859275c0b453037bcc11b21dd5be9bfeb53701ead9165163a6` |
| `doc/testing-defects.md` | `82968d801ef0999986229cb9eb6dc60be0b1a2d88addd98516de8cf836b07044` |
| `doc/testing-historical-ids.json` | `77da339f84cfd7e6cc1779aa68681ba69000887af77af878e7f67a580070d7e6` |
| `doc/testing-manifest.json` | `0b81cf7feaab885ad4c93cb0fcdff95afe9540bdc7582d328beb9ecd522590ba` |
| `doc/testing-matrix.md` | `c9cb7d930a0b9bca045922c1671b20a05f4b4ea36b689a31169a7e913dae458d` |
| `doc/测试体系-总合同-2026-09-08.md` | `829988361fa60ae09e3db62f9d717ef15eef42deb9da830c045aa875b7cd954e` |
| `doc/诊断/CLAUDE.md` | `174ff4b038d0a21becd13cdaea3ae50a6a866b7a0c45216e9d168746bc843343` |
| `packages/agent-service/tests/CLAUDE.md` | `2fd37f07b6b42b6399668bd902d2eb0ebfe80f62ac70263cc9f96366eaf37094` |
| `packages/agent-service/tests/service/ct-f08-007.test.ts` | `1be8819e91afa4dea5b059c31b927798a90c6b93027d23d435edf216d874335d` |
| `packages/agent-service/tests/service/ct-f08-008.test.ts` | `eb6523b5c15213ef713baf04f8d28f7481c7d9f4ab7073c1bd1554240131dcca` |

aggregate = `9c965dd8998a9e11539adb5056e0e0d3fa95d72593b677501b423cbfdfb89602`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `22213b81178b8baf555fbfd6cca527a3c5dac9832ddaf1b29f54a45a8717df74`
