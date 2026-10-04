# 总Spec v2.2 remain34 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain34-2026-09-09`。测试体系候选 `test-system-v1-gov-remain34-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain34-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain34-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain33-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F02-OWN-03 | covered | CT-F02-017：进程 A 写下死 pid 后 `pause-then-reclaim-lock` 进入过期观察；进程 B 经 `try-create-service`（生产 `createService.start`）取得新锁并写出 portfile/SQLite；A 随后回收 `denied`，B 的 inode/pid 仍在。另钉 `publish-pause-finish-lock` 发布后 `pause-then-reclaim-lock` 交叉不得删已发布锁。不把 CON-TRIPLE-RECLAIM 标 covered |
| F02-OWN-04 | covered | CT-F02-018：活持有者已由 `createService.start` 写出 lock + portfile + SQLite；过期观察与 `try-acquire-lock` 不得抢；inode/pid/portfile/SQLite 不变。SIGKILL 该子进程（断言 pid ≠ 71847）后，新 `createService.start` 才能取得 |

## 实现要点

- 先写 CT-F02-017 / CT-F02-018。取得权走生产 `createService`/`start`，夹具 `try-create-service` / `pause-then-reclaim-lock` / `publish-pause-finish-lock` / `try-acquire-lock` 不绕过工厂。
- 现有 `unlinkIfSameHolder` 是安全占位、回收不按路径删；活持有者握 `O_EXLOCK` 时过期观察打不开。本批无生产 src 改动。
- CON-TRIPLE-RECLAIM 保持 partial：combo 映射仍是 F02-OWN-02 / CT-F02-002；017 钉的是 OWN-03 三进程过期观察与 publish/reclaim 交叉，不是 combo 定义的整窗（双持、同时回收、第三人抢）。不对齐则不升。
- 未把 F01-DEC-01 / F13-REQ-07 / F02-OWN-01 / F02-OWN-02 / F02-OWN-05..12 / F17 已 covered 或禁止升的行再改。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

死锁回收后第三者新锁不被过期观察删掉；发布窗口内回收不得删已发布锁；活持有者写入后过期观察抢不走，SIGKILL 后才能被新实例取得。

## 建议打回点

- 只改 round1/round4 binding。
- 只复述 016 的「活着时 denied」。
- 升 OWN-05..12 或默认升 CON-TRIPLE-RECLAIM。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain34-2026-09-09；已完成 F02-OWN-03 与 F02-OWN-04；CON-TRIPLE-RECLAIM 仍 partial；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain34 报告与业务 src/。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `a65d0e0e7c11b2282eae1d1ed806dd81bbfc3e75119606921a3d35e927ab064a` |
| `doc/testing-defects.md` | `481677fc340299b4402cdce0d151615139812d0acde924f0cc64cfe29a3b9b51` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `0eb551ef305075a71b73482c789bff73e1484c0c715e709c62e1bf2d550b4ec1` |
| `doc/testing-matrix.md` | `546c365bc7a43f98c58024b5ee9f28fd06a6da1b2367c9396f347b1f9952f9ee` |
| `doc/测试体系-总合同-2026-09-08.md` | `a1d288ce64fd5b624e418597de84f4296de82aba9092f201bcdb6d3041298ca6` |
| `doc/诊断/CLAUDE.md` | `89f633809e75884c9fa45073805f8ffda2523281865cdc5a90d21d80531587bb` |
| `packages/agent-service/tests/CLAUDE.md` | `eab94ae08944c4362a55975abd55eb17b99adafd1d94073dd844d1591563cfdd` |
| `packages/agent-service/tests/helpers/CLAUDE.md` | `d7a0e370d1f04dc93db5a7d467a50a8c4d0e51095eabaa399b6329eb5770bb83` |
| `packages/agent-service/tests/helpers/pause-then-reclaim-lock.ts` | `fa1c4bda6654264821e73c5f199734511537d2b9d74fe2c6fd7218c42a67a9fe` |
| `packages/agent-service/tests/helpers/publish-pause-finish-lock.ts` | `3b7a6896b0ef73ee8dc6fd45249961338d6a3d25ace970b167b4fc339e86bb80` |
| `packages/agent-service/tests/helpers/try-acquire-lock.ts` | `7afd6ad415ac3577849f6c7e4e6c3474104c2390cf815a653108d73a8edf7123` |
| `packages/agent-service/tests/helpers/try-create-service.ts` | `16b3d07021bf66ddbb4403a7de582a6dc37aa52914e253cddba01fecb3ad5656` |
| `packages/agent-service/tests/service/ct-f02-015.test.ts` | `2dc43c41f9524ae67ed7d53ec1227cf04c96279d6b2f530af9fb534386d94564` |
| `packages/agent-service/tests/service/ct-f02-016.test.ts` | `f901781ed0f6f977b6971a5b16a850297882eea6fcc29267a3f25bce1a005cf9` |
| `packages/agent-service/tests/service/ct-f02-017.test.ts` | `c4a2fe99b82b50461ab1dbbc1be5880200db6d8d763833846c423e722b4ba03b` |
| `packages/agent-service/tests/service/ct-f02-018.test.ts` | `6bb8aa054ea7fd8f256a73b3289fc34854e27f778a5a88f5bea6b345125adeaa` |
aggregate = `6fed19b0ef121d337010206ccd0ae59116ec845b21a6bf71e0a7259a6743afc5`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。


## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `650add7337219dc9de2117e3f89170f06c90c298111c490dc157b4f155a8ca49`
