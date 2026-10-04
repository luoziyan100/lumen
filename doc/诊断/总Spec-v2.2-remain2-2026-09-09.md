# 总Spec v2.2 remain2 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain2-2026-09-09`。测试体系候选 `test-system-v1-gov-remain2-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain2-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain2-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-sec-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F06-SEC-02 | covered | CT-F06-008：默认根与自定义根各有 .env；Darwin 真实 sandbox-exec 读两份均 READ_BLOCKED，不得读出正文。非 Darwin skip 不得记 covered |
| F13-REQ-07 | partial | CT-F13-009：submit / continue 注入 requestTimeoutMs=400，墙钟 ≤3s，超时拒绝带同一 requestId。已钉 list / get_settings / list_projects / submit / continue；其余异步 type 仍缺。禁止标 covered |
| F01-DEC-01 | partial | CT-F01-014：向真实 WS 发送截断/半帧（合法 UTF-8、非完整 JSON），服务不杀，无新 task、无 upload，随后合法 list 仍结算。仍缺 settings·exec 写入全矩阵。禁止标 covered |

## 实现要点

- 三条回归先写后跑，现实现已满足，未改业务 src / UI / Rust。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未碰 F16-HAN-05。
- F06-SEC-02 必须有本行自己的 test_id，不把 CT-F06-007 外推为本行。
- F01-DEC-01 / F13-REQ-07 禁止标 covered。

## 建议通过点

Seatbelt 拒读两根 .env：默认根与自定义根同时存在，Darwin sandbox-exec 读两份被拒且正文不泄漏。submit/continue 短超时带回同一 requestId。截断帧不杀服务、不写 task/upload。

## 建议打回点

- F01-DEC-01 仍缺 settings·exec 写入全矩阵。
- F13-REQ-07 仍缺其余异步 type 的逐条超时。
- 停放环境行仍 uncovered；不得外推 WebKit / 原生设置页 / 生产 launchd。
- 非 Darwin 宿主上 F06-SEC-02 的 sandbox-exec 会 skip，不得把 skip 记 covered。

人话状态：正在第 governance-impl-remain2-2026-09-09；已完成 F06-SEC-02 两根 .env 读拒；F01-DEC-01 与 F13-REQ-07 仍 partial。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `c311f3389eb3ba743f77bd52ef3d8376d3c4e6255e8f68791eb6820770ce647f` |
| `doc/诊断/CLAUDE.md` | `2b9ac9d2d2b68364b4e7288b8b16de4780a8f9c968f57b5430cd247cc22d1db1` |
| `packages/agent-service/tests/CLAUDE.md` | `910f18ad122d378efbf709bec5c86ff4769a33fd39c10922c17b15ffaae165ee` |
| `packages/agent-service/tests/service/ct-f01-014.test.ts` | `903060ba3030e8cfcbfce03a7a9e0c8bdb52c920bca5643691deb387495c886c` |
| `packages/agent-service/tests/service/ct-f06-008.test.ts` | `4356abece6f9828c4c17abf7dd49fc3fc6ec4d1b17e97748c7d25f1a6a2ffb43` |
| `packages/agent-service/tests/service/ct-f13-009.test.ts` | `dd52cba66bfa171484f2598021aa580b2c6365ad181a79b83098b17b7380e273` |

aggregate = `87a41ab9949496b99c53cc4451044e7860c126ae1e1adf9c4a46570a4937aa10`

算法：aggregate = SHA-256( concat(relpath + NUL + file_bytes) 按相对路径字典序 )。自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。均不含业务 src。

## 报告自身哈希

去掉「## 报告自身哈希」
自身 hash: `2bab3b4ff868d1f6be5f56941670f31261bbe808fedf333385931fff95345936`
