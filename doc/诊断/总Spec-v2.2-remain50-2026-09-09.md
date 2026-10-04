# 总Spec v2.2 remain50 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain50-2026-09-09`。测试体系候选 `test-system-v1-gov-remain50-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain49-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain50-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain50-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain49-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F21-QRY-02 | covered | CT-F21-007：生产 `createService` + `start` + 真实 WS。先用正确 token 跑 ScriptedModel + `withIgnoredTitleChats` 任务，确认 `list_exec_records` 非空。快照 exec 文件树、`exec_records` 行数、空 destDir。错 token / 无 token WS：`list_exec_records`、`read_exec_record`、`export_exec_pack` 均 4401，不得 hello，不得把证据写进 destDir。之后 exec 树与行数不变，destDir 仍空。对照正确 token `list_exec_records` 仍成功。不是复述 CT-F01-018/021，不是只改 CT-F21-001 / f17-f21 binding。`process.pid !== 71847` |
| F21-QRY-03 | covered | CT-F21-008：生产 `createService` + 真实 write_file 落带 hash 的证据。第一次导出 destA：manifest 列出 operationId，对应文件不得 missing。unlink 该 sha256 blob。第二次导出全新 destB：同一 operation 必须标 missing；destB 可离开工作区打开 manifest。destA 不得被第二次改写。不是复述 CT-F20-010。不升 F23-PKG-05 / PER-BLOB-EXPORT / F21-QRY-06。`process.pid !== 71847` |

## 实现要点

- 先写 CT-F21-007 / CT-F21-008。取得权走生产 `createService` + `start`。
- 现有 WS 鉴权（握手即 4401、不推 hello）+ export missing 已够；本批不改业务 src。
- 不升 F13-REQ-07、DEC-01、OWN-10、CON-*、F23-PKG-05、PER-BLOB-EXPORT、F21-QRY-06。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。未修 CT-F16-012 / AT-F16-001。

## 建议通过点

正确 token 先落非空 exec 证据；错/无 token 三查询均 4401 且无 hello；destDir 空；exec 树与行数不变；对照正确 token list 仍成功。destA 完整导出列出 operation 且文件不 missing；删 blob 后 destB 同 operation 标 missing；destA 不被第二次改写。

## 建议打回点

- 只改 CT-F21-001 / CT-F21-002 / f17-f21 / CT-F21-006 binding。
- 空库上错 token 4401 当 QRY-02，没有先落真实证据。
- 只测一次缺文件导出，没有 destA 完整对照。
- 错 token 连接仍 hello，或把证据写进 destDir。
- 第二次导出改写 destA。
- 默认升 DEC-01 / REQ-07 / OWN-10 / CON-* / F23-PKG-05 / PER-BLOB-EXPORT / F21-QRY-06。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain50-2026-09-09；已完成 F21-QRY-02 / F21-QRY-03；不升 F13-REQ-07 / F01-DEC-01 与 F20 整簇；CON-REQID / ID-STALE-CONN 不升；不升 F23-PKG-05 / PER-BLOB-EXPORT / F21-QRY-06；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：本批 ct-f21-007 / ct-f21-008 / ct-f21-006 / ct-f20-010 4 pass。agent-service 全量 730 pass / 0 fail / 2 skip（AT-F16-001 / CT-F16-012 本轮整包绿；整包偶发闪红本批禁止修）。ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain50 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。不含本报告。算法段只写名为 报告自身哈希 的二级标题。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `900528709b480c89f14bf88b0000fee08c4b6e37f85b06807534da37b091b801` |
| `doc/testing-defects.md` | `ba415f972c2d6bf31876b2280e824d31a1cee1f4e9d81d343a5a48faf26b5602` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `05a84375ba48f384eba509be0fb06443253ab2eec76ea039b9f0059adba82b42` |
| `doc/testing-matrix.md` | `e9346d30031a3f6d48f7ec2454a0c932822a2ad54e0bf8eaddc2b6292542f123` |
| `doc/测试体系-总合同-2026-09-08.md` | `633c514558ee5ab2066c7b074e05f27babc817594c67e02b0553b230dda26f8f` |
| `doc/诊断/CLAUDE.md` | `cc60cbed405f788786b82210e70cd451914b520fbcc9ca02de1f6f4210c89ec2` |
| `packages/agent-service/tests/CLAUDE.md` | `792397790024f9e3ba5be9046adcfbb4093aeda830487563a9e31d26e8141841` |
| `packages/agent-service/tests/service/ct-f21-007.test.ts` | `406942a0b74fccbb3856b858ce8bb51e9c6c2a451ade39a2deed583c712854d8` |
| `packages/agent-service/tests/service/ct-f21-008.test.ts` | `5db4cb94a118a60a2796a37b007f90d1380d042e5684b8be67f0b2ac0a6253f2` |
aggregate = `ec576f1b752acbbff73994326ee911b2961b7a8dfb2ed64d1811dc15cba9fbd6`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。
## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `6d1f20f278da84d61983cbefeb802a715279dd084918c6d8c9758ea2bf88c37d`
