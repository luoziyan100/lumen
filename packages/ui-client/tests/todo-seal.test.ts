/**
 * [INPUT]: sealOpenTodos / reduce 终态
 * [POS]: HDD AT — task done 后 Todo 不得假 in_progress
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sealOpenTodos,
  reduceUserFacingItems,
  type ChatItem,
  type TodoChatItem,
} from '../src/useAgent.ts'
import type { TaskEvent } from '../src/agent-client.ts'

function ev(kind: string, id: string, payload: Record<string, unknown>): { event: TaskEvent; p: Record<string, unknown> } {
  return {
    event: {
      id,
      task_id: 't',
      seq: 1,
      kind,
      payload_json: JSON.stringify(payload),
      created_at: new Date().toISOString(),
    },
    p: payload,
  }
}

function applyUser(items: ChatItem[], kind: string, id: string, p: Record<string, unknown>): ChatItem[] {
  const { event, p: payload } = ev(kind, id, p)
  return reduceUserFacingItems(items, event, payload)
}

const openTodo: TodoChatItem = {
  kind: 'todo',
  id: 'todo-1',
  todos: [
    { id: 't1', content: 'A', status: 'completed', activeForm: 'A' },
    { id: 't2', content: 'B', status: 'completed', activeForm: 'B' },
    { id: 't3', content: '整理最终清单', status: 'in_progress', activeForm: '正在整理最终清单' },
  ],
}

describe('sealOpenTodos', () => {
  it('AT1: 把 in_progress/pending 标 completed', () => {
    const sealed = sealOpenTodos([openTodo])
    const t = sealed.find((i): i is TodoChatItem => i.kind === 'todo')
    assert.ok(t)
    assert.equal(t.todos.every((x) => x.status === 'completed'), true)
  })

  it('AT2: 全 completed 时返回同一引用', () => {
    const full: ChatItem[] = [{
      kind: 'todo',
      id: 'todo-1',
      todos: [{ id: 't1', content: 'A', status: 'completed', activeForm: 'A' }],
    }]
    assert.equal(sealOpenTodos(full), full)
  })
})

describe('reply/done 收口 Todo (task-5bacbbc0 回归)', () => {
  it('AT3: reply 后无 in_progress', () => {
    let u: ChatItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', content: '搜' },
      openTodo,
      { kind: 'msg', id: 'a1', role: 'assistant', content: '汇总完毕。' },
    ]
    u = applyUser(u, 'reply', 'r1', { reply: '汇总完毕。' })
    const t = u.find((i): i is TodoChatItem => i.kind === 'todo')
    assert.ok(t)
    assert.equal(t.todos.filter((x) => x.status === 'in_progress').length, 0)
    assert.equal(t.todos.filter((x) => x.status === 'completed').length, 3)
  })

  it('AT4: status_change done 后无 in_progress', () => {
    let u: ChatItem[] = [openTodo]
    u = applyUser(u, 'status_change', 's1', { to: 'done' })
    const t = u.find((i): i is TodoChatItem => i.kind === 'todo')
    assert.ok(t)
    assert.equal(t.todos.every((x) => x.status === 'completed'), true)
  })
})
