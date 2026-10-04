# 总Spec v2.2 remain48 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain48-2026-09-09`。测试体系候选 `test-system-v1-gov-remain48-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain47-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain48-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain48-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain47-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F01-AUTH-02 | covered | CT-F01-019：生产 `createService({ token: '' })` + `start`。生成后 `service.token.length > 0` 且 `!== ''`。WS 无 token / `?token=` 空查询均 4401，不得 hello。HTTP `POST /upload` 无 token / 空 token 均 401，数据根无新 upload。对照：生成后的非空 token 空 Origin `POST /upload` 不得 401。不是复述 CT-F01-018，不是只改 CT-F01-005 / batch1 binding。不升 HTTP-01 / DEC-02 |
| F01-CONN-01 | covered | CT-F01-020：生产 `createService` + `start` + 真实 WS。同连接吞 hello → 非法帧 `null` → 合法形状但失败的 rename 空 title → 合法 `list` 带回同一 requestId 的 `tasks`。第二根新连接合法 `list` 成功。`process.pid !== 71847`，handle 仍可 close。不是只改 CT-F01-006 / batch1 binding。不升 DEC-01 / DEC-02 |

## 实现要点

- 先写 CT-F01-019 / CT-F01-020。取得权走生产 `createService` + `start`。
- 现有 `resolveServiceToken` 空串换非空、decode/handler 错误回 error 已够；本批不改业务 src。
- 不升 F13-REQ-07、DEC-01、HTTP-01、DEC-02、OWN-10、CON-*、SEC-ORIGIN-TOKEN。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。未修 CT-F16-012 / AT-F16-001。

## 建议通过点

显式空 token 被换成非空；无/空凭证 WS 4401 无 hello；无/空 token POST /upload 401 且无新文件；生成 token 空 Origin upload 不得 401。非法帧与 handler 失败后同连接 list 可用；第二根新连接 list 成功；本测进程仍活、handle 可 close。

## 建议打回点

- 只改 CT-F01-005 / CT-F01-006 / batch1 binding。
- AUTH-02 只测握手不测写入口。
- 空 token 真关了鉴权，或对照 token 也 401。
- 非法帧后服务死，或只测握手没有第二根连接。
- 默认升 HTTP-01 / DEC-01 / DEC-02 / REQ-07 / OWN-10 / CON-* / SEC-ORIGIN-TOKEN。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain48-2026-09-09；已完成 F01-AUTH-02 / F01-CONN-01；不升 F13-REQ-07 / F01-DEC-01 / HTTP-01 / DEC-02 与 F20 整簇；CON-REQID / ID-STALE-CONN 不升；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：本批 ct-f01-019 / ct-f01-020 / ct-f01-018 / ct-f14-009 4 pass。agent-service 全量 726 pass / 0 fail / 2 skip（AT-F16-001 / CT-F16-012 本轮整包绿；整包偶发闪红本批禁止修）。ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain48 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。不含本报告。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `eef2c62676f9e1b461c833dca987cb223cdc607214796414afeda20cc97e9a32` |
| `doc/testing-defects.md` | `53dba4379ba43a041a9276c764fe99820837bdf04680cd38dd2869f356601abc` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `3e08328d746c87b6802379522a14bb894b44e0808eb1c3a6b7d125961660f1e4` |
| `doc/testing-matrix.md` | `06bc7b2830079a09547d9c8eaa777daab95f4f2f43b485f0c52be49f855e2e04` |
| `doc/测试体系-总合同-2026-09-08.md` | `07bf0d343087c362dd7a7b939644093e55ddf1cde9d41c73b78bdb480bc68cc9` |
| `doc/诊断/CLAUDE.md` | `a65c2ff2fd66a302f91e96d366a5521b18da21cb76d89923bd5d1d240a8d3889` |
| `packages/agent-service/tests/CLAUDE.md` | `6a1d37c1890f451b875fcc9274eed1f36654229ba168a446693780a8da8c08e9` |
| `packages/agent-service/tests/service/ct-f01-018.test.ts` | `b0cf609fb88d0f174ab84efe662ecc38a45527ccaf542a924550494eaf9339f5` |
| `packages/agent-service/tests/service/ct-f01-019.test.ts` | `968a2df7409de98ec57cbecb238bcdeaff28d23ab4261cbb9b0940120e1fc1a6` |
| `packages/agent-service/tests/service/ct-f01-020.test.ts` | `a09e02b62f5de7561d8916c5b47daab8629cb271c326e9c42a953ba7e200aec8` |
| `packages/agent-service/tests/service/ct-f14-009.test.ts` | `0e3de252d091902066b76300f8bfddcb1ddb147bb79df5196f66dd8f04791d31` |
aggregate = `e95dabb20e6c620151e5d748de7e39d9b23a76ba216b061f1490c5f51ac7c8b1`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `72d93d9eb80e72c7eda4d837d7994af6541d31638603548cb85eedf9de589d6c`
