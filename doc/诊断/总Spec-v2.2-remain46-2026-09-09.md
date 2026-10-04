# 总Spec v2.2 remain46 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain46-2026-09-09`。测试体系候选 `test-system-v1-gov-remain46-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain45-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain46-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain46-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain45-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F14-ORI-02 | covered | CT-F14-007：生产 `createService.start`。HTTP POST `/upload` 带正确 `?token=` + `Origin: https://evil.example` 必须 403；`access-control-allow-origin` 不是 `*`（外站为 null）；数据根无新 upload 文件、无新 task。同一 token、本机 Origin 的 POST `/upload` 不得 403，且回显该 Origin、不是 `*`。不是 CT-F14-005（无本机回显），不是 006 的 GET `/pdf`，不是只改 CT-F14-002 / round15 binding。不升 ORI-04 / SEC-ORIGIN-TOKEN |
| F14-ORI-03 | covered | CT-F14-008：生产 `createService.start`。外站 Origin + 正确 token 连 WS：关闭码 4403；不得收到 `hello`；即使 `open` 后立刻 `submit`，数据根也无新 task。本机 Origin + 同一 token：必须收到 `hello`，随后合法 `list` 可结算。不是 006（不测 submit/无副作用），不是 005（无本机握手对照），不是只改 CT-F14-003 / round15 binding。不升 ORI-04 / SEC-ORIGIN-TOKEN |

## 实现要点

- 先写 CT-F14-007 / CT-F14-008。取得权走生产 `createService` + `start`。
- 现有 `isAllowedOrigin` + `applyCors` + WS `4403` 已在写盘/握手前进 Origin 检查；本批不改业务 src。
- 不升 F13-REQ-07、DEC-01、AUTH、F14-ORI-04、F20、OWN-10、CON-*、SEC-ORIGIN-TOKEN。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

POST `/upload` 外站+正确 token 403、CORS 非 *、无新文件/任务；本机同一 token 不得 403 且回显 Origin。WS 外站 4403、无 hello、submit 无新 task；本机 hello 后 list 可结算。

## 建议打回点

- 只改 CT-F14-002 / 003 / 005 / 006 / round15 binding。
- 只测 `isAllowedOrigin` / 只测 GET `/pdf`。
- 外站仍进业务，或本机也被 403。
- 默认升 ORI-04 / REQ-07 / DEC-01 / AUTH / OWN-10 / CON-* / SEC-ORIGIN-TOKEN。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain46-2026-09-09；已完成 F14-ORI-02 / F14-ORI-03；不升 F13-REQ-07 / F14-ORI-04 与 F20 整簇；CON-REQID / ID-STALE-CONN 不升；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：本批 ct-f14-007 / ct-f14-008 / ct-f14-006 / ct-f14-005 4 pass。agent-service 全量 722 pass / 0 fail / 2 skip（AT-F16-001 / CT-F16-012 本轮整包绿；整包偶发闪红本批禁止修）。ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain46 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `27234b9f25a5c2900fe9f3c8fdd3deb7c15e7efed5caae340e0190b6d2b0cbff` |
| `doc/testing-defects.md` | `b6b4506ccde1d4f52cd5979f69b5a66f113a98c4fb4c4cded7f81974eaeaae61` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `317858003291287e32baa9ce13237a3c98cf59c77ce23d72afff2a6417bef499` |
| `doc/testing-matrix.md` | `050e51ef0d03343c8c21dd9d2cb664e21b0b37fedfd0b137733dedc6ccd55f6c` |
| `doc/测试体系-总合同-2026-09-08.md` | `1988b51dc4a1127dc55573dde55b9c6d1bd1eafb2b02517023c3121c458fcf70` |
| `doc/诊断/CLAUDE.md` | `8178f0ef3cc0ed85fdf77b63398271d00e85d8113c694be740ddf2df483b1cce` |
| `packages/agent-service/tests/CLAUDE.md` | `13c6ab9d12a4ef91de865143877a4688d068cc9746a801345d32d88fddff0a40` |
| `packages/agent-service/tests/service/ct-f14-007.test.ts` | `6894dc586070e09fc0ed6bd1bfb00318f439f80bded8eb008d5da76df7b96857` |
| `packages/agent-service/tests/service/ct-f14-008.test.ts` | `8c235156001107574ae01db6341bb3c3c98820e8037add73e78558b1aa536968` |
aggregate = `81f9043a3d6f9952b0185189799f2ac2a75e1282a9365c61f56841c2fc5325b8`


自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `f8be45ed0e2158b8e89c2b25736d0f01a094c748dacb99d2562eaa5d19f06fa2`
