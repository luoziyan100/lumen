# 总Spec v2.2 split 2026-09-09

状态: READY_FOR_REVIEW。实现候选 `governance-impl-runtime-split-2026-09-09`。测试体系候选 `test-system-v1-gov-split-2026-09-09`。本文件是执行者内部推进说明，不是验收裁决。不得自行宣布 MAIN_PASS，不得自行宣布 TEST_SYSTEM_PASS。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

implementation_candidate_id: governance-impl-runtime-split-2026-09-09
test_system_candidate_id: test-system-v1-gov-split-2026-09-09
base_id: dirty worktree + 作废 test-system-v1-gov-partials-2026-09-09

## 裁决边界

- TEST_SYSTEM_PASS: pending original review
- F01-F24: not accepted by this document
- MAIN_PASS: prohibited

## 目标行

| 行 | 最终 status | 证据 |
|---|---|---|
| runtime 拆文件 | done | agent-runtime 宿主 + types/context/execute/query/bad-case/diagnostic 卫星，均 ≤800 |
| F01-SIDE-01 | covered | CT-F01-009 WS 全 type + CT-F01-010 穷尽现 HTTP 写入口(仅 POST /upload) |
| F17-REQ-04 | covered | CT-F17-009：503 后 SSE 中断，attempt 可区分，部分正文与错误语义保留 |
| PER-ATTEMPT | covered | CT-F17-006 + CT-F17-009 同路径钉 503 与中断 |

## 实现要点

- 按真实职责切开：`runtime-types` 对外类型；`runtime-context` 项目域提示/skills；`runtime-execute` 主循环；`exec-query` 查询导出；`bad-case-runtime` 标记；`diagnostic-export` 诊断包。回放仍走已有 `replay-recorded`。
- 对外 API 未改：`AgentRuntime` 方法与再导出保持。
- 未改裁决语义、未改 UI/Rust、未 launchd:install 生产、未杀 PID 71847、未碰停放环境行、未 closed V2R。
- 现生产 HTTP 会写盘的只有 `POST /upload`；`GET /pdf` 只读。未知写路径 404。

## 建议通过点

拆文件按职责而非行数切片；HTTP 写入口按现生产路由穷尽；流式中断与 503 在同一真实 SSE 路径上可分 attempt。

## 建议打回点

- F01-SIDE-01 只穷尽当前 handleHttp 两条 pathname；若后续新增 HTTP 写入口须再扩矩阵。
- F17-REQ-04 的「503 后成功」仍由历史 V2R-04 承担；本批新测是 503 后中断。
- 内存队列进程单例、STO-07 合成大正文、F21 missing=记录不存在 等上一批判定保留。
- 停放环境行仍 uncovered；不得外推 WebKit / 原生设置页 / 生产 launchd。

人话状态：正在第 governance-impl-runtime-split-2026-09-09；已完成 runtime 拆文件、F01-SIDE-01 HTTP 穷尽、F17-REQ-04 流式中断；尚未完成停放环境行与其余 partial。
这次为什么停：冻结等待主模型验收。
下一步：主模型验收；通过则继续未停放合同。
是否需要用户：不需要。

## 计入文件

| 相对路径 | sha256 |
|---|---|
| `doc/CLAUDE.md` | `6718e8ba769e1ac7a4a6a3511faeff545e01f0c761cd5c46b66dc44b8ea29645` |
| `doc/诊断/CLAUDE.md` | `d20d6d0088c0183bb02167ace77d2daf2ed8b38a7fe9c8de17453bf61158b107` |
| `packages/agent-service/CLAUDE.md` | `31a88eec1d8129f3f28e10231db97be6a5d96203ce4794266bcb4a530ff66a3a` |
| `packages/agent-service/src/runtime/CLAUDE.md` | `f3ab3187282cb0a551bf12bb3bf65931d2b1886935f65820755724b122692261` |
| `packages/agent-service/tests/CLAUDE.md` | `171c5b8e191ef83d80bca1a023b174a8f7209fae10d4309fda98d55541851b69` |
| `packages/agent-service/tests/service/ct-f01-010.test.ts` | `05677e37acd8e6e5cb8159dddc885af6c77fde6bc726d3a986c1759f6c0c9cf5` |
| `packages/agent-service/tests/service/ct-f17-009.test.ts` | `935a15d4b29d2cbcdd4424eedf134b766ce8c62c9d9fac1e66df5ca93fbf1ffc` |

aggregate = `0ffb28a97eff155aa72fe79ea2f797efdcd8fe726369284c016e9d37bc002734`

算法：aggregate = SHA-256( concat(relpath + NUL + file_bytes) 按相对路径字典序 )。自身 hash 为第一个哈希分节标题之前的 UTF-8 字节。均不含业务 src，不含本报告。
## 报告自身哈希

去掉「## 报告自身哈希」之后的字节不计入自身 hash。

- 自身 hash: `f396bff270506b597b8c7567bf016303e7286d4731d14314013ab04616c52583`
- aggregate: `0ffb28a97eff155aa72fe79ea2f797efdcd8fe726369284c016e9d37bc002734`
