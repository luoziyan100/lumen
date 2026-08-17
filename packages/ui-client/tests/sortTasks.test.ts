/**
 * [INPUT]: sortTasks
 * [OUTPUT]: 钉档 / pinned_at / 未钉 updated_at 序断言
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compareTasksForSidebar, sortTasksForSidebar } from '../src/sessions/sortTasks.ts'

describe('sortTasksForSidebar', () => {
  it('钉档在上;钉内按 pinned_at 新者上;未钉按 updated_at', () => {
    const a = { id: 'a', pinned_at: null, created_at: '2026-01-03T00:00:00Z', updated_at: '2026-01-03T00:00:00Z' }
    const b = { id: 'b', pinned_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-08T00:00:00Z' }
    const c = { id: 'c', pinned_at: '2026-01-02T00:00:00Z', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
    const d = { id: 'd', pinned_at: null, created_at: '2026-01-04T00:00:00Z', updated_at: '2026-01-04T00:00:00Z' }
    assert.deepEqual(
      sortTasksForSidebar([a, b, c, d]).map((t) => t.id),
      ['c', 'b', 'd', 'a'],
    )
    assert.ok(compareTasksForSidebar(c, b) < 0)
  })

  it('未钉只看 updated_at,不看 created_at;钉档不跟活跃跳', () => {
    const oldCreatedHot = {
      id: 'hot', pinned_at: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-10T00:00:00Z',
    }
    const newCreatedCold = {
      id: 'cold', pinned_at: null,
      created_at: '2026-01-09T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
    }
    const pinnedStale = {
      id: 'pin', pinned_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }
    assert.deepEqual(
      sortTasksForSidebar([newCreatedCold, oldCreatedHot, pinnedStale]).map((t) => t.id),
      ['pin', 'hot', 'cold'],
    )
  })
})
