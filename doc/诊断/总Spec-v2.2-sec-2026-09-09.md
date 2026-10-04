# 总Spec v2.2 sec 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-sec-2026-09-09`。测试体系候选 `test-system-v1-gov-sec-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-sec-2026-09-09
test_system_candidate_id: test-system-v1-gov-sec-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-closable-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F06-SEC-01 | covered | CT-F06-007：默认凭证根与自定义 lumenHome 同时存在；策略含两根路径；Darwin 真实 sandbox-exec 读任一根 READ_BLOCKED |
| F20-STO-05 | covered | CT-F20-009：策略含 evidence realpath（软链拉开给定名）与对该路径的 write deny；Darwin sandbox-exec 写 evidence WRITE_BLOCKED。不因 AT-F20-001 外推 |
| F01-DEC-01 | partial | CT-F01-013：未知 type + 非字符串/重复 requestId 走真实 WS，error 后无新 task、无 upload，随后 list 仍可用。仍缺截断帧、settings·exec 写入等全矩阵。禁止标 covered |
| F13-REQ-07 | partial | 未改。禁止标 covered |

## 实现要点

- 三条回归先写后跑，现实现已满足，未改业务 src / UI / Rust。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。
- F01-DEC-01 只再切未知 type 与非法 requestId，不把全矩阵吹成 covered。

## 建议通过点

自定义根不撤销默认根：策略同时含两根，Darwin 读任一根被拒。F20-STO-05 点名 evidence realpath 与 write deny，且 Darwin 写拒成立。

## 建议打回点

- F01-DEC-01 仍缺截断帧、settings·exec 写入全矩阵。
- F13-REQ-07 仍缺其余异步 type 的逐条超时。
- 停放环境行仍 uncovered；不得外推 WebKit / 原生设置页 / 生产 launchd。
- 非 Darwin 宿主上 F06-SEC-01 / F20-STO-05 的 sandbox-exec 会 skip，不得把 skip 记 covered。

人话状态：正在第 governance-impl-sec-2026-09-09；已完成 F06-SEC-01 两根读拒、F20-STO-05 realpath 写拒；F01-DEC-01 与 F13-REQ-07 仍 partial。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。


## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `5462ee7642e9e6c822af1bb7576cf8595c5a2ba89a94cc8d3e677f1918d26485` |
| `doc/诊断/CLAUDE.md` | `0579531ce14dd4426915789413cc95f882800ea033b0eba370582a9ab428cb41` |
| `packages/agent-service/tests/CLAUDE.md` | `b245af381f34535def2673c52626dac9783645a5e40136142d799ad86b5fdf8f` |
| `packages/agent-service/tests/service/ct-f01-013.test.ts` | `5e30cb4352f093d4463409cf4242cc88c30fe84812e47ed6106eb9debe49563e` |
| `packages/agent-service/tests/service/ct-f06-007.test.ts` | `6f828410d714632148c5e43a76913ac5336d074af15387fd5a0fa3c5c4746168` |
| `packages/agent-service/tests/service/ct-f20-009.test.ts` | `aeb6ca3db05f373a776993df2c6856917f67d0b39a69bca86322a9b1f5a587ff` |

aggregate = `ec1de7831a4990da2b905da8b85ed1ccb7964f80e7ee18f3ff3197ddbcd43705`

算法：aggregate = SHA-256( concat(relpath + NUL + file_bytes) 按相对路径字典序 )。自身 hash = 第一个名为 报告自身哈希 的二级标题之前的 UTF-8 字节。不含本报告。均不含业务 src。

## 报告自身哈希

去掉「## 报告自身哈希」
自身 hash: `e74f0773e42dc4ef6b5c1e2f4f90acce4d0af47820081716f2a9a59cb0f75f44`
