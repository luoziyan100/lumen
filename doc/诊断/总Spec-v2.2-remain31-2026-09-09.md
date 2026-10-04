# 总Spec v2.2 remain31 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain31-2026-09-09`。测试体系候选 `test-system-v1-gov-remain31-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain31-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain31-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain30-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F17-REQ-01 | covered | CT-F17-010：真实 `createService`；生产主循环一次带 tools 的 chat；`listExecRecords` / `readExecRecord` 最终 `model_request` JSON 含 tools；正文无 apiKey / Authorization / 测试密钥；同任务有 `model_response`；adapter/SSE 畸形仍留原文 request+response（或 raw） |
| F17-REQ-05 | covered | CT-F17-011：同一 `createService`；四条生产路径写出 `exec_records`：`purpose=title_backfill`、`mermaid_repair`、`vision`、子循环（父 task 可见，能对上 parentOperationId 或 child 身份）；至少一条失败可定位（resultStatus 不得 ok，operationId 非空，挂原 taskId） |

## 实现要点

- 先写 CT-F17-010 / CT-F17-011。010 走生产 OpenAI streamTransport，不走 f17-f21 replay。011 复用 visionTransport、repairMermaidSource.done、脚本标题/子代理，不另造 sidecar，不直接 new AgentRuntime。
- 畸形 SSE 在 stream transport 收集 data 行；拼不出正文时把 raw 挂上最终 request/response，解析失败不得丢原文。
- 未把 F01-DEC-01 / F13-REQ-07 / F10 已 covered 行再改。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

createService 主循环 request JSON 含 tools 且无密钥，解析失败留原文；同一 createService 上标题/修图/识图/子循环都落 exec_records，失败可定位。

## 建议打回点

- 只改 f17-f21 / v2r-paths binding。
- 直接 new AgentRuntime。
- 把 F10 已 covered 行再改。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain31-2026-09-09；已完成 F17-REQ-01 与 F17-REQ-05；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `10ab8a26b1776bcc7c2b6feba0d6858916bf1cf3cfde544957c53d731fd6e9e4` |
| `doc/testing-defects.md` | `9e493f18f6c7fb97cbc6a9fd884ab42960438d2a663375b30be1f1e77680c877` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `cf09ba8eda071c50cdff7f302ebd2b007a2a6f6cdff13b251b98dfb5f143ab2a` |
| `doc/testing-matrix.md` | `ccf86317e25b2a5c6620561179104adb5011557cf1729fa349675fb1aa45a387` |
| `doc/测试体系-总合同-2026-09-08.md` | `d3d2564f483715646b78a20a14ef690092cbb4a84b527094df716f1a30333a8e` |
| `doc/诊断/CLAUDE.md` | `93fb0ce05bc2d4b7f0908f70e12598e4c91299df4bf9ba8a8e7918833cd338d9` |
| `packages/agent-service/tests/CLAUDE.md` | `c927f6d00d1254120082f0ac4f98ec93f526e391d744011611916ea51792025d` |
| `packages/agent-service/tests/service/ct-f17-010.test.ts` | `6b82d8281ebedf870121048eef4289e8dc36bff0b0cc15c85fb64a66d14b22b1` |
| `packages/agent-service/tests/service/ct-f17-011.test.ts` | `5817e1ecddd5a157a6dc5e36d6e5287cb9136480f928ff695632fc80e04f9dc6` |
aggregate = `343635fb2dcf8eda6571591975f43d131eae4f2f91230df036dd3d002107877d`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `faed826fa7bb9ef7ab47dfb5a6e65df8aeb22a3ab89bd6c7ce8c8d5585219413`
