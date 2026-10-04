# 总Spec v2.2 partials 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-partials-2026-09-09`。测试体系候选 `test-system-v1-gov-partials-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-partials-2026-09-09
test_system_candidate_id: test-system-v1-gov-partials-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-keep-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F19-TOL-06 | covered | CT-F19-006：覆盖后旧 file_version 仍旧正文；诊断声明未跟踪网络/任意文件副作用 |
| F20-STO-02 | covered | CT-F20-008：对象 Authorization/apiKey/token/query 整值 redact；导出 originalComplete=false |
| F20-STO-07 | covered | CT-F20-006：流式/查询/导出/内存四条 EXEC_LIMITS 常量+运行时强制+大正文；未跑多小时会话 |
| F21-QRY-05 | covered | CT-F21-005：read_exec_record complete / 记录缺失 / 坏 blob 与权限失败；未改 UI |
| F24-RPL-09 | covered | RP-F24-010：get_bad_case 读 lastVerification 的 use/status/gaps，并带 problem/version |

## 实现要点

- `exec-limits.ts`：四条上限；StreamCollector / EvidenceMemoryQueue / capStreamCollect / capQueryContent。
- `redactSecrets`：对象键 Authorization/apiKey/token/query 整值 `[redacted]`。
- `readResult`：complete / missing / failed；完整性/权限读失败不得冒成 error 断连接。
- `get_bad_case`：查询入口消费 lastVerification；replay/live_eval 写 problem+version。
- 未改 UI / Rust；未 launchd:install 生产；未杀 PID 71847；未碰停放环境行；未 closed V2R。
- `agent-runtime.ts` 本批前已超过 800 行，本批只加只读导出字段，未再拆文件。

## 建议通过点

五条目标均有运行时强制与绑定测试；结构化脱敏与四条上限不是文档数字；get_bad_case 是查询消费者不是无主日志。

## 建议打回点

- F21「缺失」钉的是记录 id 不存在；已删除 blob 当前走 failed（完整性），若合同要 missing_blob 独立枚举可打回。
- 内存队列是进程单例，测试用相对 droppedCount，不是每 runtime 隔离队列。
- F20-STO-07 用合成大正文顶上限，不是多小时真实会话。
- SEC-DIAG-REDACT 升 covered 只证明结构化字段+originalComplete，不证明 F23 全包审计 accepted。
- 停放环境行仍 uncovered；不得外推 WebKit / 原生设置页 / 生产 launchd。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `50ce1e879903f75ee36a7021d8a172959afce2805a6505a557ccb44406ee9479` |
| `doc/诊断/CLAUDE.md` | `9bb46e9dd7f00b36ece1b3fb030520d79b2fa135ece307ef3328e33c00de460e` |
| `packages/agent-service/src/client/CLAUDE.md` | `849a266201c952e93105e837d388fc2b1ae6980f35094ed22a68de2075ddd4ee` |
| `packages/agent-service/src/protocol/CLAUDE.md` | `6e64f572cadef5dd0d804c1fbddf5604ffe52af39ad013146bc741a18cf9d0b9` |
| `packages/agent-service/src/runtime/CLAUDE.md` | `ecd57dafc3b703f1b0b432a07264ff96f43b3161ff92824273931ca4afdd4146` |
| `packages/agent-service/src/storage/CLAUDE.md` | `10fac462e9f328bba50351d4f1bd90e94964c8ba88d9dbd3a4e170a983abf116` |
| `packages/agent-service/tests/service/ct-f19-006.test.ts` | `151cdf77b0da21b7c3b36d5f1a76b7b5a0ba31e2b49f2b48bd673928f3f9e525` |
| `packages/agent-service/tests/service/ct-f20-006.test.ts` | `dad632257b69372fc543f1199d4ab707ccff2277ea679eccbc08c9aeff30dac2` |
| `packages/agent-service/tests/service/ct-f20-008.test.ts` | `5dd3c01b62d8e76de8956d6145bfbb9cafd513daa79d27aac4279fe291e3335e` |
| `packages/agent-service/tests/service/ct-f21-005.test.ts` | `02a698db14f644be5f20bfef42f466d7ab8d1262f57c28766f7e6670d4a54c3a` |
| `packages/agent-service/tests/service/rp-f24-010.test.ts` | `88d28cd18ace707991692901c5e44c982ece568342a397c5e770a3d4ce1eafd0` |

aggregate = `7af053d1aea46bf4c75cbdab2b95b5fab6b223ea58803cdbd3ab8922d4ae9e52`

算法：aggregate = SHA-256( concat(relpath + NUL + file_bytes) 按相对路径字典序 )。自身 hash 为第一个哈希分节标题之前的 UTF-8 字节。均不含业务 src，不含本报告。

## 报告自身哈希

去掉「## 报告自身哈希」之后的字节不计入自身 hash。

- 自身 hash: `bf624606624ccedb9cd9dff24bd233efda7b1bf9e98d6b5aff7a7efbfda16641`
- aggregate: `7af053d1aea46bf4c75cbdab2b95b5fab6b223ea58803cdbd3ab8922d4ae9e52`
