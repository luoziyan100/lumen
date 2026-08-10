/**
 * [OUTPUT]: subagent 模块出口（T0）
 * [POS]: 子 Agent 协议/存储/协调/reminder
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
