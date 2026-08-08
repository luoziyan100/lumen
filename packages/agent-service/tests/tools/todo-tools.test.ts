/**
 * todo_write 规范化与落盘;兼容 update_plan。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import {
  createTodoTools,
  normalizeTodos,
  legacyPlanToTodos,
  todoToMarkdown,
  TODO_PATH,
} from '../../src/tools/env/todo-tools.ts'
import { FsWorkspace } from '../../src/workspace/fs-workspace.ts'
import type { ToolContext } from '../../src/core/tool.ts'

describe('normalizeTodos', () => {
  it('规范化 todos 与默认 id / activeForm', () => {
    const p = normalizeTodos({
      todos: [
        { content: '查数据流', status: 'completed', activeForm: '正在查数据流' },
        { id: 't2', content: '改 schema', status: 'in_progress', activeForm: '正在改 schema' },
      ],
    })
    assert.ok(typeof p !== 'string')
    assert.equal(p.todos[0]?.id, 't1')
    assert.equal(p.todos[1]?.status, 'in_progress')
  })

  it('拒双 in_progress / 非法 status', () => {
    assert.equal(
      typeof normalizeTodos({
        todos: [
          { content: 'a', status: 'in_progress', activeForm: 'A' },
          { content: 'b', status: 'in_progress', activeForm: 'B' },
        ],
      }),
      'string',
    )
    assert.equal(
      typeof normalizeTodos({ todos: [{ content: 'a', status: 'nope', activeForm: 'A' }] }),
      'string',
    )
  })

  it('空数组清空', () => {
    const p = normalizeTodos({ todos: [] })
    assert.ok(typeof p !== 'string')
    assert.equal(p.todos.length, 0)
  })
})

describe('legacyPlanToTodos', () => {
  it('title+steps+done → TodoList', () => {
    const p = legacyPlanToTodos({
      title: '  实现计划  ',
      steps: [
        { label: '查数据流', status: 'done' },
        { id: 's2', label: '改 schema', status: 'in_progress' },
      ],
    })
    assert.ok(typeof p !== 'string')
    assert.equal(p.title, '实现计划')
    assert.equal(p.todos[0]?.status, 'completed')
    assert.equal(p.todos[0]?.content, '查数据流')
    assert.ok(p.todos[1]?.activeForm)
  })
})

describe('todo_write tool', () => {
  it('写 drafts/todo.md 并回灌 JSON', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lumen-todo-'))
    const ws = new FsWorkspace({ root })
    const tools = createTodoTools()
    const tool = tools.find((t) => t.spec.name === 'todo_write')
    assert.ok(tool)
    const ctx = {
      taskId: 't1',
      agentRole: 'main',
      depth: 0,
      spawn: async () => ({ llmContent: '' }),
      emit: () => {},
      workspace: ws,
      deps: {},
    } satisfies ToolContext
    const out = await tool.run(
      {
        todos: [
          { id: 'a', content: 'Inspect the current data flow.', status: 'completed', activeForm: 'Inspecting data flow' },
          { id: 'b', content: 'Update the response schema.', status: 'completed', activeForm: 'Updating schema' },
          { id: 'c', content: 'Add coverage for edge cases.', status: 'in_progress', activeForm: 'Adding coverage' },
          { id: 'd', content: 'Run checks and prepare the result.', status: 'pending', activeForm: 'Running checks' },
        ],
      },
      ctx,
    )
    assert.match(out.llmContent, /2\/4/)
    assert.ok(out.data && typeof out.data === 'object')
    const md = readFileSync(path.join(root, TODO_PATH), 'utf8')
    assert.match(md, /# Todo/)
    assert.match(md, /\[x\] Inspect/)
    assert.match(md, /Adding coverage/)
    assert.ok(todoToMarkdown((out.data as { todo: { todos: unknown[] } }).todo).includes('Inspect'))
  })
})

describe('update_plan compat', () => {
  it('旧入参仍落盘 todo.md', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lumen-plan-compat-'))
    const ws = new FsWorkspace({ root })
    const tool = createTodoTools().find((t) => t.spec.name === 'update_plan')
    assert.ok(tool)
    const ctx = {
      taskId: 't1',
      agentRole: 'main',
      depth: 0,
      spawn: async () => ({ llmContent: '' }),
      emit: () => {},
      workspace: ws,
      deps: {},
    } satisfies ToolContext
    const out = await tool.run(
      {
        title: 'Implementation plan',
        steps: [
          { id: 'a', label: 'Inspect', status: 'done' },
          { id: 'b', label: 'Ship', status: 'pending' },
        ],
      },
      ctx,
    )
    assert.match(out.llmContent, /1\/2/)
    const md = readFileSync(path.join(root, TODO_PATH), 'utf8')
    assert.match(md, /Implementation plan/)
  })
})
