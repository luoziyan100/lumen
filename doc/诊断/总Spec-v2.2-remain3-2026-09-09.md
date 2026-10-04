# 总Spec v2.2 remain3 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain3-2026-09-09`。测试体系候选 `test-system-v1-gov-remain3-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain3-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain3-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain2-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F06-SEC-03 | covered | CT-F06-009：自定义 lumenHome 写入 agent-service.json；策略含给定路径与 realpath；Darwin 真实 sandbox-exec 读拒且不得读出正文。非 Darwin skip 不得记 covered |
| F16-HAN-01 | covered | CT-F16-008：parseLaunchctlPrint 区分 running / 崩溃 / 缺失；本地 HTTP 端口可连但 print 缺失时 ownedByJob=false、decideInstallAction≠already、不得「已开启常驻」。未碰生产 label / PID 71847 |
| F01-DEC-01 | partial | CT-F01-015：向真实 WS 发送非法 update_settings 与非法 export_exec_pack（缺字段/坏形状），error 后 settings 不改、无新 exec blob/task/upload，随后合法 list 仍结算。仍缺 set_model / create_project / mark_bad_case 等其余写入口。禁止标 covered |

## 实现要点

- 三条回归先写后跑，现实现已满足，未改业务 src / UI / Rust。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未碰 F16-HAN-05/06。
- F06-SEC-03 必须有本行自己的 test_id，Darwin 真跑过才 covered。
- F16-HAN-01 不是只扫字符串：本地 HTTP 可连 + print 缺失走判定函数。
- F01-DEC-01 / F13-REQ-07 禁止标 covered。未把 continue 私有 request 超时吹成公开 API。

## 建议通过点

自定义 lumenHome 的 agent-service.json 进策略且 Darwin sandbox-exec 读拒、正文不泄漏。端口能连但 launchctl print 缺失时不得判已托管/已开启。非法 settings/exec 写入不改盘、不建 task/blob/upload。

## 建议打回点

- F01-DEC-01 仍缺 set_model / create_project / mark_bad_case 等其余写入口全矩阵。
- F13-REQ-07 仍缺其余异步 type 的逐条超时。
- 停放环境行仍 uncovered；不得外推 WebKit / 原生设置页 / 生产 launchd。
- 非 Darwin 宿主上 F06-SEC-03 的 sandbox-exec 会 skip，不得把 skip 记 covered。

人话状态：正在第 governance-impl-remain3-2026-09-09；已完成 F06-SEC-03 自定义 lumenHome 凭证读拒与 F16-HAN-01 端口可连≠托管；F01-DEC-01 与 F13-REQ-07 仍 partial。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `c211fa4b0cce578b054c625eb505f2cee4427a734c3bbf86881c29a6c80bdaf4` |
| `doc/诊断/CLAUDE.md` | `2671cb469441131d33d21ed6796778a0299b3c9e8df022e55a2750e81ad8f9a5` |
| `packages/agent-service/tests/CLAUDE.md` | `993efdbf2ba4b4e1343456a64c8b00f51c729a9f453ffe2618a66bed614a5254` |
| `packages/agent-service/tests/service/ct-f01-015.test.ts` | `4195f81f2e4cd6f2c6b8333de34719a3c9497ae66552a36e58fa987001ca1ce5` |
| `packages/agent-service/tests/service/ct-f06-009.test.ts` | `5b897fbd9cc8a61ed4efed6981e6f67f97f98516b75091cbf6ea84580f3d9782` |
| `packages/agent-service/tests/service/ct-f16-008.test.ts` | `788f694538a528599108e945f2e2eb2c3ed9a56bb3cd6db778b1c811f81def08` |

aggregate = `2fb68d8ea315f2908119de76486bfb857b7416a7abf7e695ee7c53f37e93a5b4`

算法：aggregate = SHA-256( concat(relpath + NUL + file_bytes) 按相对路径字典序 )。自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。均不含业务 src。

## 报告自身哈希

去掉「## 报告自身哈希」
自身 hash: `a0041180b653f80a4fd687a8a6636a66d884ec6e04b5325344d9c6b2f9fe77d2`
