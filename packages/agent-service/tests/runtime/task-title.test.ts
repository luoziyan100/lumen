/**
 * [INPUT]: task-title 纯函数
 * [OUTPUT]: extract / sanitize / shouldBackfill 断言
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  extractTitleSource,
  sanitizeGeneratedTitle,
  shouldBackfillTitle,
} from '../../src/runtime/task-title.ts'
import type { TaskEvent } from '../../src/storage/task-store.ts'

function ev(kind: string, payload: unknown, seq: number): TaskEvent {
  return {
    id: `e-${seq}`,
    task_id: 't1',
    seq,
    kind,
    payload_json: JSON.stringify(payload),
    agent_role: 'main',
    created_at: new Date().toISOString(),
  }
}

describe('task-title', () => {
  it('跳过空 reply,取后续非空', () => {
    const events = [
      ev('user', { content: '你可视化展示一下，什么叫Agent' }, 1),
      ev('reply', { reply: '' }, 2),
      ev('reply', { reply: 'Agent 是感知环境并行动的系统。' }, 3),
    ]
    const src = extractTitleSource(events)
    assert.ok(src)
    assert.match(src!.assistant, /感知环境/)
  })

  it('sanitize 拒口语套话长句', () => {
    assert.equal(sanitizeGeneratedTitle('请问帮我深度研究一下', 'goal'), null)
    const ok = sanitizeGeneratedTitle('容器排水漩涡成因', '有一个问题就是为什么...')
    assert.equal(ok, '容器排水漩涡成因')
  })

  it('shouldBackfill 仅偏长 goal 且无 title', () => {
    assert.equal(shouldBackfillTitle({ goal: '短标题', title: null }), false)
    assert.equal(shouldBackfillTitle({ goal: '你可视化展示一下，什么叫Agent', title: null }), true)
    assert.equal(shouldBackfillTitle({ goal: '你可视化展示一下，什么叫Agent', title: '已有' }), false)
  })
})
