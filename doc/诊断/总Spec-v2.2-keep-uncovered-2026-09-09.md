# 总 Spec v2.2 keep-uncovered 推进

状态: READY_FOR_REVIEW。内部推进报告。整体候选未冻结，不能交终审。不登记 MAIN_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

```text
round: governance-loop / 2026-09-09
spec_version: v2.2
implementation_candidate_id: governance-impl-keep-uncovered-2026-09-09
test_system_candidate_id: test-system-v1-gov-keep-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-f17-2026-09-09
changed_files:
  packages/agent-service/src/service.ts — 组装中途失败关已打开的 DB 再抛
  packages/agent-service/src/tools/env/run-code/sandbox.ts — 凭证字面量纳入 file-write deny（含 realpath）
  packages/agent-service/tests/service/ct-f03-006.test.ts 及 CT-F04-005 / CT-F06-005 / UT-F06-006 / CT-F09-007 / CT-F11-006 / CT-F14-005
  packages/agent-service/tests/workspace/run-code.test.ts — 无代理 Seatbelt 快照随写保护更新
contracts: F03-DRN-06, F04-IDM-05, F06-SEC-05/06, F09-DUR-07, F11-BOT-06, F14-ORI-05（局部覆盖，不是合同 accepted）
impact_map:
  F03-DRN-06 — close/监听失败/组装失败放锁；矩阵 covered
  F04-IDM-05 — 两轮 turn/generation；同轮不双写；矩阵 covered
  F06-SEC-05 — write_file+sandbox-exec 软链写拒；矩阵 covered
  F06-SEC-06 — Seatbelt 门禁；矩阵 covered
  F09-DUR-07 — appendEvent 失败不入库 runtime_failure；矩阵 covered
  F11-BOT-06 — 坏 DB/组装失败及时拒绝；矩阵 covered
  F14-ORI-05 — 外站 upload/submit 无新写；矩阵 covered
  F20-STO-07 — 仍 partial
test_ids: CT-F03-006, CT-F04-005, CT-F06-005, UT-F06-006, CT-F09-007, CT-F11-006, CT-F14-005
coverage_delta: behavior 28 / 147 / 8；combo 5 / 30 / 2；accepted=0
public_checks: 见测试体系报告
remaining: 原生设置页、sidecar 排空、PID 71847、WebKit AT、F20 长会话、F16/F24 停放项
handoff: READY_FOR_REVIEW
```

本文件是实现候选的内部待验说明。测试体系台账、checker 与逐 test_id 状态以 [`测试体系-v1-keep-2026-09-09.md`](测试体系-v1-keep-2026-09-09.md) 为准。

## 本轮实际推进（局部）

1. **F03-DRN-06**：`close` 后放锁；监听失败与组装失败关库放锁，修好可再启动。
2. **F04-IDM-05**：同一子代理两轮 `subagent_completed` 带不同 `turn_id`/`run_generation`；同轮重复 complete 不双写；角色名不得代替实例 id。
3. **F06-SEC-05**：`write_file` 与 `sandbox-exec` 经软链写凭证/evidence，realpath 后仍拒。Seatbelt 写保护补上凭证字面量。
4. **F06-SEC-06**：断言当前实现仍是 Seatbelt/`sandbox-exec`，公开架构点名 Seatbelt。
5. **F09-DUR-07**：注入 appendEvent/DB 失败后，不把 `runtime_failure`/`error` 当成已持久；`waitFor` 显式失败。
6. **F11-BOT-06**：坏 DB 路径与组装失败在有限时间内拒绝，锁释放，修好后客户端能收到 hello。
7. **F14-ORI-05**：外站 `POST /upload` 403、WS submit 4403，数据根无新任务、无新上传文件。

未把 F01–F24 写成合同完成。未冻结覆盖 F01–F24 的整体实现候选。未改 UI / Rust，未 tauri:build。未把 F20-STO-07 标 covered。未 closed V2R。未碰停放环境行。

TEST_SYSTEM_PASS: pending original review
F01-F24: not accepted by this document
MAIN_PASS: prohibited

测试体系文件 `aggregate` 不含本报告。算法见测试体系报告。`aggregate`=`be8de32e1740d4574622a6a6a4886e85421b5b90d7f7b32098ec8370c1fec6b9`。

## 报告自身哈希

`d62fb5764408b5782e2aca819bd4b4702e266b09ed8a636d151facaec3fed04c`

计算边界：SHA-256(去掉「## 报告自身哈希」及之后全部字节)。不含本段。

人话状态：正在第 keep-uncovered 批次；已完成上述七条 uncovered 的公开覆盖；停放环境行与 F20-STO-07 尚未由主模型验收通过。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。
