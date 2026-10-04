# 总Spec v2.2 remain49 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain49-2026-09-09`。测试体系候选 `test-system-v1-gov-remain49-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain48-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain49-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain49-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain48-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F01-HTTP-01 | covered | CT-F01-021：生产 `createService` + `start`（默认非空 token）。先用正确 token 空 Origin `POST /upload` 写出最小 PDF 并记下 path。查询入口：`GET /pdf` 错/无 token 均 401，响应体不得含 `%PDF` / 不得回显已上传字节。写入口：错 token `POST /upload` 401，写出后快照无新 upload。对照：同一 path 正确 token `GET /pdf` 200 且体含 PDF 字节。不是复述 CT-F01-018/019，不是只改 CT-F01-007 / batch1 binding。不升 F21-QRY-02 |
| F01-DEC-02 | covered | CT-F01-022：生产 `createService` + `start` + 真实 WS。第一连接 open 后发非法 UTF-8 文本帧（掩码文本帧 payload `0xff`），该连接必须 close/失败。第二根新连接 hello + 合法 `list` 成功。`process.pid !== 71847`，handle 仍可 close。不是只改 CT-F01-002 / governance-rework binding。不把非法 JSON / null 当 DEC-02。不升 DEC-01 |

## 实现要点

- 先写 CT-F01-021 / CT-F01-022。取得权走生产 `createService` + `start`。
- 现有 HTTP 鉴权（token 校验在读 body / 读资产之前）+ WS 坏帧处理已够；本批不改业务 src。
- 不升 F13-REQ-07、DEC-01、OWN-10、CON-*、SEC-ORIGIN-TOKEN、F21-QRY-02。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。未修 CT-F16-012 / AT-F16-001。

## 建议通过点

正确 token 先写出最小 PDF；错/无 token `GET /pdf` 401 且体无 `%PDF`/已上传字节；错 token `POST /upload` 401 且无新 upload；对照同 path 正确 token `GET /pdf` 200 含 PDF 字节。非法 UTF-8 后该连接失败；第二根新连接 hello+list 成功；本测进程仍活、handle 可 close。

## 建议打回点

- 只改 CT-F01-007 / CT-F01-002 / batch1 / governance-rework binding。
- AUTH-01/02 复述当 HTTP-01，或只测写入口不测 `GET /pdf` 泄漏。
- 错 token `GET /pdf` 泄出 PDF 字节。
- 非法 UTF-8 后服务死，或只测握手没有第二根连接。
- 默认升 DEC-01 / REQ-07 / OWN-10 / CON-* / F21-QRY-02。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain49-2026-09-09；已完成 F01-HTTP-01 / F01-DEC-02；不升 F13-REQ-07 / F01-DEC-01 与 F20 整簇；CON-REQID / ID-STALE-CONN 不升；不升 F21-QRY-02；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：本批 ct-f01-021 / ct-f01-022 / ct-f01-018 / ct-f01-019 4 pass。agent-service 全量 728 pass / 0 fail / 2 skip（AT-F16-001 / CT-F16-012 本轮整包绿；整包偶发闪红本批禁止修）。ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain49 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。不含本报告。算法段只写名为 报告自身哈希 的二级标题。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `971547862a3b1967355ad126f8d69ae08ce0645b3e94a78af996c1c622727450` |
| `doc/testing-defects.md` | `581f470a6cb680f40e818400c1585898fa3a2798026f3a7783ef3c57f62c5b99` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `2b45e918bf5ee0463c2315fc8a48e44d89745b2bc920ea8ec63c0be29ca58fa1` |
| `doc/testing-matrix.md` | `3d71915e1b0b23284b0f4fe5abbf94f39e9317de0f5512a7bf73ce99d1ad3dfe` |
| `doc/测试体系-总合同-2026-09-08.md` | `922d4af04891d77e6355bca7e6662226565cc82bc18f81fb988b220d932c895f` |
| `doc/诊断/CLAUDE.md` | `77a5a156a953cf65551dcb369bebe903442e82cb25462afb29051a1483f93987` |
| `packages/agent-service/tests/CLAUDE.md` | `e691b5841927f981e1bcdf8c9abd875254714e72608cc850bf1b5d1f1c6d2c9b` |
| `packages/agent-service/tests/service/ct-f01-018.test.ts` | `b0cf609fb88d0f174ab84efe662ecc38a45527ccaf542a924550494eaf9339f5` |
| `packages/agent-service/tests/service/ct-f01-019.test.ts` | `968a2df7409de98ec57cbecb238bcdeaff28d23ab4261cbb9b0940120e1fc1a6` |
| `packages/agent-service/tests/service/ct-f01-021.test.ts` | `d73bbc9ea2169b5baa1387beeb4c0644afd5d94c5f1371b8c415ae2c9ce63754` |
| `packages/agent-service/tests/service/ct-f01-022.test.ts` | `558be6be40deefca73bced3dc56e2508d19cbe379f9f82e9c27e5b30f96137ce` |
aggregate = `5e7126b655ed495792d26b97316ccd91bcdd5ceca2afc9203c7501534bc9251f`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `13bf2e9cf3de8a5a7544daf89300749ca465fc97a69ddf1533c42af5721132b9`
