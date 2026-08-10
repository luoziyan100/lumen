/**
 * [OUTPUT]: subagent 模块出口（T0+T1）
 * [POS]: 子 Agent 协议/存储/协调/reminder/ToolKind/Resolution
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
export * from './types.ts'
export { SubagentStore } from './store.ts'
export { SubagentCoordinator } from './coordinator.ts'
export {
  drainCompletionReminder,
  consumeCompletionReminder,
  rehydrateUnconsumedReminders,
  dedupeKey,
} from './reminder.ts'
export {
  TOOL_KIND_BY_NAME,
  kindOf,
  filterToolsForChild,
  isWriteCapableToolset,
} from './tool-kind.ts'
export {
  BUILTIN_DEFINITIONS,
  listBuiltinNames,
  resolveAgentDefinition,
  buildChildTools,
  assertExploreReadOnly,
  type AgentDefinition,
} from './resolution.ts'
