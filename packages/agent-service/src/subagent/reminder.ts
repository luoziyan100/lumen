/**
 * [INPUT]: SubagentStore + TaskStore.appendEvent；R1.2/R1.3 reminder 契约
 * [OUTPUT]: drain / consume / rehydrateUnconsumedReminders
 * [POS]: 完成提示投递;真源=subagents.reminder_consumed;events 只 append
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { TaskStore } from '../storage/task-store.ts'
import type { SubagentStore } from './store.ts'
import type { SubagentRecord } from './types.ts'
import { isTerminalStatus } from './types.ts'

export function dedupeKey(subagentId: string): string {
  return `scr:${subagentId}`
}

function reminderPayload(row: SubagentRecord): Record<string, unknown> {
  return {
    subagent_id: row.id,
    subagent_type: row.subagent_type,
    description: row.description,
    status: row.status,
    summary: row.completion_summary ?? `(subagent ${row.id} ${row.status})`,
    usage: { total_tokens: row.total_tokens },
    dedupe_key: dedupeKey(row.id),
  }
}

/**
 * 首次投递：仅当 surface && terminal && !reminder_consumed。
 * 不把 reminder_consumed 置 true（等 forModel 消费）。
 */
export function drainCompletionReminder(
  store: SubagentStore,
  taskStore: TaskStore,
  subagentId: string,
): boolean {
  const row = store.get(subagentId)
  if (!row) return false
  if (!row.surface_completion) return false
  if (!isTerminalStatus(row.status)) return false
  if (row.reminder_consumed) return false
  taskStore.appendEvent(row.parent_task_id, 'subagent_completion_reminder', reminderPayload(row), 'main')
  return true
}

/**
 * 父 turn forModel 实际带上 reminder 后调用。
 * UPDATE reminder_consumed + append consumed 事件（不改旧 reminder payload）。
 */
export function consumeCompletionReminder(
  store: SubagentStore,
  taskStore: TaskStore,
  subagentId: string,
  turnId: string,
): boolean {
  const row = store.get(subagentId)
  if (!row) return false
  if (row.reminder_consumed) return false
  const ok = store.setReminderConsumed(subagentId, true)
  if (!ok) return false
  taskStore.appendEvent(
    row.parent_task_id,
    'subagent_completion_reminder_consumed',
    { subagent_id: subagentId, turn_id: turnId, dedupe_key: dedupeKey(subagentId) },
    'main',
  )
  return true
}

/**
 * compaction 之后：按表 rehydrate，不扫事件流去重。
 */
export function rehydrateUnconsumedReminders(
  store: SubagentStore,
  taskStore: TaskStore,
  parentTaskId: string,
): number {
  const rows = store.listNeedingReminderRehydrate(parentTaskId)
  let n = 0
  for (const row of rows) {
    taskStore.appendEvent(parentTaskId, 'subagent_completion_reminder', reminderPayload(row), 'main')
    n += 1
  }
  return n
}
