# 会话 Todo（进度清单）

状态: **现行**（2026-08-08）

> 取代 `plan-card.md`（计划卡）。产品真名 Todo，不是人审大 Plan。

## 问题

复杂多步工作时，用户需要看见「还剩几步 / 正在做哪步」；模型需要可回灌的进度契约。旧 `update_plan` 心智偏「实现计划」，与 Claude 式会话 checklist 及右轨 Progress 不对齐。

## 决策

1. **一等工具 `todo_write`**：整表覆盖会话 Todo；每次结果作为 `tool_result` 回灌同一条线程（铁律）。
2. **状态枚举（官方字段）**：`pending` | `in_progress` | `completed`。
3. **生命周期叙事**：Created→`pending`；Activated→`in_progress`；Completed→`completed`；**Removed** = 下次整表省略该项（不引入 `deleted`）。
4. **硬纪律**：同时至多一条 `in_progress`；每项须有 `content` + `activeForm`。
5. **双写**：事件流 JSON；工作区 `drafts/todo.md`。
6. **UI**：右轨 **Progress** 为主呈现；对话流 Todo 卡次要；与 ProcessRow 分家（Todo ≠ 工具流水账）。
7. **兼容**：历史 `update_plan` 事件仍可归约；工具名 `update_plan` 仅作别名读入旧形状。

## 非目标

- Claude V2 `TaskCreate` / `TaskUpdate` / `status: deleted`
- 用户在 Progress 上打勾写回
- 独立项目管理实体、甘特、跨会话任务板

## 实现锚点

- 工具：`packages/agent-service/src/tools/env/todo-tools.ts`
- Persona：`packages/agent-service/src/agents/persona.ts`
- UI：`TodoCard` + `UtilityRail` Progress；`useAgent` 的 `kind: 'todo'`
