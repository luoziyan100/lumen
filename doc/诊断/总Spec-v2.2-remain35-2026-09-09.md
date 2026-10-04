# 总Spec v2.2 remain35 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain35-2026-09-09`。测试体系候选 `test-system-v1-gov-remain35-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain35-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain35-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain34-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F02-OWN-05 | covered | CT-F02-019：真实 `createService` 在生产 acquire/finish 完成路径上把 instance.lock 换成第三者 inode；完成失败且不接管；第三者 pid/inode 仍在；无 portfile。夹具 `create-service-swap-finish`，不直接 new 锁对象，不改 013 binding |
| F02-OWN-06 | covered | CT-F02-020：真实 `createService.start` 后 `handle.close` 释放换 inode，以及 publish 后打开失败走放弃，第三者锁留下；本实例不得删、不得接管。夹具 `create-service-swap-close`，不复述 019 的 finish |

## 实现要点

- 先写 CT-F02-019 / CT-F02-020。完成与放弃/释放都走生产 `createService`，夹具不绕过工厂。
- 现有 finish 核对路径所有权、放弃/释放 rename 到私有名再核 inode；换走则还回第三者。本批无生产 src 改动。
- CON-LOCK-SAME-INODE 保持原 covered，不升额外入口：发布/回收等全入口仍未由本批 createService 重新穷尽。CON-TRIPLE-RECLAIM 仍 partial。
- 未把 F01-DEC-01 / F13-REQ-07 / F02-OWN-01..04 / F02-OWN-07..12 / F17 已 covered 或禁止升的行再改。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

createService 完成路径换 inode 失败且不接管；放弃/释放换 inode 第三者锁留下。

## 建议打回点

- 只改 013 binding。
- 只测 lock 纯函数不经 createService。
- 升 OWN-07..12 或默认升 CON-LOCK-SAME-INODE。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain35-2026-09-09；已完成 F02-OWN-05 与 F02-OWN-06；CON-LOCK-SAME-INODE 不升额外入口；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain35 报告与业务 src/。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `2a8e3b03688cfc09faa254397c29a7c82b5b1008f643a9d403fe3029c88eb0e7` |
| `doc/testing-defects.md` | `151e96bc5a375353048d620171d03d0b6c52e5c267b9816ed8737beed681ade3` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `b3b88db8165a8e5a1b46ada4d89ed7d0112adbeb36951a4bdd687d514a8d4a73` |
| `doc/testing-matrix.md` | `861a5d38751b9450b1606ddda653d44f2956824747b3deff962a735062b44b91` |
| `doc/测试体系-总合同-2026-09-08.md` | `22a8fcfa8ddfecdebc23f2aa7256e14058555f809db30782c5e51326ad54be95` |
| `doc/诊断/CLAUDE.md` | `62c449192ca5d229b71d975504204c1f94799e20cb0bbd6ad8503cb1b90ad5c2` |
| `packages/agent-service/tests/CLAUDE.md` | `2d6709f3135cc4937df6de689df19d366c07ca1d39e44d6306f71be047681191` |
| `packages/agent-service/tests/helpers/CLAUDE.md` | `623bb51513d1c00eded478401f045729650e0aec5e06aecdd89c97b5a57cb874` |
| `packages/agent-service/tests/helpers/create-service-swap-close.ts` | `65f0f1c19cf2ed7fc5af06a715fde2a25c4330b8ecf398f28f49e0ed7956ba03` |
| `packages/agent-service/tests/helpers/create-service-swap-finish.ts` | `86f66fb84c06ff19fafb33da2e8f0efbe81dfdaa5f4029259c054116624b68c9` |
| `packages/agent-service/tests/service/ct-f02-013.test.ts` | `3a3ff50d9e5055f0d2fc8c0e7e89c84a243568d0e511424c89be6ceab4907aa3` |
| `packages/agent-service/tests/service/ct-f02-019.test.ts` | `deab4be0c1577add012e6c0e445bd8bea07be832c74408fb80601af631d51e4e` |
| `packages/agent-service/tests/service/ct-f02-020.test.ts` | `40012c7ae76680556676f7ad60edd7128c62f8dd180c4e12498b7311cf71c683` |
aggregate = `f263e6170234067c0a4dbcb86c83418c2d88989536e034dd854953587fa5b4cf`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `09750a5353eb23b8c25c84b479660cb6b250edb6281469bc4ca32e57daa6b115`
