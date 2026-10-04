# 总Spec v2.2 gaps 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-gaps-2026-09-09`。测试体系候选 `test-system-v1-gov-gaps-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-gaps-2026-09-09
test_system_candidate_id: test-system-v1-gov-gaps-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-split-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F02-OWN-11 | covered | CT-F02-014：进程 A 持真实 instance.lock，进程 B 调 unlinkIfSameHolder 得 false，inode/PID 不变，第三者 denied |
| F01-PRE-01 | covered | CT-F01-011：非 Upgrade 残握手 + GET 非根路径后，合法 Upgrade+token 的 list 仍结算 |
| F13-REQ-03 | covered | CT-F13-008：get_settings/list_projects 短超时与断线带回同一 requestId；旧连接不得占新 id |
| F13-REQ-07 | partial | CT-F13-007 全 type 非法+list 超时；CT-F13-008 只加 get_settings/list_projects。禁止标 covered |

## 实现要点

- `unlinkIfSameHolder` 仍是安全占位恒 false；本批只补真实 FS 竞态，不按路径删。
- decoder 前错误走裸 TCP 残握手；服务进程不杀，随后 list 带回同一 requestId。
- `LumenClient` 增加 `requestTimeoutMs` 与 `getSettings`；超时/断线拒绝带同一 requestId。未改 UI/Rust。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未把 F13-REQ-07 标 covered。

## 建议通过点

真实第二进程对活持有者调用 unlinkIfSameHolder；残握手后仍能 list；短超时墙钟 ≤3s 且 requestId 对齐。

## 建议打回点

- F13-REQ-07 仍缺其余异步 type 的逐条超时。
- F01-PRE-01 未再穷尽截断 WS 帧与全部非法 request-target。
- 停放环境行仍 uncovered；不得外推 WebKit / 原生设置页 / 生产 launchd。

人话状态：正在第 governance-impl-gaps-2026-09-09；已完成 F02-OWN-11 真实 FS 竞态、F01-PRE-01 decoder 前残握手、F13-REQ-03 短超时切片；F13-REQ-07 仍 partial。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。


## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `0c0fe5c9d21cb2f6ae1b5f8d9aa96b445a261747aefc3d63ca23341bfa9eb1f0` |
| `doc/诊断/CLAUDE.md` | `5353fe9fd599c4d280d1735df1cfd9ae64d886a179c448324ddd7d26709f978b` |
| `packages/agent-service/src/client/CLAUDE.md` | `88d053f7e08f17fe4d601b5ed436f9e3be3c208adefbb5df3d84fe364bec5057` |
| `packages/agent-service/tests/CLAUDE.md` | `7c2596b92a2acb9f54d3040278915a3e45a68581da164db7956dc14e69369555` |
| `packages/agent-service/tests/helpers/CLAUDE.md` | `4850a415a859ffbb06fe2e4ec1730b17f2458baf76f8991babbf990cd0678148` |
| `packages/agent-service/tests/helpers/unlink-same-holder.ts` | `d7533f87ce4caec98818060b8e81a1d5c5d76c366d98c75b05f974ee1b73a442` |
| `packages/agent-service/tests/service/ct-f01-011.test.ts` | `d0028c37e21dd2df8b95ec9534f1b22cb8d2d564144b465c43494ab613a60e63` |
| `packages/agent-service/tests/service/ct-f02-014.test.ts` | `bc2fc8f194670399b57edb305974fc113adf7b58a9aea5180a78a04bd7273f54` |
| `packages/agent-service/tests/service/ct-f13-008.test.ts` | `ea0647d101c256294ad62c21a5bab2028fb18d48acccf8704ed57c8b0bf2ac52` |

aggregate = `8a4ff2972b2db23f8ec2f78d3c759eff47aa9d956d93036c5366869e6bc43d33`

算法：aggregate = SHA-256( concat(relpath + NUL + file_bytes) 按相对路径字典序 )。自身 hash 为第一个哈希分节标题之前的 UTF-8 字节。均不含业务 src，不含本报告。
## 报告自身哈希

去掉「## 报告自身哈希」之后的字节不计入自身 hash。

- 自身 hash: `08bb82c38b1ca3c42bbe1be75eff9bb50c3a6ba7692abb0c75044e1ce9f15e96`
- aggregate: `8a4ff2972b2db23f8ec2f78d3c759eff47aa9d956d93036c5366869e6bc43d33`
