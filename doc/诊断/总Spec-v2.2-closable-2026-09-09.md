# 总Spec v2.2 closable 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-closable-2026-09-09`。测试体系候选 `test-system-v1-gov-closable-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-closable-2026-09-09
test_system_candidate_id: test-system-v1-gov-closable-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-gaps-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F21-QRY-01 | covered | CT-F21-006：真实 createService+token WS；list/read/export_exec_pack 合法形状带回同一 requestId；缺字段/错 type error 同 id，不写新 blob、不改任务；随后 list 仍结算 |
| F24-RPL-01 | covered | CT-F24-011：历史查看不 spawn turn 且不调 ModelPort；continue 开新 turn 并进循环；recorded_replay 的 use 不是 continue 且 liveModel=0；live_eval 调 liveModel 且 use 可分 |
| F01-DEC-01 | partial | CT-F01-012：null/数组/缺 type/坏 JSON 后磁盘无新 upload、SQLite 无新 task、随后 list 可用。仍缺未知 type、截断帧、非法 requestId、settings/exec 写入等全矩阵。禁止标 covered |
| F13-REQ-07 | partial | 未改。禁止标 covered |

## 实现要点

- 三条回归先写后跑，现实现已满足，未改业务 src / UI / Rust。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。
- F01-DEC-01 只钉四种 decode 拒帧的请求级副作用，不把全矩阵吹成 covered。

## 建议通过点

真实 WS 查询三入口 requestId 对齐；非法查询不写 blob；四身份在同一服务上可分（历史只读、continue 进循环、replay 不调模型、live_eval 显式打模型）。

## 建议打回点

- F01-DEC-01 仍缺未知 type / 截断帧 / 非法 requestId / settings·exec 写入全矩阵。
- F13-REQ-07 仍缺其余异步 type 的逐条超时。
- 停放环境行仍 uncovered；不得外推 WebKit / 原生设置页 / 生产 launchd。

人话状态：正在第 governance-impl-closable-2026-09-09；已完成 F21-QRY-01 真实 WS 查询形状、F24-RPL-01 四身份服务路径；F01-DEC-01 与 F13-REQ-07 仍 partial。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。


## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `c52b8196622a17035f296bbd605045420b36f3ddfc5d689e6061ff2084af9063` |
| `doc/诊断/CLAUDE.md` | `19fe1e9b8fda9546ec4f4f8f888b0d74237302d8a767267baab6bcfd749cbdea` |
| `packages/agent-service/tests/CLAUDE.md` | `86bafe75665fa454ee28c16011a6c9eec670abc410cfa049fa8d84ca60d38d58` |
| `packages/agent-service/tests/service/ct-f01-012.test.ts` | `a8848bfaae8d34f36cd03486b510842d1baf91e51c4aa6e810b61321ae8b7404` |
| `packages/agent-service/tests/service/ct-f21-006.test.ts` | `b000127d9330f164f72b905f65397aca8ce8e38fbeac71a5a6b07ec2f59b3e58` |
| `packages/agent-service/tests/service/ct-f24-011.test.ts` | `c9f13af085b2b61601102a9b3765674e1bf43f19ce0d2c663b94d262ce7205f5` |

aggregate = `d71a2d3d3668c4409a02569dbcca3f2f12d834cc6874aa5899c5932dd74b9992`

算法：aggregate = SHA-256( concat(relpath + NUL + file_bytes) 按相对路径字典序 )。自身 hash 为去掉「## 报告自身哈希」标题及之后字节；本文件不含该标题，故为「自身 hash:」行之前的 UTF-8。均不含业务 src，不含本报告。
自身 hash: `093a849b71f28f38de2aaa7ca3971119ca8323a78197a0229f66cbf548a36090`
