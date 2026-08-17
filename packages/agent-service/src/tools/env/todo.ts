/**
 * [INPUT]: core Tool / ToolContext.workspace
 * [OUTPUT]: createTodoTools —— todo_write(+ update_plan 兼容别名);草稿 drafts/todo.md
 * [POS]: §5.2 环境工具旁支;会话 checklist(见 doc/todo.md);≠ ProcessRow 工具流水账
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Tool, ToolResult } from '../../core/tool.ts'

export const TODO_PATH = 'drafts/todo.md'
/** @deprecated 旧计划落盘路径;新写入只用 TODO_PATH */
export const PLAN_PATH = 'drafts/plan.md'

export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface TodoItem {
  id: string
  content: string
  status: TodoStatus
  activeForm: string
}

export interface TodoList {
  todos: TodoItem[]
  /** 仅旧 update_plan 归约保留;新合同可不写 */
  title?: string
}

const STATUSES = new Set<TodoStatus>(['pending', 'in_progress', 'completed'])
const CONTENT_MAX = 200
const ACTIVE_MAX = 200
const TITLE_MAX = 120
const TODOS_MAX = 24

function bad(msg: string): ToolResult {
  return { llmContent: `error: ${msg}` }
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(1, max - 1))}…`
}

function mapStatus(raw: string): TodoStatus | null {
  if (raw === 'done') return 'completed' // 旧 plan
  if (STATUSES.has(raw as TodoStatus)) return raw as TodoStatus
  return null
}

/** 规范化 todo_write 入参;非法返回错误文案 */
export function normalizeTodos(raw: unknown): TodoList | string {
  if (!raw || typeof raw !== 'object') return '参数必须是对象'
  const o = raw as { todos?: unknown; title?: unknown }

  // 空表 = 清空(Removed 全部)
  if (Array.isArray(o.todos) && o.todos.length === 0) {
    const title = clip(String(o.title ?? ''), TITLE_MAX) || undefined
    return title ? { todos: [], title } : { todos: [] }
  }

  if (!Array.isArray(o.todos)) return 'todos 必须是数组'
  if (o.todos.length > TODOS_MAX) return `todos 过多(≤${TODOS_MAX})`

  const todos: TodoItem[] = []
  const seen = new Set<string>()
  let inProgress = 0
  for (let i = 0; i < o.todos.length; i++) {
    const s = o.todos[i]
    if (!s || typeof s !== 'object') return `todos[${i}] 非法`
    const row = s as {
      id?: unknown
      content?: unknown
      status?: unknown
      activeForm?: unknown
      label?: unknown // 旧 step
    }
    let id = String(row.id ?? '').trim() || `t${i + 1}`
    if (seen.has(id)) id = `${id}_${i + 1}`
    seen.add(id)
    const content = clip(String(row.content ?? row.label ?? ''), CONTENT_MAX)
    if (!content) return `todos[${i}].content 不能为空`
    const status = mapStatus(String(row.status ?? 'pending'))
    if (!status) return `todos[${i}].status 须为 pending|in_progress|completed`
    if (status === 'in_progress') inProgress += 1
    let activeForm = clip(String(row.activeForm ?? ''), ACTIVE_MAX)
    if (!activeForm) activeForm = clip(`正在${content}`, ACTIVE_MAX)
    todos.push({ id, content, status, activeForm })
  }
  if (inProgress > 1) return '同时至多一条 in_progress'
  const title = clip(String(o.title ?? ''), TITLE_MAX) || undefined
  return title ? { todos, title } : { todos }
}

/** 旧 update_plan { title, steps } → TodoList */
export function legacyPlanToTodos(raw: unknown): TodoList | string {
  if (!raw || typeof raw !== 'object') return '参数必须是对象'
  const o = raw as { title?: unknown; steps?: unknown; todos?: unknown }
  if (Array.isArray(o.todos)) return normalizeTodos(raw)
  const title = clip(String(o.title ?? ''), TITLE_MAX)
  if (!title) return 'title 不能为空'
  if (!Array.isArray(o.steps) || o.steps.length === 0) return 'steps 至少一步'
  const todos = o.steps.map((s, i) => {
    const row = (s && typeof s === 'object' ? s : {}) as {
      id?: unknown
      label?: unknown
      status?: unknown
    }
    return {
      id: String(row.id ?? `s${i + 1}`),
      content: String(row.label ?? ''),
      status: String(row.status ?? 'pending') === 'done' ? 'completed' : String(row.status ?? 'pending'),
      activeForm: '',
    }
  })
  return normalizeTodos({ title, todos })
}

export function todoToMarkdown(list: TodoList): string {
  const title = list.title?.trim() || 'Todo'
  const done = completedCount(list)
  const n = list.todos.length
  const lines = [`# ${title}`, '', `进度: ${done}/${n}`, '']
  for (const t of list.todos) {
    const mark = t.status === 'completed' ? 'x' : ' '
    const tag = t.status === 'in_progress' ? ` *(${t.activeForm})*` : ''
    lines.push(`- [${mark}] ${t.content}${tag}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function completedCount(list: TodoList): number {
  return list.todos.filter((t) => t.status === 'completed').length
}

async function persistAndReply(list: TodoList, ctx: Parameters<Tool['run']>[1]): Promise<ToolResult> {
  const md = todoToMarkdown(list)
  const done = completedCount(list)
  const n = list.todos.length
  if (ctx.workspace) {
    try {
      await ctx.workspace.writeFile(TODO_PATH, md)
    } catch (e) {
      return bad(`写入 ${TODO_PATH} 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const pathNote = ctx.workspace ? `;已写入 ${TODO_PATH}` : ''
  const head = list.title?.trim() ? `「${list.title.trim()}」` : ''
  return {
    llmContent: `Todo 已更新${head} ${done}/${n}${pathNote}\n` + JSON.stringify(list),
    data: { todo: list, path: ctx.workspace ? TODO_PATH : null },
  }
}

export function createTodoTools(): Tool[] {
  const todoWrite: Tool = {
    spec: {
      name: 'todo_write',
      description:
        '创建或覆盖当前会话的 Todo 进度清单(复杂多步工作用)。' +
        '传入完整 todos 数组(整表覆盖);不需要的项直接省略(=Removed)。' +
        '状态:pending|in_progress|completed;同时至多一条 in_progress。' +
        '每项须 content(祈使)与 activeForm(进行中短句)。' +
        '简单一两步问答不要用。结果回灌线程并写入 drafts/todo.md。',
      parameters: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            description: '完整 Todo 列表(整表覆盖;空数组=清空)',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: '可选稳定 id' },
                content: { type: 'string', description: '祈使句,如「跑测试」' },
                status: {
                  type: 'string',
                  description: 'pending | in_progress | completed',
                  enum: ['pending', 'in_progress', 'completed'],
                },
                activeForm: { type: 'string', description: '进行中短句,如「正在跑测试」' },
              },
              required: ['content', 'status', 'activeForm'],
            },
          },
        },
        required: ['todos'],
      },
    },
    run: async (args, ctx): Promise<ToolResult> => {
      const normalized = normalizeTodos(args)
      if (typeof normalized === 'string') return bad(normalized)
      return persistAndReply(normalized, ctx)
    },
  }

  // 兼容旧模型 / 历史习惯:入参仍为 title+steps,内部转 Todo
  const updatePlanCompat: Tool = {
    spec: {
      name: 'update_plan',
      description:
        '【兼容旧名】请改用 todo_write。仍接受 title+steps,内部转为会话 Todo。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                status: {
                  type: 'string',
                  enum: ['pending', 'in_progress', 'done', 'completed'],
                },
              },
              required: ['label', 'status'],
            },
          },
          todos: {
            type: 'array',
            items: { type: 'object' },
          },
        },
      },
    },
    run: async (args, ctx): Promise<ToolResult> => {
      const normalized = legacyPlanToTodos(args)
      if (typeof normalized === 'string') return bad(normalized)
      return persistAndReply(normalized, ctx)
    },
  }

  return [todoWrite, updatePlanCompat]
}

/** @deprecated 用 createTodoTools */
export function createPlanTools(): Tool[] {
  return createTodoTools()
}
