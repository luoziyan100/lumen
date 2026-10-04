# 总Spec v2.2 remain52 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain52-2026-09-09`。测试体系候选 `test-system-v1-gov-remain52-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain51-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain52-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain52-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain51-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F23-PKG-01 | covered | CT-F23-006：生产 `createService({ apiKey: 'sk-secret-…' })` + 真实 WS。write_file 任务 → `mark_bad_case` → `export_diagnostic` 到独立 dest。dest 能定位反馈 actual/expected、配置（settings 或等价，无 apiKey/密钥值）、task 事件、exec 请求/工具/文件证据（operation + 至少一类 file/tool/request）。遍历 dest 全部文本：不得出现 apiKey 字段名当密钥、不得出现 `sk-secret-` 原值。不是复述 CT-F21-009（export_exec_pack）。不是复述 CT-F23-003（只读 dest 无根）。不升 F23-PKG-02。`process.pid !== 71847` |
| F22-BAD-01 | covered | CT-F22-005：生产 `createService` + 真实 WS。`mark_bad_case` → `list_bad_cases` 非空。`handle.close()` 后同一 home 再 `createService.start`：`list_bad_cases` 仍带回同一 id/actual。快照 `task_events`（id/seq/payload）。WS `update_bad_case` 改 note/expected 后，事件快照逐字节相同；list 看到更新。不是只改 f22-f24 store 直测 binding。不升 BAD-02/03/05/06。`process.pid !== 71847` |

## 实现要点

- 先写 CT-F23-006 / CT-F22-005。取得权走生产 `createService` + `start` + 真实 WS。
- 现有 BadCaseStore + exportDiagnostic 已够；本批不改业务 src。
- 不升 F13-REQ-07、DEC-01、OWN-10、CON-*、F23-PKG-02、F22-BAD-02/03/05/06、PER-BLOB-EXPORT。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。未修 CT-F16-012 / AT-F16-001。

## 建议通过点

诊断包 dest 能定位反馈、配置、事件与 exec 证据；全文无 apiKey 密钥与 sk-secret- 原值。WS mark→list→close→再 start 仍同 id/actual；update 后 list 更新且 task_events 逐字节不变。

## 建议打回点

- 只改 governance-f22-f24 / CT-F23-001 / CT-F22-001 binding。
- 走 export_exec_pack 当 F23-PKG-01，或只复述 CT-F21-009 / CT-F23-003。
- dest 缺反馈/配置/事件/exec 证据，或出现 apiKey 密钥 / sk-secret- 原值。
- 只直测 BadCaseStore，不走 createService WS。
- 默认升 DEC-01 / REQ-07 / OWN-10 / CON-* / PKG-02 / BAD-02/03/05/06。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain52-2026-09-09；已完成 F23-PKG-01 / F22-BAD-01；不升 F13-REQ-07 / F01-DEC-01 与 F20 整簇；CON-REQID / ID-STALE-CONN 不升；不升 F23-PKG-02 / F22-BAD-02/03/05/06 / PER-BLOB-EXPORT；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

verify：本批 ct-f23-006 / ct-f22-005 / ct-f23-003 / ct-f22-004 4 pass。agent-service 全量 734 pass / 0 fail / 2 skip（AT-F16-001 / CT-F16-012 本轮整包绿；整包偶发闪红本批禁止修）。ui-client 338 pass / 3 skip；theme 54 键；checker 自测 6 pass。未动生产 label / PID 71847。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain52 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。不含本报告。算法段只写名为 报告自身哈希 的二级标题。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `59f20d8be9df3cf0b06b8d307c6406507c3449e515fc97bf47128e5744e30026` |
| `doc/testing-defects.md` | `f0e0da9ffd1c5b7d72e574c23fb8c7a4cd637846157336d56de441214998611b` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `feac9a790e25344ba85328660855398c65c5aa22c7f56973ee9e25302dff48c8` |
| `doc/testing-matrix.md` | `a7fdf14972f6e13d5e8781beb122c1bbde30efed73fba2038640b70786f3195e` |
| `doc/测试体系-总合同-2026-09-08.md` | `d06fecf92498b479e6deb83fb33400d0e8245786f608ccf0f53df3691ecd38cf` |
| `doc/诊断/CLAUDE.md` | `403d569b27ab8ccb993d57294ba63001452e35dae8ca6c5d205015081857c660` |
| `packages/agent-service/tests/CLAUDE.md` | `003e10dae11cb3a915d2e00550a02ff0a43aae438a4daf7de28be6c36a909330` |
| `packages/agent-service/tests/service/ct-f22-005.test.ts` | `263d115625e5bda8abd78a95dd400ad8ffdeb8a1ae4f4f89955ac96e349893da` |
| `packages/agent-service/tests/service/ct-f23-006.test.ts` | `3b950244afdfbcbe4db37d2813db485249f023cf8d8edcbeea03277aa2e547d8` |
aggregate = `e4ddf8b3a7572f53c79345b446cb231d0cc58be2dd2259b9a4d8f84400e430a9`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
不含本报告
自身 hash: `89e5826faf441b66b58364c8bcdcfacc6e10e9bc0f44829fc1703ec2b446748c`
