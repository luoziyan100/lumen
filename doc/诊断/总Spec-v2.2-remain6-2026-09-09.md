# 总Spec v2.2 remain6 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain6-2026-09-09`。测试体系候选 `test-system-v1-gov-remain6-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain6-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain6-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain5-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F16-HAN-08 | covered | CT-F16-012：隔离 temp home 拉起真实 `service.ts` 入口，SIGTERM 走 `handle.close`（portfile 与 `instance.lock` 释放、exit 0）；重复信号不并发关；`installSignalHandlers` 注入 80ms，挂起 close 时非 0 退出。未碰生产 label / PID 71847 / 不 install / 不 bootout |
| F13-REQ-07 | partial | CT-F13-010：公开 API `createProject` / `listSkills` 注入 `requestTimeoutMs` 400ms，墙钟 ≤3s，超时拒绝带同一 requestId。已钉 list / get_settings / list_projects / submit / continue / create_project / list_skills。仍缺其余异步 type 逐条超时。禁止标 covered |
| F01-DEC-01 | partial | 本批未再磨写入口。仍缺 uninstall_skill / activate_skill / archive_task / rename_task / pin_task 及诊断回放写入口等其余写入口。禁止标 covered |

## 实现要点

- 先写 CT-F16-012 / CT-F13-010，再抽出 `installSignalHandlers` 与 `LUMEN_SHUTDOWN_TIMEOUT_MS`，listening 日志改到挂信号之后。
- 未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行、未碰 F16-HAN-05/06/09。
- F16-HAN-08 不是只扫旧 f16 字符串：真实入口子进程 SIGTERM → handle.close。
- F13-REQ-07 走公开 `createProject` / `listSkills`，不用私有 `request()` 包装。禁止标 covered。

## 建议通过点

隔离 temp home 真实入口收到 SIGTERM 必须走 handle.close（锁与 portfile 释放、exit 0），重复信号不并发关；短超时非 0。createProject / listSkills 短超时带回同一 requestId。

## 建议打回点

- 只复述旧 createShutdownGuard unit，或未拉真实入口。
- 把 F13-REQ-07 / F01-DEC-01 标 covered。
- 真的 launchd:install / 动生产 label / PID 71847。
- 其余异步 type 仍缺逐条超时；停放环境行仍 uncovered。

人话状态：正在第 governance-impl-remain6-2026-09-09；已完成 F16-HAN-08 真实入口 SIGTERM 走 handle.close；F13-REQ-07 与 F01-DEC-01 仍 partial。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `99abe2272d5ba301e216d95dffce41df2781d0ef221996884a28633bcba549f7` |
| `doc/诊断/CLAUDE.md` | `2d7c0ad2080fd2968b403aafe8f59f74302041dbd6e15731bbb5442969999d05` |
| `packages/agent-service/CLAUDE.md` | `a56cf12f6271131ec65e6b0c62b04eb6211c16952b83f619973a8e5e0047709f` |
| `packages/agent-service/tests/CLAUDE.md` | `ba35ee50b4963f62ceef3112be2bf635a4bb48f916112fb611def01ef87fee50` |
| `packages/agent-service/tests/helpers/CLAUDE.md` | `6a763f0a4426ac3153f7f7259bfeb956b57d1f114e2d96790cf54141778b726c` |
| `packages/agent-service/tests/helpers/hang-close-entry.ts` | `d2d67a665d3210051c8f73efb605312ec6d2490c43482f309c42adf5f62e7891` |
| `packages/agent-service/tests/service/ct-f13-010.test.ts` | `8308fa3fe784a5e9194300eb8c5de3968ed8f4a4c61c4f0b7de6baa5da989ecc` |
| `packages/agent-service/tests/service/ct-f16-012.test.ts` | `4d43eef2d1c15d5889474f5de259e9cb45da828252f68579049dccc93f34c8f8` |

aggregate = `ae40fe72aba3e93df3afe9f8391b0a711fd711f14b19d9a12acd4e3689eae60d`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希

去掉「## 报告自身哈希」
自身 hash: `6bd51be735031938d801e93c263ea6b008cd8e064cd6147d4578993c7a2de81a`
