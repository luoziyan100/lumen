# Mastra 适配台账

状态: 现行，2026-11-10 建立。锁定 `@mastra/core 1.67.0`。每条记录框架行为差异、Lumen 的处置与验证方式；升级 Mastra 时逐条复核，能删的适配就删。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

## 框架缺陷（已复现）

| # | 现象 | 证据 | 当前处置 | 上游状态 |
|---|---|---|---|---|
| F1 | 原生 AgentController 下并行后台委派后，最终回复消息再次携带同一组 tool-invocation，重复 toolCallId 进入下一轮模型请求 | 正式库 2026-09-19 两组；`tests/tool-pairing.test.ts` 纯 Controller + 普通 Agent 复现（todo） | 未适配；Gemini 未报错，GPT 严格校验下有 400 风险 | 1.75.0 仍在，**1.76.0 起修复**（worktree 二分）；升级需迁移 pendingApprovals、model.switch、messageFilter、DisplayState wire 形状等破坏性变更 |
| F2 | 后台子专家的工作区工具经 `context.writer.custom` 发出的 `data-workspace-metadata` 写入父线程 | 完整应用用例 foreign=1；正式库同形 | 未适配；data-* 不进入模型请求，只占存储 | 未验证 |
| F3 | 因工具审批挂起（含按策略自动批准）的运行，trace 的 model_generation/model_step 不记录 usage 与 finishReason | 正式库 101/144 次运行挂起且全部缺 usage；可控用量下 Controller 计量 3×16=48 正确 | 不适配；计费、预算与界面用量不受影响，诊断中的跨度用量不完整 | 未验证 |

## 现有窄适配

| # | 框架行为 | Lumen 处置 | 位置 |
|---|---|---|---|
| A1 | 锁定版 Controller 把终态 TripWire 显示为完成 | 上下文/预算/空回复终态失败转普通 Error | `agents/guards/`、`agents/context.ts` |
| A2 | CompositeFilesystem 不支持根挂载回退 | 任务、资料、记忆各自独立 contained LocalFilesystem | `workspace/workspace.ts` |
| A3 | LibSQL 不支持 metrics 信号 | 不注册 metrics 导出 | `diagnostics/` |
| A4 | 原生恢复可在同一 run 内重置 step | 预算准入键包含 response messageId | `agents/budget/` |
| A5 | Controller 主统计不含专家步骤用量 | 专家用量按原生身份去重写入父 threadState | `agents/usage/` |

## 已核实不是问题

- 悬空 tool call 与孤儿结果：每次构建 prompt 由 `sanitizeOrphanedToolPairs` 剥离，正式库 3 处悬空调用未影响后续请求。
- 专家 `subAgentToolResults`：只随工具结果落库，同轮和跨轮的父模型请求都只收到专家正文与引用。
- 专家内部工具（list_task_files 等）不经 Controller 权限类别，实测无审批。
