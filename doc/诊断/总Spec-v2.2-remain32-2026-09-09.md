# 总Spec v2.2 remain32 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain32-2026-09-09`。测试体系候选 `test-system-v1-gov-remain32-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain32-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain32-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain31-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F17-REQ-02 | covered | CT-F17-012：真实 `createService`；生产主循环落 `model_request` / `model_response`；经生产 `update_settings` 改模型/系统提示；再 `readExecRecord` 同一条历史 record 正文与改设置前逐字节相同，不按事后配置重建 |
| F17-REQ-03 | covered | CT-F17-013：同一 `createService`；经生产 `update_settings` 关 `collectExecEvidence` 再跑一轮再打开；`listExecRecords` 历史标 `not_collected`；不得事后补造 request/response 正文 |

## 实现要点

- 先写 CT-F17-012 / CT-F17-013。012 走生产 OpenAI streamTransport + WS `update_settings`，不走 f17-f21 ScriptedModel。013 走生产采集开关，不插库假装旧事件。
- settings 增加加法字段 `collectExecEvidence`（缺省开）；runtime 热读，关采集时不 wrap、不把 evidence 交给 runAgent；旧 `task_events` 仍由 exec-store 标 `not_collected`。
- 未把 F01-DEC-01 / F13-REQ-07 / F10 / F17-REQ-01 / F17-REQ-05 已 covered 行再改。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

createService 改 settings 后历史 record 正文不变；采集前旧事件标 not_collected 且不补造正文。

## 建议打回点

- 只改 f17-f21 binding。
- 直接改 SQLite 假装改 settings。
- 把 010 畸形 SSE 吹成 not_collected。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain32-2026-09-09；已完成 F17-REQ-02 与 F17-REQ-03；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `242512df66eb6439b3c0aab99589b5402435becbf749e76042365de8f2628350` |
| `doc/testing-defects.md` | `0b7f7ad94cd42b8d53b0542df888a58a1696496e9f0039f095f613ea9f034e33` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `13506c3c024763cd186a33590bfe406cc04e6da2902802bb4c9618ec22ec619b` |
| `doc/testing-matrix.md` | `9fea12247efe9c8adfcc983f91f72c21f7d7f5493751e46b410494f612c45580` |
| `doc/测试体系-总合同-2026-09-08.md` | `f3c391df461422e1fa4f7a76fe3ae760f498413ef3403ab4edaee781f1aeb403` |
| `doc/诊断/CLAUDE.md` | `69914cbc25251ec85ee7911adb81e310020cf8b71dcf54dfeb04157e197f0e89` |
| `packages/agent-service/tests/CLAUDE.md` | `b425b7d761a03b54359888011d18be63ba524120ae09419ecf3fbb161f60f6d1` |
| `packages/agent-service/tests/service/ct-f17-012.test.ts` | `0e65c0d78bd4cf425be9ced5e51e9d8c422102f19eda0de8accc95db479df80c` |
| `packages/agent-service/tests/service/ct-f17-013.test.ts` | `6ca2b32f3a33d00fd94f0048126050ba33074cfcc7cbc5cef1f59b60ebdba41e` |
aggregate = `69e130d91ed0ce8f7f1be737fe27e0030cd0e026662764b5ee0a77d39fe5603f`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `6bb7e182a1beffdb879e7587f879216964fff9db8ffad65605fb3c7c3b62aeb9`
