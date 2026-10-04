# 总Spec v2.2 remain43 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain43-2026-09-09`。测试体系候选 `test-system-v1-gov-remain43-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain42-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain43-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain43-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain42-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F13-REQ-01 | covered | CT-F13-011：生产 `createService.start` + 真实 WS；submit / create_project / update_settings 合法 requestId + 字段在但类型错；每条 `error.requestId` 等于发出的 id；随后合法 `list` 带回自己的 id；无新 task / project / settings 改写 / upload 文件。不是 decode 单测，不是 007 缺字段循环，不是只改 CT-F13-001 / round1 binding |
| F13-REQ-02 | covered | CT-F13-012：生产 `createService.start` + 真实 WS；对象 / 空串 / 数字 requestId 的 error 不得带伪造 id；随后合法 `list` 带回自己的 id。不是 decode 单测，不是只改 CT-F13-002 / round1 binding |

## 实现要点

- 先写 CT-F13-011 / CT-F13-012。取得权走生产 `createService` + `start` + 真实 WS。
- 现有 decode + server `reply(decoded.requestId)`：合法 id 形状失败带回同一 id；非法 requestId 不写入字段。本批不改业务 src。
- 不升 F13-REQ-04/05/06/07、DEC-01、AUTH、F14、F20、OWN-10、CON-*。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

写业务 type 字段在但类型错时，error 仍带回同一合法 requestId，且无 task/project/settings/upload 副作用；requestId 本身为对象/空串/数字时 error 不伪造关联，随后合法 list 仍可用。

## 建议打回点

- 只改 CT-F13-001 / 002 / 007 / round1 binding。
- 只测 `decodeClientMessage` 不经 `createService` + 真实 WS。
- 把 007 改名当 011。
- error 仍伪造 id，或非法形状进了 handler。
- 默认升 REQ-04/05/06/07 / DEC-01 / AUTH / F14 / F20 / OWN-10 / CON-*。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain43-2026-09-09；已完成 F13-REQ-01 / F13-REQ-02；不升 F13-REQ-04/05/06/07 与 F20 整簇；CON-REQID / ID-STALE-CONN 不升；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：本批 ct-f13-011/012/007/008 8 pass。agent-service 全量 713 pass / 3 fail / 2 skip（AT-F16-001 隔离重跑绿；CT-F16-012 本批禁止修）。ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain43 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `35d1feff1611c93d4f05d78eaff65f12c8f6412e4b510fd27aa9d4c1e25b94dc` |
| `doc/testing-defects.md` | `174113d6539e2a103884c4dbb47ac5665aaf692bc04ec02c51f4ff1347836aca` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `7cab1e70124fbb4f74327d1ca931637d2c537773faeebbe4d775f112c72c1168` |
| `doc/testing-matrix.md` | `4b39f82f3414766244bfba9c4caa61fcd5e470e88c76444c46b6de5a252964f5` |
| `doc/测试体系-总合同-2026-09-08.md` | `b76f7350066cded09d04a9061318b415b5c49a35692e936d44d1f294e1a25e6b` |
| `doc/诊断/CLAUDE.md` | `2be5a5af2d397fb1106a6bbd6467df1517f4b72e5e1b3f76d4aca66194b5138d` |
| `packages/agent-service/tests/CLAUDE.md` | `73c1d658a031e5f0f4343d60c9e842a61e5d4639adf7fb2b54441e9f4fac3c8f` |
| `packages/agent-service/tests/service/ct-f13-011.test.ts` | `5be91f581a0fe3aadf355fe74265c1cade98fe080575ebdf2d5e1ea2ca01055b` |
| `packages/agent-service/tests/service/ct-f13-012.test.ts` | `16eb9ba553f18844a4bff5b2f3eab34b7e9e57572680882ed6c22656794057a1` |
aggregate = `a16528e5e63e032467f3011e3c04b90d81457197f7b543300040837b5a662264`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `ee1af4631e39f97fae2d9d8056b1259c9b2897b97976b6b174ddbe3277d61356`
