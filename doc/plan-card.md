# 计划卡（复杂任务 Plan）

状态: **现行**（2026-08-02）

## 问题

复杂任务若只靠对话散文或工具流水账（ProcessRow），用户看不见「还剩几步」，模型也缺少可回灌的进度契约。

## 决策

1. **一等工具 `update_plan`**：创建/覆盖结构化计划；每次更新的结果作为 `tool_result` 回灌同一条线程（铁律）。
2. **双写**：事件流携带规范化 JSON（`ToolResult.data`）；工作区写 `drafts/plan.md`（会话目录下）。
3. **UI `PlanCard`**：从事件归约投影，不用 show-widget；与 ProcessRow 职责分离（计划 ≠ 工具回放）。
4. **触发纪律**：≥3 步或用户要求「按计划做」才建；简单问答不强制。

## 非目标（v1）

- 独立项目管理实体、用户绕过模型在卡片上打勾、甘特/子任务树。

## 实现锚点

- 工具：`packages/agent-service/src/tools/env/plan-tools.ts`
- Persona：`packages/agent-service/src/agents/persona.ts`
- UI：`packages/ui-client/src/components/PlanCard.tsx` + `useAgent` 的 `kind: 'plan'`
