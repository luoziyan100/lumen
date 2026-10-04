# 总Spec v2.2 remain44 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain44-2026-09-09`。测试体系候选 `test-system-v1-gov-remain44-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain43-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain44-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain44-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain43-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F13-REQ-04 | covered | CT-F13-013：生产 `createService.start` 起活服务；探针 `LumenClient.connect`+`list` 证明端口可连；另一未 connect 的 `LumenClient` 打 `list` / `listProjects`，Promise 在 400ms 内拒绝且语义为未连接/无 socket，不是超时、不是业务 error；随后同一 client `connect` 后 `list` 成功。不是 R09 死端口 9，不是只改 CT-F13-004 binding |
| F13-REQ-05 | covered | CT-F13-014：生产 `createService.start` + `LumenClient.connect` + `create_project` 建两项目；生产 `create_task` 各一条；`Promise.all` 两条 `list` 只含本项目任务；原始 WS 并发 list 各带回自己的 requestId 且不串项目；随后再各 list 一次仍不串。不是 batch3 手组 `startServer`，不是只改 CT-F13-005 binding。不升 CON-REQID |

## 实现要点

- 先写 CT-F13-013 / CT-F13-014。取得权走生产 `createService` + `start` + 真实 WS / `LumenClient`。
- 现有 client `send()` 未连接立即抛「未连接到 agent-service」；server `reply(requestId)` 按 id 回 tasks 且 `listTasks(projectId)` 不串项目。本批不改业务 src。
- 不升 F13-REQ-06/07、DEC-01、AUTH、F14、F20、OWN-10、CON-*。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

活服务在时未连接 list/listProjects 有限时间拒绝未连接，connect 后同一 client 的 list 成功；两项目并发 list 各归其 requestId 且不串项目，随后再 list 仍不串。

## 建议打回点

- 只改 CT-F13-004 / 005 / R09 / batch3 binding。
- 只测死端口 9 / 只手组 `startServer` 不经 `createService`。
- 未连接挂起，或拒绝语义是超时/业务 error。
- 并发仍串项目或 requestId。
- 默认升 REQ-06/07 / DEC-01 / AUTH / F14 / F20 / OWN-10 / CON-*。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain44-2026-09-09；已完成 F13-REQ-04 / F13-REQ-05；不升 F13-REQ-06/07 与 F20 整簇；CON-REQID / ID-STALE-CONN 不升；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：本批 ct-f13-013/014/011/012 5 pass。agent-service 全量 716 pass / 2 fail / 2 skip（AT-F16-001 隔离重跑绿；CT-F16-012 一例整包闪红，隔离重跑绿；本批禁止修）。ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain44 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `43da71f8db9904ede7b03bf206905acde5c99843bb325095458670bcc0822005` |
| `doc/testing-defects.md` | `6c6c579e65cb68abd48c4f978c52e64e43bc021d48b8301e9df8be1ee2628203` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `e343280a3fd73e1d8404fcd3531c2bbb06d30ab04caa17d9079ea5017e00f354` |
| `doc/testing-matrix.md` | `c2370760e5787a064369147935d8809c669b46df91d982608c7effcd58359d4f` |
| `doc/测试体系-总合同-2026-09-08.md` | `091a56afe36ca323e7ff20658f9822ed6c744fa6c068fda3fbf408797c6be092` |
| `doc/诊断/CLAUDE.md` | `20f89dcb1af98f2e0aeb70deca479b469fbea9523d74a1425bec01ec792813ce` |
| `packages/agent-service/tests/CLAUDE.md` | `8bcd73d1aa7f2e326016bd7f980d41f01f657535e7c3872b1b908c4d361cf510` |
| `packages/agent-service/tests/service/ct-f13-013.test.ts` | `a9334c40e59eaac98698434539a7f2f0810045c17b2990c846e34b294f8ef26e` |
| `packages/agent-service/tests/service/ct-f13-014.test.ts` | `807d2b2bfcaee4ba9e50ecc852a29b0a0928707acd8a573b3882113e0a95152a` |
aggregate = `c6d3d492b1d8f11b272be73e52df90335f3eddfeeb6e592b2b9a04ebedda1760`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `4dcc4c3d6fd973c022f1fa8ec9be4492cc50aab4ead1edeeddc0adde034916d8`
