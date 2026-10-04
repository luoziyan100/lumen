# 总Spec v2.2 remain40 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain40-2026-09-09`。测试体系候选 `test-system-v1-gov-remain40-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain39-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain40-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain40-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain39-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F19-TOL-01 | covered | CT-F19-007：生产 `createService.start` + `submit`/`continueTask`；生产 `write_file` 写前 `existed=false`/`contentStatus=missing`；两次写后各有 after；覆盖后**旧** file_version 仍是第一版；磁盘已是第二版；`shared/` 写拒的 after=`missing`，不得标 complete 空文件。不是只改 `governance-f17-f21` / CT-F19-001 binding，也不是复述 CT-F19-006 |
| F19-TOL-02 | covered | CT-F19-008：生产 `createService.start` + `submit`；生产 `write_file`/`read_file` 走出超长结果；模型看见 persist 预览（无原文尾巴）；证据 `tool_result` 仍有原文尾巴；`persistPreview` 明确；预览不得被标成 `contentStatus=complete` 的原文。不是只改 V2R-06 binding，也不是只调 `withResultPersist`/`runAgent` |

## 实现要点

- 先写 CT-F19-007 / CT-F19-008。正常路径走生产 `createService` + `start` + 真实主循环。
- 现有 `wrapToolsForEvidence` / `withResultPersist` / `loop.recordToolResult(originalLlmContent)` 已够，本批不改业务 src。
- F19-TOL-03 不升：本批失败子句钉的是 `shared/` 写拒 after=missing，不把 V2R-12 的 after 缺失合同整行外推。
- 不升 TOL-04/05/06、OWN-10、CON-*、F01-DEC-01、F13-REQ-07。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

生产主循环写出写前不存在与两次写后版本；覆盖后旧 file_version 仍旧正文且磁盘已是第二版；写拒留下 after=missing；模型看见 persist 预览而证据仍能取到原文尾巴；预览有明确标记且不得冒充 complete 原文。

## 建议打回点

- 只改 CT-F19-001 / CT-F19-002 / f17-f21 / V2R-06 / V2R-12 binding。
- 只测 `runAgent` / `withResultPersist` 不经 `createService` 来钉 TOL-02。
- 旧 record 被改写成新正文。
- 把 persist 预览标成 `contentStatus=complete` 的原文。
- 默认升 F19-TOL-03 / TOL-04/05/06 / OWN-10 / CON-*。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain40-2026-09-09；已完成 F19-TOL-01 / F19-TOL-02；F19-TOL-03 不升；CON-LOCK-SAME-INODE / CON-LOCK-SWAP / SEC-SYMLINK-WRITE 不升；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：agent-service 709 pass / 0 fail / 2 skip；ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain40 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `a9b5ca2e188c3deffd685c21a61f3721cab2bd21e2049bc3f93f487e5298dd05` |
| `doc/testing-defects.md` | `06f830d795be49ecdb1fc3f349fea71687e07444a53c3728f0eee76797b48078` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `a78d28ecea9e32107eee72e9d1064f5c0c3de3c988307942ea865f60eab669d0` |
| `doc/testing-matrix.md` | `b882eee4752692143156d5998c44eac644598a9ee8aadda81164567a31b450d5` |
| `doc/测试体系-总合同-2026-09-08.md` | `af17ef10bfd028711020107339124448ce92d561e625073e4d6b5ee5b4cdac95` |
| `doc/诊断/CLAUDE.md` | `5110f3d066d0c218730a72ef087174cce2a86d9f3343682d628059a9c9bdfc84` |
| `packages/agent-service/tests/CLAUDE.md` | `2ae402ce0f622d5fea420d375ec7eb58ad06531beb9d463a672af8514e1e9653` |
| `packages/agent-service/tests/service/ct-f19-007.test.ts` | `e4ea52c454b0e34025d87e7cf805c3c72c7e17281ee9863c7698114bf74ac934` |
| `packages/agent-service/tests/service/ct-f19-008.test.ts` | `869349112e7f32fb95304323fc58171cb5212d7d41598ace7b1243ce51c78862` |
aggregate = `9624ff8d339f6e9eb0d91f9158a17d5ba9c10d0ff3d238f9bc27e4e794346511`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `432e9ab6185aad752373a057e5f207456f539195401a4c1ce13898742886bd97`
