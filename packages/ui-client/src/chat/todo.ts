/**
 * [INPUT]: ChatItem / TodoEntry;tool_call.args 与 tool_result.llmContent
 * [OUTPUT]: isTodoTool / todoFromToolArgs / todoFromLlmContent / upsertTodo / safeParse
 * [POS]: 对话归约的 Todo 旁路;reduce.ts 在 todo_write/update_plan 分支调用,不内嵌解析
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { ChatItem, TodoChatItem, TodoEntry, TodoStatus } from './types.ts'

const TODO_STATUSES = new Set<TodoStatus>(['pending', 'in_progress', 'completed'])
export const isTodoTool = (name: string): boolean => name === 'todo_write' || name === 'update_plan'

export function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown> } catch { return {} }
}

function mapTodoStatus(raw: string): TodoStatus | null {
  if (raw === 'done') return 'completed'
  if (TODO_STATUSES.has(raw as TodoStatus)) return raw as TodoStatus
  return null
}

function coerceTodoList(raw: unknown): { title?: string; todos: TodoEntry[] } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { title?: unknown; todos?: unknown; steps?: unknown; todo?: unknown }
  // tool_result data 包一层 { todo: {...} }
  if (o.todo && typeof o.todo === 'object') return coerceTodoList(o.todo)

  const title = String(o.title ?? '').trim() || undefined
  let rows: unknown[] | null = null
  if (Array.isArray(o.todos)) rows = o.todos
  else if (Array.isArray(o.steps)) rows = o.steps
  if (!rows) return null
  if (rows.length === 0) return { title, todos: [] }

  const todos: TodoEntry[] = []
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i]
    if (!s || typeof s !== 'object') continue
    const row = s as {
      id?: unknown
      content?: unknown
      label?: unknown
      status?: unknown
      activeForm?: unknown
    }
    const content = String(row.content ?? row.label ?? '').trim()
    if (!content) continue
    const status = mapTodoStatus(String(row.status ?? 'pending'))
    if (!status) continue
    const activeForm = String(row.activeForm ?? '').trim() || `正在${content}`
    todos.push({ id: String(row.id ?? `t${i + 1}`), content, status, activeForm })
  }
  if (!todos.length && rows.length > 0) return null
  return { title, todos }
}

export function todoFromToolArgs(args: unknown): { title?: string; todos: TodoEntry[] } | null {
  if (typeof args === 'string') return coerceTodoList(safeParse(args))
  return coerceTodoList(args)
}

/** tool_result.llmContent 末尾的 JSON Todo */
export function todoFromLlmContent(text: string): { title?: string; todos: TodoEntry[] } | null {
  const i = text.lastIndexOf('{')
  if (i < 0) return null
  try {
    return coerceTodoList(JSON.parse(text.slice(i)))
  } catch {
    return null
  }
}

export function upsertTodo(
  prev: ChatItem[],
  eventId: string,
  list: { title?: string; todos: TodoEntry[] },
): ChatItem[] {
  // 空表 = Removed 全部 → 从对话流拿掉
  if (list.todos.length === 0) {
    return prev.filter((it) => it.kind !== 'todo')
  }
  const existing = prev.find((it): it is TodoChatItem => it.kind === 'todo')
  const item: TodoChatItem = {
    kind: 'todo',
    id: existing?.id ?? `todo-${eventId}`,
    title: list.title,
    todos: list.todos,
  }
  if (existing) {
    return prev.map((it) => (it.kind === 'todo' ? item : it))
  }
  return [...prev, item]
}
