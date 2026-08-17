/**
 * [INPUT]: sidebarBuckets / expandedProjects
 * [OUTPUT]: 项目树 vs 最近分桶 + 展开态往返
 * [POS]: ui-client 测试;锁 M1 零感知与折叠持久化
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PROJECT_ID_PREFIX } from '../../agent-service/src/protocol/ids.ts'
import {
  isUserProjectId,
  tasksOutsideUserProjects,
  userProjects,
} from '../src/sessions/sidebarBuckets.ts'
import {
  EXPANDED_PROJECTS_KEY,
  loadExpandedProjectIds,
  saveExpandedProjectIds,
  toggleExpandedProjectId,
} from '../src/sessions/expandedProjects.ts'

describe('sidebarBuckets:不建项目零感知', () => {
  it('default 不是用户项目,不进树', () => {
    assert.equal(isUserProjectId('default'), false)
    assert.equal(isUserProjectId(`${PROJECT_ID_PREFIX}abc`), true)
    const tree = userProjects([
      { id: 'default', name: 'default' },
      { id: `${PROJECT_ID_PREFIX}1`, name: '论文' },
    ])
    assert.deepEqual(tree.map((p) => p.id), [`${PROJECT_ID_PREFIX}1`])
  })

  it('default 会话落最近;p-* 会话不进最近', () => {
    const recent = tasksOutsideUserProjects({
      default: [{ id: 't-old' }],
      [`${PROJECT_ID_PREFIX}1`]: [{ id: 't-proj' }],
    })
    assert.deepEqual(recent.map((t) => t.id), ['t-old'])
  })
})

describe('expandedProjects:往返 localStorage', () => {
  const mem = new Map<string, string>()
  const stub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v) },
    removeItem: (k: string) => { mem.delete(k) },
  }

  it('读写 + seed 当前项目 + 忽略非 p-*', () => {
    const prev = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: stub })
    mem.clear()
    try {
      const keep = `${PROJECT_ID_PREFIX}keep`
      const nowId = `${PROJECT_ID_PREFIX}now`
      saveExpandedProjectIds(new Set([keep, 'default']))
      const raw = JSON.parse(mem.get(EXPANDED_PROJECTS_KEY) ?? '[]') as string[]
      assert.ok(raw.includes(keep))
      const loaded = loadExpandedProjectIds(nowId)
      assert.equal(loaded.has(keep), true)
      assert.equal(loaded.has(nowId), true)
      assert.equal(loaded.has('default'), false)
      const toggled = toggleExpandedProjectId(loaded, keep)
      assert.equal(toggled.has(keep), false)
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prev })
    }
  })
})
