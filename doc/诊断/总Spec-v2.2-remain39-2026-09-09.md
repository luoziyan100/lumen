# 总Spec v2.2 remain39 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-remain39-2026-09-09`。测试体系候选 `test-system-v1-gov-remain39-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。`test-system-v1-gov-remain38-2026-09-09` 已作废。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-remain39-2026-09-09
test_system_candidate_id: test-system-v1-gov-remain39-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-remain38-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| F18-CTX-01 | covered | CT-F18-004：生产 `createService.start` + `submit` 短任务后 `listExecRecords` 有 `kind=context`，且挂该任务/轮次/operation。ALS 外调用生产 `createExecEvidence.recordContext` 抛 `recordContext requires runWith ALS`，库中无成功 context。不是只改 V2R-05 / CT-F18-001 binding，也不是只调 `runAgent` |
| F11-BOT-04 | covered | CT-F11-009：生产 `createService.start`；库级 `turn_start` 触发器；`submit`/`waitFor` 拒绝；`isRunning` false；任务回滚 queued；同服务再 submit 完成；关后第二实例 `createService.start`+submit 完成。不是只改 batch2 binding，也不是复述 BOT-01/03 listen/portfile |

## 实现要点

- 先写 CT-F18-004 / CT-F11-009。正常路径走生产 `createService` + `start` + 真实主循环。
- `exec-evidence.ts`：`recordContext` 在 `!als.getStore()` 时抛错，不写成功 context。`loop.ts` 已有采集失败 catch，不挡主循环成功路径。BOT-04 现有 queued→running / beginTurn 同事务回滚已够，无额外 runtime 改动。
- 不升 CTX-02..05 / BOT-01..03/05/06 / OWN-10 / CON-*。未把 F01-DEC-01 / F13-REQ-07 已 covered 或禁止升的行再改。未 launchd:install 生产、未杀 PID 71847、未 closed V2R、未动停放环境行。

## 建议通过点

生产主循环写出挂身份的 context；ALS 外 recordContext 失败可见且不写成功 context；准备失败释放 running 并记失败；失败后同服务可再 submit，关后可再开第二实例。

## 建议打回点

- 只改 CT-F18-001 / V2R-05 / IT-F11-001 / batch2 binding。
- 只测 `runAgent` 不经 `createService` 来钉 CTX-01。
- ALS 丢失仍静默 return。
- BOT-04 只调 `new AgentRuntime`。
- 升 OWN-10 / CON-* / CTX-02..05 / BOT-01..03/05/06。
- 动生产 label / PID 71847。

人话状态：正在第 governance-impl-remain39-2026-09-09；已完成 F18-CTX-01 / F11-BOT-04；CON-LOCK-SAME-INODE / CON-LOCK-SWAP / SEC-SYMLINK-WRITE 不升；LC-INTENT-PERSIST 仍 uncovered。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

aggregate 算法：SHA-256(按相对路径字典序拼接 relpath + NUL + bytes)。排除两份 remain39 报告与业务 src/。台账报告计入必须含 doc/testing-historical-ids.json 和 doc/测试体系-总合同-2026-09-08.md。

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `455455da21b2a3446a6bf3c26b5b5d41de85a57c9e948244a64371e95b1d2a2d` |
| `doc/testing-defects.md` | `5b4575874287725eb9f189f139567676997f9e19ea8246eec320f9b87d93dff0` |
| `doc/testing-historical-ids.json` | `1e34c213f91c8bca7df536ce1a8723bb3f48f3351d642e25e0421728e49b0c54` |
| `doc/testing-manifest.json` | `0dda4dea4c8c6df7cda1265f18655883173a556e7187bac51bb74d5ddc472da4` |
| `doc/testing-matrix.md` | `ba1dfd5565acf6be3e5c2fffdc12d042d36ff7c9aac983ded9a3d46f94cb7e98` |
| `doc/测试体系-总合同-2026-09-08.md` | `fca09573596bee03e739b592feb12e767b7bc03cff0af83c197f23bcb69375a6` |
| `doc/诊断/CLAUDE.md` | `63a2d21ce797513351ff2386171ea2fe9cfb70a5f0dde9e747c4e5059e58db5d` |
| `packages/agent-service/tests/CLAUDE.md` | `84099e0cc9bd69b2ea802ac13a1e6337c1edaa0ca103bc1cfc88dd100414a48c` |
| `packages/agent-service/tests/service/ct-f11-009.test.ts` | `99839a95bf1996e948008a8644c5afb1166dfa9a620a4f89a5b15011f10c588c` |
| `packages/agent-service/tests/service/ct-f18-004.test.ts` | `5a72c8e273a94036d57662bf3f5220163cc0db0a1062b31e723feb1471fee65c` |
aggregate = `b8e3ad28624702be47cc073d0b4fba88533db9ae68a22053702956e2d270243b`

自身 hash = 第一个名为 报告自身哈希 的二级标题之前的全部 UTF-8 字节（含标题前空行，不要 rstrip）。不含本报告。

## 报告自身哈希
去掉「## 报告自身哈希」
自身 hash: `9ddb393d2a04561398eb672cb6c3a4084dde44011bbdeedc2974e14ff05cf835`
