# 总 Spec v2.2 F17/F19/F22/F23 推进

状态: READY_FOR_REVIEW。内部推进报告。整体候选未冻结，不能交终审。不登记 MAIN_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

```text
round: governance-loop / 2026-09-09
spec_version: v2.2
implementation_candidate_id: governance-impl-f17-f19-f22-f23-2026-09-09
test_system_candidate_id: test-system-v1-gov-f17-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-f18-2026-09-09
changed_files:
  packages/agent-service/src/core/{evidence-port,loop}.ts — timedOut; version 标记
  packages/agent-service/src/runtime/{exec-evidence,diagnostic-io,agent-runtime}.ts — 精度标记、视觉对照、诊断无网
  packages/agent-service/src/tools/env/vision/vision-tools.ts — 变换前材料
  packages/agent-service/src/storage/{db,bad-case-store}.ts — v14 kind
  packages/agent-service/src/protocol/{dto,messages,decode,server}.ts — 可选 kind
  packages/agent-service/tests/service/ct-f17-007.test.ts 及 CT-F17-008 / CT-F19-004 / CT-F22-004 / CT-F23-003 / CT-F23-004
  packages/agent-service/tests/service/governance-batch2.test.ts / governance-rework.test.ts — schema v14 断言
contracts: F17-REQ-07/08, F19-TOL-04, F22-BAD-04, F23-PKG-03/04（局部覆盖，不是合同 accepted）
impact_map:
  F17-REQ-07 — versionPrecision=unknown / configExact=false；矩阵 covered
  F17-REQ-08 — vision before vs afterRequest；矩阵 covered
  F19-TOL-04 — 1s 超时进 exec_records；矩阵 covered
  F22-BAD-04 — 三类 kind 持久可 list；矩阵 covered
  F23-PKG-03 — 独立 destDir 读清单；矩阵 covered
  F23-PKG-04 — fetch/upload=0；矩阵 covered
  F20-STO-07 — 仍 partial
test_ids: CT-F17-007, CT-F17-008, CT-F19-004, CT-F22-004, CT-F23-003, CT-F23-004
coverage_delta: behavior 21 / 147 / 15；combo 3 / 31 / 3；accepted=0
public_checks: 见测试体系报告
remaining: 原生设置页、sidecar 排空、PID 71847、WebKit AT、F20 长会话、F16/F24 停放项
handoff: READY_FOR_REVIEW
```

本文件是实现候选的内部待验说明。测试体系台账、checker 与逐 test_id 状态以 [`测试体系-v1-F17-2026-09-09.md`](测试体系-v1-F17-2026-09-09.md) 为准。

## 本轮实际推进（局部）

1. **F17-REQ-07**：模型请求/响应与 context 在拿不到精确 version/config 时写 `versionPrecision: 'unknown'`、`configExact: false`，不假装精确。
2. **F17-REQ-08**：`recordVisionExchange` 对照变换前材料（imageId/placeholder/mediaType）与实际发出请求。
3. **F19-TOL-04**：`run_code` 超时（≤2s）写入 `timedOut`；`cancelled ≠ processExited`。
4. **F22-BAD-04**：`bad_cases.kind` 三类可 mark/list；历史缺口标 `evidenceGap`；不改 `task_events`。
5. **F23-PKG-03**：独立 destDir 生成包后只读清单，不含 lumenHome 源文件。
6. **F23-PKG-04**：导出期间 fetch/upload 计数为 0，产物只在 destDir。

未把 F01–F24 写成合同完成。未冻结覆盖 F01–F24 的整体实现候选。未改 UI / Rust，未 tauri:build。未碰 F20-STO-07 长会话。未 closed V2R。

TEST_SYSTEM_PASS: pending original review
F01-F24: not accepted by this document
MAIN_PASS: prohibited

测试体系文件 `aggregate` 不含本报告。算法见测试体系报告。`aggregate`=`d26f2824b096a6ac5700dfad3ebe4a2e9574ea55afec667afb20e1ea5acec919`。

## 报告自身哈希

`cf216aee112fa5a58ff7e6d23feecdf91a48c215be1f627eacba3066503c0260`

计算边界：SHA-256(去掉「## 报告自身哈希」及之后全部字节)。不含本段。

人话状态：正在第 F17/F19/F22/F23 批次；已完成上述行为行的公开覆盖；F16/F20/F24 合同尚未由主模型验收通过。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收本批；通过则继续未停放合同。
是否需要用户：不需要。
