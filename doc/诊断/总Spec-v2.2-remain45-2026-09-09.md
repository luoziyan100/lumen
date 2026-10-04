# 总Spec v2.2 remain45 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain45-2026-09-09`。测试体系候选 `test-system-v1-gov-remain45-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain44-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain45-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain45-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain44-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F13-REQ-06 | covered | CT-F13-015：生产 `createService.start` 起活服务；`LumenClient` 连这个真服务。先 connect + list 挂起结算，再 `connect()` 换代（旧 socket 不关）。新连接再 list，新旧 requestId 不同。向旧 WebSocket `dispatchEvent` 注入迟到 `error` / `ok` / `tasks`（requestId 等于新 list）。新 list 不得被旧帧结算；之后真服务在新 socket 上的合法 tasks 才结算。不是 round14-d / round14-conn 假服，不是只改 CT-F13-006 binding。不升 ID-STALE-CONN / CON-REQID / REQ-07 |
| F14-ORI-01 | covered | CT-F14-006：生产 `createService.start`。HTTP 空 Origin 与 `http://127.0.0.1:…` / `http://localhost:…` 不得 403；`https://evil.example` 必须 403；CORS 不得是 `*`。WS 本机 Origin 收到 hello；外站 Origin 关闭码 4403。不是只调 `isAllowedOrigin`，不是只改 CT-F14-001 / round15 binding。不升 ORI-02/03/04 / SEC-ORIGIN-TOKEN |

## 实现要点

- 先写 CT-F13-015 / CT-F14-006。取得权走生产 `createService` + `start`。
- `LumenClient.connect` 换代不 close 旧 socket，守卫 `this.ws !== ws || this.connGen !== gen` 已够；`isAllowedOrigin` + server Origin 检查已够。本批不改业务 src。
- 不升 F13-REQ-07、DEC-01、AUTH、F14-ORI-02/03/04、F20、OWN-10、CON-*、SEC-ORIGIN-TOKEN。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

真服务上旧 socket 迟到 error/ok/tasks 不得结算新 list，新旧 requestId 独立，真服务新 socket 合法 tasks 才结算；HTTP/WS 两入口本机与空 Origin 放行、外站 403/4403，CORS 非 *。

## 建议打回点

- 只改 CT-F13-006 / CT-F14-001 / round14-d / round15 binding。
- 只测假 WebSocketServer / 只测 `isAllowedOrigin`。
- 旧帧仍结算新 id，或只能假服对齐。
- HTTP 本机/空 Origin 仍 403，或 CORS 为 `*`，或 WS 外站不是 4403。
- 默认升 REQ-07 / DEC-01 / AUTH / ORI-02/03/04 / OWN-10 / CON-* / SEC-ORIGIN-TOKEN。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain45-2026-09-09；已完成 F13-REQ-06 / F14-ORI-01；不升 F13-REQ-07 / F14-ORI-02/03/04 与 F20 整簇；CON-REQID / ID-STALE-CONN 不升；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：本批 ct-f13-015 / ct-f14-006 / ct-f13-013 / ct-f13-014 4 pass。agent-service 全量 718 pass / 2 fail / 2 skip（AT-F16-001 隔离重跑绿；CT-F16-012 一例整包闪红，隔离重跑绿；本批禁止修）。ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain45 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `08a02bda8e464a86fb7c76fba20fcdcd2f8bb28855e01604cbd04580febd55a1` |
| `doc/testing-defects.md` | `19fb28e5f73bebda13f25d6ad1db25ab2c958aaac83d5d48859bf2e4e919bf10` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `7ab1e9bc014f89b3aca46917a2d8cf1b31bcb3da2e9f4056fc7ccddfb9a9a441` |
| `doc/testing-matrix.md` | `1b94faec22396d421a9c1c3a76821954907be534b1da78246ae6501fcee04eda` |
| `doc/测试体系-总合同-2026-09-08.md` | `c3b4fb69336328f1bd1842f6d6e79410d0b3c6fc86617a89607fff54edef3c15` |
| `doc/诊断/CLAUDE.md` | `5d44a3beba028cdff280e8fe8f0bf7f452f959c377a6eac5a231617656a6e2a6` |
| `packages/agent-service/tests/CLAUDE.md` | `e0b724267adab8ba134fe146ff6af99a1117b6ac816098ceaaba60b0ee881380` |
| `packages/agent-service/tests/service/ct-f13-015.test.ts` | `c7261e3eb070051164b72f724e23c14e0ff7a6b722d596e99978581c88ba602a` |
| `packages/agent-service/tests/service/ct-f14-006.test.ts` | `ffe979dc7c98a04f47704fd227acc1c72cf1cea030293ef04ac68236f4500ced` |
aggregate = `fec7970432db588d7d50ab8d3400e7fc901c751d37ffbe8757a353f93705a120`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `158f3dec300ae99ac52a74d6cd60ad9e7bcd050de2ea64e090d9935afb2d178e`
