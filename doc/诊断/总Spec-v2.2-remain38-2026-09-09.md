# 总Spec v2.2 remain38 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain38-2026-09-09`。测试体系候选 `test-system-v1-gov-remain38-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain38-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain38-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain37-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F11-BOT-01 | covered | CT-F11-007：先占端口；同进程 `createService({ port }).start()` 在 3s 内 Promise 拒绝（EADDRINUSE/listen）；失败者无 portfile、本进程锁已放；第二人经 `try-create-service` 的 `createService.start` 写出 portfile/SQLite 并能 hello。不是只改 round1 / ct-f03-006 binding，也不是只调 startServer |
| F11-BOT-02 | covered | 随 CT-F11-007 诚实钉死：生产 `createService.start` Promise 拒绝而非挂起，且与 WS/鉴权运行中连接错误分开。不是默认升 |
| F11-BOT-03 | covered | CT-F11-008：复用 `fail-portfile-rename`（已 import `createService`）；新文件新 ID；失败者仍活、`listen_released`、锁已放；第二人经 `try-create-service` 的 `createService.start` 写出 portfile/SQLite 并能 hello。不是只改 G14-04 binding，不是复述 007 端口占用，也不是 BOT-05 / 023 锁打开失败 |

## 实现要点

- 先写 CT-F11-007 / CT-F11-008。取得权走生产 `createService.start`。第二人走 `try-create-service`。
- 现有 listen 失败放锁、portfile rename 失败关监听的生产路径已够。本批无生产 src 改动。
- CON-LOCK-SAME-INODE 保持 covered，不升额外入口。CON-LOCK-SWAP / CON-TRIPLE-RECLAIM 仍 partial。不升 OWN-10 / BOT-04。
- 未把 F01-DEC-01 / F13-REQ-07 / F02-OWN-01..09 / OWN-11 / OWN-12 / F11-BOT-05 已 covered 或禁止升的行再改。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

端口占用时 createService.start 有限时间拒绝并放根；第二人写出 portfile/SQLite；portfile rename 失败后关监听放锁，失败者仍活，第二人 createService.start 写出。

## 建议打回点

- 只改 CT-F11-001 / CT-F11-003 / round1 / G14-04 / ct-f03-006 binding。
- 只测 startServer 不经 createService.start 来钉 BOT-01。
- 第二人只断言 handle.port > 0，没写出 portfile / SQLite / hello。
- 没证明失败者释放根。
- 升 OWN-10 / BOT-04 / CON-LOCK-SWAP / CON-LOCK-SAME-INODE / CON-TRIPLE-RECLAIM。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain38-2026-09-09；已完成 F11-BOT-01 / F11-BOT-03，并诚实升 F11-BOT-02；CON-LOCK-SAME-INODE / CON-LOCK-SWAP / SEC-SYMLINK-WRITE 不升；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain38 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `58783a2bf8adb97491ff52368a66a5c6648d89783fd631f05d8aaaba76d3e4ed` |
| `doc/testing-defects.md` | `5119b20d2a24040fab3d10e99a61d81212f311af77eee01cadf6e1ef5f60a069` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `f95b428807bd2687c51ca994f9b48a9406081aa0fdf4c46b409d37a2dc3cb49c` |
| `doc/testing-matrix.md` | `0d599a7dc35e54c9865450bd187274f119700274838f4383148fa40087910f8f` |
| `doc/测试体系-总合同-2026-09-08.md` | `8f1d8514d831e488233c4162a1c014dd62b7bdca6b203fdc515c018fa6fc8c10` |
| `doc/诊断/CLAUDE.md` | `0354a26bc1117c47c8db55c9afad417117d51b2c842f0852610f92500f64c8ea` |
| `packages/agent-service/tests/CLAUDE.md` | `88e479246b5fa30556a59ab8e0f616b90018f8d601720242d4228bd71da2a217` |
| `packages/agent-service/tests/service/ct-f11-007.test.ts` | `005a26ed6599117dd7a2d4450d4888cb0f46cf57e40754debcdb4eb873da196a` |
| `packages/agent-service/tests/service/ct-f11-008.test.ts` | `d4971532dae82bc8dfddb71eb21fadd6e7af8c723dc6d4541ef1d78d07955f27` |
aggregate = `3648cac7faf0cc5ec03c28f9fd4b3b7b03c84490b5aee3dc34ef664b04c3af27`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `14ed3a406fdb5a1ab28b8b33112e58e505b424fce588f3bf3cbfa411675bd33f`
