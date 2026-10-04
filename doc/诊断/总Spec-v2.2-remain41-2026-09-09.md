# 总Spec v2.2 remain41 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain41-2026-09-09`。测试体系候选 `test-system-v1-gov-remain41-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain40-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain41-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain41-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain40-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F19-TOL-03 | covered | CT-F19-009：生产 `createService.start` + `submit`；生产 `edit_file` 改**不存在**的 `notes/gone-f19-009.md`；after `contentStatus=missing`、`existed=false`；不得 `complete`；`readExecRecord` 不得用空串冒充完整 after 正文；磁盘仍 ENOENT。不是只改 V2R-12 binding，不是复述 CT-F19-007 的 `shared/` 写拒 |
| F20-STO-01 | covered | CT-F20-010：生产 `createService.start` + `submit`；主循环写出带 `contentSha256` 的 file_version；改 blob 后经 `listExecRecords` / `readExecRecord` / `exportExecPack` 不得 complete/present；须 `hash_mismatch` / `mismatch` / `failed`。不是只改 V2R-02 binding，不是手插 `ExecStore.insert` |

## 实现要点

- 先写 CT-F19-009 / CT-F20-010。正常路径走生产 `createService` + `start` + 真实主循环。
- 现有 `wrapToolsForEvidence` after 读盘失败标 missing、`ExecStore` list/read/export 核 hash 已够，本批不改业务 src。
- 不升 F20-STO-03 / F20-STO-04：本批没有另钉 failed 落盘正文或内容目录不可写的 `createService` 路径。
- 不升 TOL-01/02/04/05/06、OWN-10、CON-*、F01-DEC-01、F13-REQ-07。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

生产主循环 `edit_file` 改不存在文件后 after 为 missing 且 existed=false，不得 complete 空文件；主循环先写出带 sha 的证据，改 blob 后生产查询/导出不得再标 complete/present，须 mismatch/failed。

## 建议打回点

- 只改 CT-F19-003 / CT-F20-001 / V2R-12 / V2R-02 binding。
- 只测 `wrapToolsForEvidence` / 手插 `ExecStore.insert` 不经 `createService`。
- 把 007 的 shared 写拒改名当 009。
- after 仍标 complete 空文件。
- 默认升 F20-STO-03 / F20-STO-04 / TOL-01/02/04/05/06 / OWN-10 / CON-*。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain41-2026-09-09；已完成 F19-TOL-03 / F20-STO-01；不升 F20-STO-03 / F20-STO-04；CON-LOCK-SAME-INODE / CON-LOCK-SWAP / SEC-SYMLINK-WRITE 不升；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：agent-service 711 pass / 0 fail / 2 skip；ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain41 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `489ed91b25628ddba5ee6e718d535d86bfb72a15ddab4f7f33489e6ea96155dc` |
| `doc/testing-defects.md` | `6f1deea5866d57dd2d53ad2fc8bc34df212beb596208023551e41d0ba73344ad` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `c47c78b54038179956068b1eb2c0f75e922390b6d4d44e5e9d9eb378a759d919` |
| `doc/testing-matrix.md` | `2dc5b5042bdbb38959940fab5e9e08c50b4d3a199d4e9dd0d61d5d9fd10e20a9` |
| `doc/测试体系-总合同-2026-09-08.md` | `98bbf2d93f383d5fd751a4c7b2cb6c79cef2ba0f638170d5063ddf786c19ab9c` |
| `doc/诊断/CLAUDE.md` | `96c1a2e1e7815b49aeb9f1236c4dc8925bfe980b78af7881cdaf5b4abdccaa3f` |
| `packages/agent-service/tests/CLAUDE.md` | `98e46701ef41dcd3b62911a86aa318036d7fce36cf41c0e02a23ae486d89d263` |
| `packages/agent-service/tests/service/ct-f19-009.test.ts` | `b84f0b91b053ab88ec3d6a3831ae1ca3e5b490c49712a8c871afc31f2604765c` |
| `packages/agent-service/tests/service/ct-f20-010.test.ts` | `aa6662c33f55215f0e2c341cb52e45c72860a9e34199310f9e89e6e925c244d7` |
aggregate = `01ee6e1d9c0ee75c357a717305eb40cfbaabcba75c4103312f9eda02a48170fc`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `20ac3c93670d22befc406c582d9a9ee30a89f002355d8bf5077048afc8bc83a1`
