# 总 Spec v2.1 治理推进

状态: READY_FOR_REVIEW。内部推进报告。整体候选未冻结，不能交终审。不登记 MAIN_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

```text
round: governance-loop / 2026-09-09
spec_version: v2.1
implementation_candidate_id: governance-impl-f07-f16-f24-2026-09-09
test_system_candidate_id: test-system-v1-gov-2026-09-09
base_id: dirty worktree + 2026-09-08 V2R 返工；作废 test-system-v1-convergence-2026-09-09
changed_files:
  packages/agent-service/src/launchd.ts — 隔离 test label
  packages/agent-service/src/storage/resume.ts — resultSource=recovery_synthetic
  packages/agent-service/src/runtime/replay-recorded.ts — liveEval；回放按 operation 配对
  packages/agent-service/src/protocol/{dto,messages,decode,server}.ts — live_eval 分家
  packages/agent-service/src/runtime/agent-runtime.ts — liveEvalCase；诊断包 exec/manifest 脱敏
  packages/agent-service/src/storage/exec-content.ts — 裸 Bearer / hash token
  packages/ui-client/src/{agent-client.ts,components/BadCaseDialog.tsx,copy/appCopy.ts} — 重新评估
  packages/ui-client/src-tauri/src/main.rs — Cmd+Q 走 drain
contracts: F07, F15, F16, F24（局部；不是合同通过）
impact_map:
  F16-HAN-09 / DEL-SETTINGS-NATIVE — 测试实体 AT-F16-001 执行通过；矩阵仍 partial / combo uncovered
  F07-RES-06 — recovery_synthetic；system_observation 未齐；矩阵 partial
  F24-RPL-10 — live_eval 与 recorded_replay 分家；F24 其余行仍 partial/uncovered
  F01–F14 / F17–F23 — 本候选未做完整独立复验；只声明未改裁决语义
test_ids: AT-F16-001 实体通过且矩阵 partial；AT-F16-003/AT-F15-001 skip/uncovered；RP-F24-009 covered（仅 F24-RPL-10）
coverage_delta: behavior 9 / 152 / 22；combo 3 / 31 / 3；accepted=0
public_checks: 见测试体系报告
remaining: 原生设置页、sidecar 排空、PID 71847、F18/F20/F21 缺口、WebKit AT
handoff: READY_FOR_REVIEW
```

本文件是实现候选的内部待验说明。测试体系台账、checker 与逐 test_id 状态以 [`测试体系-v1-治理推进-2026-09-09.md`](测试体系-v1-治理推进-2026-09-09.md) 为准。

## 本轮实际推进（局部）

1. **F16**：隔离 `com.lumen.agent-service.test.*` 真装。AT-F16-001 **测试实体执行通过**，F16-HAN-09 **仍为 partial**（不是原生设置页交接）。AT-F16-003 / AT-F15-001 仍 skip。Rust 仍写死生产 label。
2. **F07**：封口写 `resultSource=recovery_synthetic`。F07-RES-06 仍 partial。
3. **F24**：`liveEval` 必须显式 liveModel；WS 与录制回放分家。只推进 F24-RPL-10，不代表 F24 全部完成。
4. **V2R 边界**：Cmd+Q 与交接共用 drain；诊断包 `exec/manifest` 脱敏。

未把 F07 / F16 / F24 写成合同完成。未冻结覆盖 F01–F24 的整体实现候选。

## 安装

最后一次按构建日志重装后，bundle 与 `/Applications/Lumen.app` 二进制 sha256 均为：

`57ee40da87444186cbf4ef8a7db819370048bbd73455c8165a42ec72a876ea27`

路径：`packages/ui-client/src-tauri/target/release/bundle/macos/Lumen.app`。未重装生产 LaunchAgent（PID 71847）。

TEST_SYSTEM_PASS: pending original review
F01-F24: not accepted by this document
MAIN_PASS: prohibited

报告自身 hash 的计算边界见文末哈希节。测试体系文件 `aggregate` 不含本报告。

## 报告自身哈希

`36db847ed7c2f8ce20becf196b25ef97203ebad25dde20e3163f227b163befd0`

计算边界：SHA-256(去掉「## 报告自身哈希」及之后全部字节)。不含本段。
