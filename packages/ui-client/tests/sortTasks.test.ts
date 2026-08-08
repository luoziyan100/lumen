/**
 * [INPUT]: sortTasks
 * [OUTPUT]: 钉档 / pinned_at / created_at 序断言
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compareTasksForSidebar, sortTasksForSidebar } from '../src/sortTasks.ts'

describe('sortTasksForSidebar', () => {
  it('钉档在上;钉内按 pinned_at 新者上;未钉按 created_at', () => {
    const a = { id: 'a', pinned_at: null, created_at: '2026-01-03T00:00:00Z' }
    const b = { id: 'b', pinned_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }
    const c = { id: 'c', pinned_at: '2026-01-02T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }
    const d = { id: 'd', pinned_at: null, created_at: '2026-01-04T00:00:00Z' }
    assert.deepEqual(
      sortTasksForSidebar([a, b, c, d]).map((t) => t.id),
      ['c', 'b', 'd', 'a'],
    )
    assert.ok(compareTasksForSidebar(c, b) < 0)
  })
})
