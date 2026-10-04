# 总Spec v2.2 remain36 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain36-2026-09-09`。测试体系候选 `test-system-v1-gov-remain36-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain36-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain36-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain35-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F02-OWN-07 | covered | CT-F02-021：真实 `createService` 遇数据根 `instance.lock` 已是根外软链时失败；根外字节不变；无 portfile；本进程 PID 不写外文件。组合「发布后换成软链」走生产 acquire/finish，夹具 `create-service-swap-symlink`，完成/取得失败且不接管。不直接 new 锁对象，不改 007/round10/12 binding |
| F02-OWN-08 | covered | CT-F02-022：根外文件先写已知内容，再 `link` 成数据根 `instance.lock`；真实 `createService` 失败；根外原文不变；本进程 PID 不得落上该 inode；无 portfile。不是复述 021 软链，也不是只改 008/round13 binding |

## 实现要点

- 先写 CT-F02-021 / CT-F02-022。取得权走生产 `createService`（工厂里 `acquireInstanceLock(home)`），夹具不绕过工厂。
- 现有锁已有 `O_NOFOLLOW` / `rejectSymlink` / `rejectSharedInode(nlink≠1)`。本批无生产 src 改动。
- CON-LOCK-SAME-INODE 保持 covered，不升额外入口。CON-LOCK-SWAP / CON-TRIPLE-RECLAIM 仍 partial。SEC-SYMLINK-WRITE 保持 covered（仍 CT-F02-007 + CT-F06-005）。
- 未把 F01-DEC-01 / F13-REQ-07 / F02-OWN-01..06 / F02-OWN-09..12 / F17 已 covered 或禁止升的行再改。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

createService 遇根外软链失败且不写外文件；发布后换成软链完成/取得失败且不接管；硬链出根失败且外文件原文不变。

## 建议打回点

- 只改 007/008 / round10/12/13 binding。
- 只测 lock 纯函数不经 createService。
- 软链测到了硬链没到 createService，或复述 019 换 inode。
- 升 OWN-09..12、CON-LOCK-SWAP、SEC-SYMLINK-WRITE、CON-LOCK-SAME-INODE、CON-TRIPLE-RECLAIM。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain36-2026-09-09；已完成 F02-OWN-07 与 F02-OWN-08；CON-LOCK-SAME-INODE / CON-LOCK-SWAP / SEC-SYMLINK-WRITE 不升；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain36 报告与业务 src/。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `67d5da2d2600e5a54c1c392d358614b63caae9acf6ce7e5f21c84cfaa4cf4b86` |
| `doc/testing-defects.md` | `d5f23d59e9a072acc72728ef522ca69a099f04c6bb35a4959ea8cbb3304389bd` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `29bffde88893cae3a6113be268af701138fb177a533be5ee1ed2120e38501e87` |
| `doc/testing-matrix.md` | `242aaabbbe5133151b06fad73e065fd21400dc6f58adc5b545d009d51add13f7` |
| `doc/测试体系-总合同-2026-09-08.md` | `5bd86ab912f36769c7c66c3d792e44a4624e7bee214cc29951432a85028a576c` |
| `doc/诊断/CLAUDE.md` | `e0d21bc31f503a88d1d88e2bab8f7899b05364c4dbe8439a2eb477dc225907d9` |
| `packages/agent-service/tests/CLAUDE.md` | `16f03ce470b802553ace3d64f8de0c15e4eca2b405f86dd890d152c916ee592e` |
| `packages/agent-service/tests/helpers/CLAUDE.md` | `e02d38dd1754da6529a1413731999fd01a18f6d0485f1cb65cef3d4b066a27ca` |
| `packages/agent-service/tests/helpers/create-service-swap-symlink.ts` | `9b60c7650881b6e6ca9fa6f630da627948ccdedf2d99728940ade9f0a17db54f` |
| `packages/agent-service/tests/service/ct-f02-021.test.ts` | `ff8d79c18408f1bc80126a698e5536a94c4245e0096886f3c011e1aeed7d4f03` |
| `packages/agent-service/tests/service/ct-f02-022.test.ts` | `764dc542a1b7a6dcdfb0947632bd1091276d2340f6562867a8ca0d75c17a3a7b` |
aggregate = `0a4bc481da6094e62fe79f556a2ee43e1c7b0e0325951b1246d3bf51df66a66b`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `1dd2db395ac48490c4ee1a52d96bda11c18140cba25bca62671c6b1588319355`
