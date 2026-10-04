# 总Spec v2.2 remain30 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain30-2026-09-09`。测试体系候选 `test-system-v1-gov-remain30-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain30-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain30-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain29-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F10-ID-04 | covered | CT-F10-021 钉成功/失败；CT-F10-024：真实 `createService`；`repairMermaidSource` 返回 `{ done, cancel }`；模型 chat 挂起后生产 cancel；同一 `operationId`；`purpose=mermaid_repair`；`resultStatus=cancelled`，不得 ok/failed；op ≠ 主循环 chat |
| F10-ID-12 | covered | CT-F10-025：真实 `createService`；生产 OpenAI stream 503 后成功；`listExecRecords` 同 `operationId` 的 attempt 1 与 2；流式中断保留 PARTIAL_SSE 原文且不丢 attempt |
| ID-AUX-CALL | covered | 映射 03+04+05。F10-ID-04 取消已由 CT-F10-024 钉死 |

## 实现要点

- 先写 CT-F10-024 / CT-F10-025。公开 `runMermaidRepair` / `repairMermaidSource` 改为 `{ done, cancel }`，`cancel` 接到本文件已有 AbortController，不另造取消状态机。WS `repair_mermaid` 仍 await `.done`。
- 025 暴露流式中断后 coalescer 定时器仍可能在 EventHub 关闭后 flush。生产 `openai.ts` 在 stream catch 里先 flush 合并器；tsc 要求成功路径用已赋值的 `liveCoalesce`。
- 调用方改 `.done` 后刷新 historical unbound 的 `governance-round2` / `governance-v2r-paths` content_sha256。CT-F17-004 仍 historical unbound。
- 未把 F01-DEC-01 / F13-REQ-07 标 covered。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

createService 上修图生产 cancel 仍属原 operation 且 resultStatus=cancelled；生产重试两条 attempt 同 operationId，流式中断留原文。

## 建议打回点

- 只改 021 binding。
- 取消只扫源码不跑。
- 把 ID-AUX-CALL 在 04 未钉取消时升 covered。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain30-2026-09-09；已完成 F10-ID-04 修图生产 cancel 与 F10-ID-12 重试 attempt；ID-AUX-CALL 已升 covered；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `699882575053e25c3ae610a2f644ce01e7b96925138a955fc83031f94a96242a` |
| `doc/testing-defects.md` | `406aff8cdf08ac997a3eeff19ed2cf96c16d6e154553251dc130390a9de43019` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `a4b936c466913f363a8a84d4f871e3ed54089ad3c3e72babe380f37bd296b20b` |
| `doc/testing-matrix.md` | `cc377ca26a3d8147a453c7b112e08a695b248f11c83cdce6e98f158f5a7ff115` |
| `doc/测试体系-总合同-2026-09-08.md` | `72808d623ae2596e808cba4ba992ae9f36c21b0556d9f7538ff78322592eeb83` |
| `doc/诊断/CLAUDE.md` | `ae4d3c9319847ad697b0405edd7633ea664f7c4273c7d38b8a5f4eb14be6a5a0` |
| `packages/agent-service/tests/CLAUDE.md` | `5acdbcfe3de01b14c996dfd43acae1ace658980b6750e1abdb56452964d861d7` |
| `packages/agent-service/tests/service/ct-f10-024.test.ts` | `b26c6529596545abc97e9afb687ffb42160d9b12b625bba9ed9110c0ad179b03` |
| `packages/agent-service/tests/service/ct-f10-025.test.ts` | `b2694e4a5a14168507a59bbb7d402ab40784d9786d5b34e0945228c1e5f5f3a9` |
aggregate = `e14eebaa2b38105f96cc8771e08ed4a01e2a5e863b0a38716862b9b835cbddbc`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `7e91b9c7a7ca3f89065dd0d61e168565f5f2ad332e4d79ff8661326724a21f39`
