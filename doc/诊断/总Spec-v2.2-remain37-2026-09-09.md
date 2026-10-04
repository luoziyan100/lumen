# 总Spec v2.2 remain37 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain37-2026-09-09`。测试体系候选 `test-system-v1-gov-remain37-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain37-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain37-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain36-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F02-OWN-09 | covered | CT-F02-023：子进程真实 `createService`，PID 落地后 link 钩子 chmod 0 使下一次打开失败；失败者仍活；路径不得留其 PID；第二人经 `try-create-service` 的 `createService.start` 取得根并写 portfile/SQLite。不直接调 `acquireInstanceLock`，不是复述 013/016/018 |
| F02-OWN-12 | covered | CT-F02-024：同进程发布后第一次打开成功、下一次打开 chmod 0；`createService` 失败；路径不留本进程 PID；进程仍活；同进程第二次 `createService.start` 取得并写出。不是 023 跨进程第二人，也不是 013 回收不得删活锁 |
| F11-BOT-05 | covered | 随 CT-F02-023 诚实钉死：失败者 `createService` 仍活时，第二份 `createService.start` 取得根并写出。不升 BOT-01..04 |

## 实现要点

- 先写 CT-F02-023 / CT-F02-024。取得权走生产 `createService`（工厂里 `acquireInstanceLock(home)`）。023 夹具 `create-service-fail-next-open` import `createService`，不调 `acquireInstanceLock`。
- 现有 `finishPublishedLock` 打开失败与 `acquireInstanceLock` 非外身份错误已 `abandonUnheldPublication`。本批无生产 src 改动。
- CON-LOCK-SAME-INODE 保持 covered，不升额外入口。CON-LOCK-SWAP / CON-TRIPLE-RECLAIM 仍 partial。SEC-SYMLINK-WRITE 保持 covered（仍 CT-F02-007 + CT-F06-005）。
- 未把 F01-DEC-01 / F13-REQ-07 / F02-OWN-01..08 / F17 已 covered 或禁止升的行再改。未升 OWN-10 / OWN-11。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

失败者 createService 仍活且路径不留其 PID；第二份 createService.start 取得根并写出；同进程打不开刚发布锁失败且不留 PID。

## 建议打回点

- 只改 009/012/013 / round11/12 binding。
- 只测 lock 纯函数不经 createService。
- 第二人只调 acquireInstanceLock。
- 把 023 改名当 024，或 024 只复述跨进程第二人。
- 升 OWN-10 / OWN-11 / CON-LOCK-SWAP / CON-LOCK-SAME-INODE / CON-TRIPLE-RECLAIM / BOT-01..04。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain37-2026-09-09；已完成 F02-OWN-09 / F02-OWN-12，并诚实升 F11-BOT-05；CON-LOCK-SAME-INODE / CON-LOCK-SWAP / SEC-SYMLINK-WRITE 不升；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain37 报告与业务 src/。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `8bb7982b732d19e52ba865ef0e3409cfda3d1a1ff71cb000577f4973ecbf1f07` |
| `doc/testing-defects.md` | `4be87bce61adf3f0b6b869489e02f6a63058b1614e0edaa8a062b2994028467d` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `e8c0231019dfacd93da13cf90e58212a32c85ea294b1be292e49a4e2343c68ef` |
| `doc/testing-matrix.md` | `509d15c4ba4ece5f2ddab6dd908aadd9b45104e1bdcac51dce9073594fd53e76` |
| `doc/测试体系-总合同-2026-09-08.md` | `891a2a28ffe441f0071bdad2bbe6835675e1602759a28029723b579a4017abc9` |
| `doc/诊断/CLAUDE.md` | `f4ea0b85b249042081e2d7d69a0fd7bbfe3c9e6756db8ccde83d06ccc78d46c7` |
| `packages/agent-service/tests/CLAUDE.md` | `475efd9d666a7797c153c7695cdf13fc59ed5c834d59b06a1d492346ce0b44f4` |
| `packages/agent-service/tests/helpers/CLAUDE.md` | `31605088e861ad370191aae4ede6e4e341a2ae18e3fd5fed83905b79482b8dee` |
| `packages/agent-service/tests/helpers/create-service-fail-next-open.ts` | `6dba04b9fe00efb39b991ab9a0eb7dd11e00b27a482eaef9db291b1d4318ddb2` |
| `packages/agent-service/tests/service/ct-f02-023.test.ts` | `d580428b536a5e24d0f6ae1fc8def976ddb2ce319aaee8dbbc3547de1d82c703` |
| `packages/agent-service/tests/service/ct-f02-024.test.ts` | `f8b46bfe3e5488c8b25229b36c283fd1fbb532e80ced4134645cf40118aa1a68` |
aggregate = `9ad2b828ebef5f7e44c7d262194d6cf9b836e409558c410908c74afe3e9a13c2`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `06e97c9ec82fd2e094865ec64a3a65dbb9d7e17134d14b664f9ac9d194ad6de1`
