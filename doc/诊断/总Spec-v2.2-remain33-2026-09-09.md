# 总Spec v2.2 remain33 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain33-2026-09-09`。测试体系候选 `test-system-v1-gov-remain33-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain33-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain33-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain32-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F02-OWN-01 | covered | CT-F02-015：同一 temp home；先 `createService`+`start`；第二份 `createService`+`start`（同进程 throws + 第二进程 `try-create-service`）在写入前失败；lock / portfile / SQLite inode 不得双写；第一份 `close` 后再开第三份成功 |
| F02-OWN-02 | covered | CT-F02-016：损坏 pid 与死 pid `999999` 经生产 `createService.start` 回收；`hold-instance-lock` 活持有者在时第三者 `try-create-service` 不得抢、不得写 portfile/SQLite；回收后旧观察 `try-acquire-lock` 不得删新锁。不把 F02-OWN-03 标 covered |

## 实现要点

- 先写 CT-F02-015 / CT-F02-016。取得权走生产 `createService`/`start`，夹具 `try-create-service` 不绕过工厂。
- 现有 `createService` 在组装前 `acquireInstanceLock`，第二实例在打开 SQLite / 写 portfile 前失败。本批无生产 src 改动。
- 未把 F01-DEC-01 / F13-REQ-07 / F02-OWN-03..12 / F17 已 covered 或禁止升的行再改。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

两份 createService 不得双写；dispose 后再开成功；死 pid 可回收；活持有者不得被抢。

## 建议打回点

- 只改 batch2 binding。
- 只测 lock 纯函数不经 createService。
- 升 OWN-03。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain33-2026-09-09；已完成 F02-OWN-01 与 F02-OWN-02；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `2375b5190c418ebea42dd52dbfe69c895f55488efcaf909bfa2cf0acaf380a46` |
| `doc/testing-defects.md` | `d650b19bec774dc6cf55779aa1d033b91d98f41cc01fbd15df071526d249486c` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `4323a8a3899ad4a89d47a0a7acabd17b1bcea01fef3ce1c7b74ae6600e405118` |
| `doc/testing-matrix.md` | `7a14537142dbe30b7777ed14cc0a542dff383836aac45f18fff3116553e37384` |
| `doc/测试体系-总合同-2026-09-08.md` | `b81b938dd17d7041524d4d791205550a2e3f77487cd4e6aa8fe3cd0eb0a980aa` |
| `doc/诊断/CLAUDE.md` | `1438bc38a7846866b22a86ea268171e20a5f9d1e8b9dedc4e2f7fdb4e2702ced` |
| `packages/agent-service/tests/CLAUDE.md` | `db917300ed8c5eb87ea3ef7ef1ee1a37a0829e110c11b4348374e5b67e4c1da6` |
| `packages/agent-service/tests/helpers/CLAUDE.md` | `d7a0e370d1f04dc93db5a7d467a50a8c4d0e51095eabaa399b6329eb5770bb83` |
| `packages/agent-service/tests/helpers/try-create-service.ts` | `16b3d07021bf66ddbb4403a7de582a6dc37aa52914e253cddba01fecb3ad5656` |
| `packages/agent-service/tests/service/ct-f02-015.test.ts` | `2dc43c41f9524ae67ed7d53ec1227cf04c96279d6b2f530af9fb534386d94564` |
| `packages/agent-service/tests/service/ct-f02-016.test.ts` | `f901781ed0f6f977b6971a5b16a850297882eea6fcc29267a3f25bce1a005cf9` |
aggregate = `fc8bcfc3259b19fe32573d568acea10fc28e2e57fdd72a4835ffaccf171c17d1`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `0c53ba4e3c75f758b91e27de2bec65964ed03cf791ce8073b7990410c0179817`
