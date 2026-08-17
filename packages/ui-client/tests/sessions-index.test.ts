/**
 * [INPUT]: paginate / querySessions / relativeTimeParts
 * [OUTPUT]: 会话页分页、搜索∩筛选、相对时间零件
 * [POS]: ui-client 测试;锁 sessions-index 合同
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { paginate, SESSIONS_PAGE_SIZE } from '../src/sessions/paginate.ts'
import { querySessions, sessionMatchesQuery } from '../src/sessions/sessionQuery.ts'
import { relativeTimeParts } from '../src/sessions/relativeTime.ts'

function task(partial: {
  id: string
  goal?: string
  title?: string | null
  project_id?: string
  status?: string
  pinned_at?: string | null
}): {
  id: string
  goal: string
  title?: string | null
  project_id: string
  status: string
  pinned_at?: string | null
} {
  return {
    goal: partial.goal ?? partial.id,
    project_id: 'default',
    status: 'done',
    ...partial,
  }
}

describe('paginate', () => {
  it('空列表 pageCount=0', () => {
    const r = paginate([], 3)
    assert.deepEqual(r.slice, [])
    assert.equal(r.page, 1)
    assert.equal(r.pageCount, 0)
  })

  it('恰 20 条一页、无第二页', () => {
    const items = Array.from({ length: SESSIONS_PAGE_SIZE }, (_, i) => i)
    const r = paginate(items, 1)
    assert.equal(r.pageCount, 1)
    assert.equal(r.slice.length, 20)
  })

  it('21 条两页且两页不交', () => {
    const items = Array.from({ length: 21 }, (_, i) => `t${i + 1}`)
    const a = paginate(items, 1)
    const b = paginate(items, 2)
    assert.equal(a.pageCount, 2)
    assert.equal(a.slice.length, 20)
    assert.deepEqual(b.slice, ['t21'])
    assert.equal(new Set([...a.slice, ...b.slice]).size, 21)
  })

  it('page 越界夹紧', () => {
    const items = [1, 2, 3]
    assert.equal(paginate(items, 0, 2).page, 1)
    assert.equal(paginate(items, 99, 2).page, 2)
  })
})

describe('sessionMatchesQuery', () => {
  it('空查询全过;标题或 goal 命中', () => {
    const t = task({ id: '1', title: 'LM Loss', goal: '替代方案草稿' })
    assert.equal(sessionMatchesQuery(t, ''), true)
    assert.equal(sessionMatchesQuery(t, 'loss'), true)
    assert.equal(sessionMatchesQuery(t, '草稿'), true)
    assert.equal(sessionMatchesQuery(t, '不存在的串'), false)
  })
})

describe('querySessions', () => {
  const rows = [
    task({ id: 'a', title: 'Alpha', project_id: 'p-1', status: 'running' }),
    task({ id: 'b', title: 'Beta', project_id: 'p-2', pinned_at: '2026-01-01T00:00:00Z' }),
    task({ id: 'c', title: 'Gamma', project_id: 'p-1', goal: 'other' }),
  ]

  it('项目筛不含其他项目', () => {
    const r = querySessions(rows, { query: '', filter: { type: 'project', projectId: 'p-1' } })
    assert.deepEqual(r.map((t) => t.id), ['a', 'c'])
  })

  it('搜索 ∩ 筛选', () => {
    const r = querySessions(rows, { query: 'alp', filter: { type: 'running' } })
    assert.deepEqual(r.map((t) => t.id), ['a'])
  })

  it('置顶筛', () => {
    const r = querySessions(rows, { query: '', filter: { type: 'pinned' } })
    assert.deepEqual(r.map((t) => t.id), ['b'])
  })
})

describe('relativeTimeParts', () => {
  const now = Date.parse('2026-08-17T12:00:00Z')
  it('分钟 / 小时 / 天 / 日期', () => {
    assert.equal(relativeTimeParts('2026-08-17T11:59:30Z', now).kind, 'justNow')
    assert.deepEqual(relativeTimeParts('2026-08-17T11:50:00Z', now), { kind: 'minutes', n: 10 })
    assert.deepEqual(relativeTimeParts('2026-08-17T09:00:00Z', now), { kind: 'hours', n: 3 })
    assert.deepEqual(relativeTimeParts('2026-08-15T12:00:00Z', now), { kind: 'days', n: 2 })
    assert.equal(relativeTimeParts('2026-07-01T00:00:00Z', now).kind, 'date')
  })
})
