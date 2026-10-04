# 总Spec v2.2 remain25 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain25-2026-09-09`。测试体系候选 `test-system-v1-gov-remain25-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain25-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain25-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain24-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F10-ID-01 | covered | CT-F10-014：真实 `createService`；脚本模型发出未知工具 `providerCallId=prov-f10-014`；落库 `tool_call` 的 `providerCallId` 等于模型给的 id；`operationId` 由宿主分配，非空且 ≠ providerCallId；对应 `tool_result` 同一 `operationId` 且 `resultStatus=failed`；`model_step` 在调用前已有宿主 `operationId`。未只改 round1 binding |
| F10-ID-07 | covered | CT-F10-015：真实 `createService` 生产工具；`read_file` 读不存在文件、`edit_file` old_string 不存在、`write_file` `../escape.md`、`run_code` `process.exit(2)` 落库 `resultStatus` 均为 `failed` 不得 `ok`；先写入正文含 `error` 的文件再 `read_file` 该文件仍 `ok`。未只改 round6 binding，也不是 sweep unknown |
| ID-PROVIDER-VS-HOST | covered | CT-F10-014 钉宿主 operation ≠ providerCallId；CT-F10-015 钉生产工具已知失败不得 ok（含 run_code 非零 + 正文含 error 仍 ok） |

## 实现要点

- 先写 CT-F10-014 / CT-F10-015。生产 `createService` → 真实内核 loop 已在调用前分配宿主 UUID `operationId`，`providerCallId` 只记模型 tool call id；未知工具与生产工具已知失败走 `resultStatus=failed`。本批无业务缺口，未改 `src/`。
- 014 不是直接 `runAgent` + 空 tools，也不是只改 round1 binding，不复述 013 parentOperation。
- 015 不是直接 `runAgent` + 自装配 `ENV_TOOLS`，含 `run_code` 非零，对照正文含 error 的成功读取仍 ok。
- 未把 F10-ID-02..05 / F10-ID-08..12 / F01-DEC-01 / F13-REQ-07 标 covered。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

createService 上未知工具宿主 operation ≠ providerCallId；生产工具已知失败（含 run_code 非零）不得 ok，正文含 error 的成功读取仍 ok。

## 建议打回点

- 直接 runAgent 冒充。
- 只改 round1 / round6 binding。
- 用 sweep unknown 冒充已知失败。
- 缺 run_code 非零。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain25-2026-09-09；已完成 F10-ID-01 未知工具宿主 operation ≠ providerCallId，以及 F10-ID-07 生产工具已知失败含 run_code 非零；ID-PROVIDER-VS-HOST 已诚实升 covered；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `d5e9f04785044f914c64a5e523dbec41516b71be94df61cd5e18b4d56d0c92ba` |
| `doc/testing-defects.md` | `e71f9fb65da6e39ff823fbd3f4b2306ce653ea705cee2a6ad055780ea686dcd5` |
| `doc/testing-historical-ids.json` | `77da339f84cfd7e6cc1779aa68681ba69000887af77af878e7f67a580070d7e6` |
| `doc/testing-manifest.json` | `c9ae7e748259d5f6e5b7bc65b12b7e12aa6ece99daf80bacbf7c36ea53ae176f` |
| `doc/testing-matrix.md` | `dd16ae0f5f63916650eaedd5631dbf87da89cc0c9d7cbd218a19f992bff4c2bb` |
| `doc/测试体系-总合同-2026-09-08.md` | `72c3f2687a7046550d3d5159e4385cba82db85565c21117fefef650ef09ef113` |
| `doc/诊断/CLAUDE.md` | `e168bba20ab5a50da53d980ace61ff04601ada768a18df278fa7697c9b8a75b8` |
| `packages/agent-service/tests/CLAUDE.md` | `d93012e18a37b630574051764f516a7e7b314e94530e13c7d2e001231180cb0f` |
| `packages/agent-service/tests/service/ct-f10-014.test.ts` | `9197363717cdead45fa1a6333f8a531eb84e3dcfb47b3a5ca995bae38e68e3d8` |
| `packages/agent-service/tests/service/ct-f10-015.test.ts` | `fc92d93b3ecb9a20d01f1ecd432da538fe7924d1af5e74a82e3cf096cc42928f` |
aggregate = `536764375da7d9f57ade63aebf8953a4e01e63ef9759a9e7b9fe2c16b085a426`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `b8edaa6acbae180b2e950eea0fdd229bbd010e9fa3d3605b484b8962e605e8d2`
