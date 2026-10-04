# 总 Spec v2.2 F18/F20/F21 推进

状态: READY_FOR_REVIEW。内部推进报告。整体候选未冻结，不能交终审。不登记 MAIN_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

```text
round: governance-loop / 2026-09-09
spec_version: v2.2
implementation_candidate_id: governance-impl-f18-f20-f21-2026-09-09
test_system_candidate_id: test-system-v1-gov-f18-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-2026-09-09
changed_files:
  packages/agent-service/src/core/{context-assembly,result-source,loop,thread,evidence-port}.ts — 变换种类与四类来源
  packages/agent-service/src/storage/{resume,exec-retention,context-budget,index}.ts — compaction 计划挂线程；保留策略
  packages/agent-service/src/runtime/{compaction,exec-evidence}.ts — system_observation / external_verification
  packages/agent-service/src/subagent/reminder.ts — reminder 带 system_observation
  packages/agent-service/tests/service/ct-f18-002.test.ts 及 CT-F18-003 / CT-F07-006 / CT-F20-007 / CT-F21-004
contracts: F18, F20, F21, F07-RES-06（局部覆盖，不是合同 accepted）
impact_map:
  F18-CTX-03 — summary/filter/omit 真实组装；矩阵 covered
  F18-CTX-04 — versions.constraints 含 tools/maxSteps/fold；矩阵 covered
  F18-CTX-05 / F07-RES-06 — 四类 resultSource 可查；矩阵 covered
  F20-STO-09 — EXEC_RETENTION + cleanupExecContentByPolicy；矩阵 covered
  F20-STO-07 — 仍 partial；预算数字已登记，代表性长会话未跑
  F21-QRY-04 — list/read/export 期间 chat/run 为 0；矩阵 covered
test_ids: CT-F18-002, CT-F18-003, CT-F07-006, CT-F20-007, CT-F21-004
coverage_delta: behavior 15 / 150 / 18；combo 3 / 31 / 3；accepted=0
public_checks: 见测试体系报告
remaining: 原生设置页、sidecar 排空、PID 71847、WebKit AT、F20 长会话四条上限、F16/F24 停放项
handoff: READY_FOR_REVIEW
```

本文件是实现候选的内部待验说明。测试体系台账、checker 与逐 test_id 状态以 [`测试体系-v1-F18-2026-09-09.md`](测试体系-v1-F18-2026-09-09.md) 为准。

## 本轮实际推进（局部）

1. **F18-CTX-03**：`assembleContextRecord` 在真实 `recordContext` 路径记录 fold/truncate/omit/filter/summary。summary 指向 rebuildThread 挂上的 compaction 计划，不是编造模型摘要。
2. **F18-CTX-04**：`versions.constraints` 从 loop 的 tools 与 limits 采集。长会话数值验证仍属 F20-STO-07。
3. **F18-CTX-05 / F07-RES-06**：四类 `RESULT_SOURCE` 可查。compaction 事件 = system_observation；seal = recovery_synthetic；model_step = model_self；成功 tool_result = external_verification。
4. **F20-STO-09**：`exec-retention.ts` 为唯一策略源。过期孤儿可清，引用与未过期保留，失败写入 errors。
5. **F21-QRY-04**：runtime list/read/export 期间 model.chat 与 tool.run 为 0。

未把 F01–F24 写成合同完成。未冻结覆盖 F01–F24 的整体实现候选。未改 UI / Rust，未 tauri:build。

TEST_SYSTEM_PASS: pending original review
F01-F24: not accepted by this document
MAIN_PASS: prohibited

测试体系文件 `aggregate` 不含本报告。算法见测试体系报告。

## 报告自身哈希

`452b2963f57391246fbe961819be560459ab3da541276fb2696d1ee153ed27eb`

计算边界：SHA-256(去掉「## 报告自身哈希」及之后全部字节)。不含本段。

人话状态：正在第 F18/F20/F21 批次；已完成上述行为行的公开覆盖；F07/F16/F24 合同尚未由主模型验收通过。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收本批；通过则继续未停放合同。
是否需要用户：不需要。

