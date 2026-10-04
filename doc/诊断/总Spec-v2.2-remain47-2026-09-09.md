# 总Spec v2.2 remain47 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain47-2026-09-09`。测试体系候选 `test-system-v1-gov-remain47-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain46-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain47-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain47-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain46-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F14-ORI-04 | covered | CT-F14-009：生产 `createService.start`。HTTP 不带 Origin；正确 token 的 GET `/pdf` 与 POST `/upload` 不得因 Origin 403；错/无 token 401 不是 403 Origin。WS 不设 Origin；正确 token 必须 hello；错/无 token 4401，不得 hello。错 token POST `/upload` 无新文件；错 token WS 即使试图 submit 也无新 task。不是复述 006/007 外站 Origin，不是只改 CT-F14-004 binding |
| F01-AUTH-01 | covered | CT-F01-018：生产 `createService.start`（默认非空 token）。HTTP POST `/upload` 错/无 token → 401，数据根无新 upload。WS 错/无 token → 4401，不得 hello，无新 task。对照：正确 token 空 Origin POST `/upload` 不得 401。不是只改 CT-F01-004 / batch1 binding，不是把 ORI-04 错 token 子句当 AUTH-01 升格。不升 AUTH-02 / HTTP-01 |

## 实现要点

- 先写 CT-F14-009 / CT-F01-018。取得权走生产 `createService` + `start`。
- 现有 `isAllowedOrigin` 空 Origin 放行、token 检查（HTTP 401 / WS 4401）已在写盘前进；本批不改业务 src。
- 不升 F13-REQ-07、DEC-01、AUTH-02、HTTP-01、CONN-01、OWN-10、CON-*、SEC-ORIGIN-TOKEN。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。未修 CT-F16-012 / AT-F16-001。

## 建议通过点

无 Origin 正确 token HTTP 不得 403；错/无 token 401 不是 403。WS 无 Origin 正确 token hello；错/无 token 4401 无 hello、submit 无新 task。未认证 upload 无新文件；正确 token 空 Origin upload 不得 401。

## 建议打回点

- 只改 CT-F14-004 / CT-F01-004 / batch1 / service-boot binding。
- 只测握手不测写入口。
- 空 Origin 被 403，或错 token 当 403 Origin。
- 未认证仍写盘。
- 默认升 AUTH-02 / HTTP-01 / DEC-01 / REQ-07 / OWN-10 / CON-* / SEC-ORIGIN-TOKEN。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain47-2026-09-09；已完成 F14-ORI-04 / F01-AUTH-01；不升 F13-REQ-07 / F01-DEC-01 / AUTH-02 / HTTP-01 与 F20 整簇；CON-REQID / ID-STALE-CONN 不升；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：本批 ct-f14-009 / ct-f01-018 / ct-f14-007 / ct-f14-008 4 pass。agent-service 全量 724 pass / 0 fail / 2 skip（AT-F16-001 / CT-F16-012 本轮整包绿；整包偶发闪红本批禁止修）。ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain47 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `1258996e058d0c146a0f6b562cb95801a714562c70d234f40e5274eb32e51364` |
| `doc/testing-defects.md` | `16b8efc46d3690c056f49ff1a62a27386e95ea6611ccd80288e6d39c67744c0c` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `128f7f5defce600e28eadd0ca6e753d040a85e6d8d7abedda208d7fcd28593a2` |
| `doc/testing-matrix.md` | `6fe13b7e5e3caab0c3a855f13c79435e889d79f937f5d7984516e9401a5bad9e` |
| `doc/测试体系-总合同-2026-09-08.md` | `b31b1ff21331450d9228831ac012d3e8ed3ab4c2d5dcf9d559d4ab9709d7f3e4` |
| `doc/诊断/CLAUDE.md` | `ad46d6a218d1d77d5698f0bbfc7b2e8dac6850ce2e29db0c7ee1bb202976c460` |
| `packages/agent-service/tests/CLAUDE.md` | `e875ebc77d69bdc347a3ae44841abfe9fe0ef75b05c93c67a5b13dc67fb3fc49` |
| `packages/agent-service/tests/service/ct-f01-018.test.ts` | `b0cf609fb88d0f174ab84efe662ecc38a45527ccaf542a924550494eaf9339f5` |
| `packages/agent-service/tests/service/ct-f14-009.test.ts` | `0e3de252d091902066b76300f8bfddcb1ddb147bb79df5196f66dd8f04791d31` |
aggregate = `e1deb986ea0c208ad58a2f3e4bcdbb90cd5ba4ebf28dcaf9842a7f9c30e45ddd`


自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `761dc39818b24dc5e621e9286cf3b650014ceb3303661f31d3bc4c8053fb0706`
