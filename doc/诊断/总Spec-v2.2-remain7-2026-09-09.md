# 总Spec v2.2 remain7 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain7-2026-09-09`。测试体系候选 `test-system-v1-gov-remain7-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain7-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain7-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain6-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F16-HAN-07 | covered | CT-F16-013：隔离 HOME + 假 `launchctl` 走真实 `installLaunchAgent`。wait 超时对本测试 label `bootout`；冲突 `bootout` 且不 `kickstart`；意图仍为开。未碰生产 label / PID 71847 / 不 `launchd:install` |
| F03-DRN-07 | covered | CT-F03-008：真实 `createService` 跑过至少一轮后 `handle.close()`；旧 runtime `submit`/`continue` 失败；listener 不再收到该任务新 event；`appendEvent` 成功次数不增。shutdown 成功后封 `EventHub` |
| F13-REQ-07 | partial | 本批未再切超时。禁止标 covered |
| F01-DEC-01 | partial | 本批未再磨写入口。禁止标 covered |

## 实现要点

- 先写 CT-F16-013 / CT-F03-008，再注入 `LUMEN_LAUNCHCTL` / `LUMEN_LAUNCHD_WAIT_MS`，并把 `EventHub.close()` 接到成功 shutdown。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未碰 F16-HAN-05/06/09。
- F16-HAN-07 不是只扫旧字符串：真实 `installLaunchAgent` + 假可执行文件记录 bootout/kickstart。
- F03-DRN-07 不是只关服务：断言 listener 与落库在 close 返回后不再增加。

## 建议通过点

隔离 HOME 下 wait 失败必须对本测试 label bootout，冲突 bootout 且不 kickstart，意图不得改为关。close 返回后旧执行不得再写 event、listener 不得再收到该任务新 event。

## 建议打回点

- 只复述旧 V2R-10 源码字符串，或假 launchctl 未进真实 `installLaunchAgent`。
- 只关服务不断言事件。
- 把 F13-REQ-07 / F01-DEC-01 标 covered。
- 真的 launchd:install / 动生产 label / PID 71847。
- 停放环境行仍 uncovered。

人话状态：正在第 governance-impl-remain7-2026-09-09；已完成 F16-HAN-07 真实 install 失败/冲突 bootout，以及 F03-DRN-07 close 后无旧执行发事件；F13-REQ-07 与 F01-DEC-01 仍 partial。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `abe1915124895ccd89cac688b323b8767810cf4ec80f35c0af7bb1772614b436` |
| `doc/诊断/CLAUDE.md` | `3b6ec941b796760c5db5f24e85d714ae7d8c0f96d8f3e6b0ddfa285a07746bb5` |
| `packages/agent-service/CLAUDE.md` | `5905adf446fba1c7c76ab7d99280967cc039cb2196cdd8963df6a338dca8a607` |
| `packages/agent-service/src/runtime/CLAUDE.md` | `919f230570b4cced419675d0ed4e398f3e4f485584cb60c5a273157fe299341d` |
| `packages/agent-service/tests/CLAUDE.md` | `1cfb1c245e74d15c641526496a00d5065f9d6ecff35bee7ab3c2387f29e7aa7a` |
| `packages/agent-service/tests/service/ct-f03-008.test.ts` | `7c216a8aa50d0911665a69273c53087f00d8d6a389163fbfe4a14a3276c48b1e` |
| `packages/agent-service/tests/service/ct-f16-013.test.ts` | `145fcfd5d835ebd7ca4228c25e5a5214036a6ca5f5a9208ac70ab96d8fe6715e` |

aggregate = `bc8a3b1431148bd45c4698794002b747dd925415349ea32f271781b5482c567a`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希

去掉「## 报告自身哈希」
自身 hash: `1771c8fe904d7e2a3c147b3ddab5431ded600e1e82f7a3fa22206e7285dbf630`
