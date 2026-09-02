/**
 * [INPUT]: tool-kind + resolution (T1)
 * [OUTPUT]: capability 格过滤 / builtin explore 只读 / Task prune
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Tool } from '../../src/core/tool.ts'
import {
  kindOf,
  filterToolsForChild,
  isWriteCapableToolset,
} from '../../src/subagent/tool-kind.ts'
import {
  resolveAgentDefinition,
  buildChildTools,
  assertExploreReadOnly,
  listBuiltinNames,
  meetCapability,
} from '../../src/subagent/index.ts'

function fakeTool(name: string): Tool {
  return {
    spec: { name, description: name, parameters: { type: 'object', properties: {} } },
    run: async () => ({ llmContent: 'ok' }),
  }
}

const ALL_NAMES = [
  'read_file', 'write_file', 'edit_file', 'list_dir', 'grep', 'glob',
  'run_code', 'run_skill', 'install_skill', 'search_papers', 'search_web', 'get_citations',
  'fetch_url', 'extract_pdf', 'look_at_image', 'read_memory', 'write_memory',
  'todo_write', 'update_plan', 'ask_user',
  'spawn_subagent', 'get_subagent_output', 'kill_subagent',
]

const allTools = ALL_NAMES.map(fakeTool)

test('kindOf 登记表覆盖主要工具', () => {
  assert.equal(kindOf('read_file'), 'Read')
  assert.equal(kindOf('write_file'), 'Write')
  assert.equal(kindOf('install_skill'), 'Write')
  assert.equal(kindOf('run_code'), 'Execute')
  assert.equal(kindOf('spawn_subagent'), 'Task')
  assert.equal(kindOf('get_subagent_output'), 'TaskControl')
  assert.equal(kindOf('ask_user'), 'AskUser')
  assert.equal(kindOf('not_a_real_tool'), 'Unknown')
})

test('filterToolsForChild: RO 无 Write/Execute/Task/AskUser', () => {
  const out = filterToolsForChild(allTools, { capability: 'read-only', allowNested: false })
  const names = out.map((t) => t.spec.name)
  assert.ok(names.includes('read_file'))
  assert.ok(names.includes('grep'))
  assert.ok(!names.includes('write_file'))
  assert.ok(!names.includes('run_code'))
  assert.ok(!names.includes('spawn_subagent'))
  assert.ok(!names.includes('get_subagent_output'), '无 Task 应 prune TaskControl')
  assert.ok(!names.includes('ask_user'))
})

test('filterToolsForChild: RW ∩ 无 Execute；无 Task', () => {
  const out = filterToolsForChild(allTools, { capability: 'read-write', allowNested: true })
  const names = out.map((t) => t.spec.name)
  assert.ok(names.includes('write_file') && names.includes('edit_file'))
  assert.ok(!names.includes('run_code'))
  assert.ok(!names.includes('spawn_subagent'), 'RW 即使 allowNested 也无 Task')
  assert.ok(!names.includes('kill_subagent'))
})

test('filterToolsForChild: Execute 无 Write；无 Task', () => {
  const out = filterToolsForChild(allTools, { capability: 'execute', allowNested: false })
  const names = out.map((t) => t.spec.name)
  assert.ok(names.includes('run_code'))
  assert.ok(!names.includes('write_file'))
  assert.ok(!names.includes('spawn_subagent'))
})

test('filterToolsForChild: all + allowNested 保留 Task+TaskControl', () => {
  const out = filterToolsForChild(allTools, { capability: 'all', allowNested: true })
  const names = out.map((t) => t.spec.name)
  assert.ok(names.includes('spawn_subagent'))
  assert.ok(names.includes('get_subagent_output'))
  assert.ok(!names.includes('ask_user'))
})

test('filterToolsForChild: all + !allowNested 剥 Task 与 TaskControl', () => {
  const out = filterToolsForChild(allTools, { capability: 'all', allowNested: false })
  const names = out.map((t) => t.spec.name)
  assert.ok(!names.includes('spawn_subagent'))
  assert.ok(!names.includes('get_subagent_output'))
  assert.ok(names.includes('write_file'))
})

test('Unknown kind fail-closed', () => {
  const mystery = fakeTool('mystery_tool_xyz')
  const out = filterToolsForChild([mystery, fakeTool('read_file')], {
    capability: 'all',
    allowNested: false,
  })
  assert.deepEqual(out.map((t) => t.spec.name), ['read_file'])
})

test('buildChildTools explore 只读硬约束', () => {
  const def = resolveAgentDefinition('explore')!
  const { tools, effectiveCapability } = buildChildTools(allTools, def, null, 'all')
  assert.equal(effectiveCapability, 'read-only')
  assertExploreReadOnly(tools)
  assert.ok(!isWriteCapableToolset(tools))
})

test('buildChildTools spawn capability 与 definition meet', () => {
  const def = resolveAgentDefinition('general-purpose')!
  const { tools, effectiveCapability } = buildChildTools(allTools, def, 'read-only', 'all')
  assert.equal(effectiveCapability, 'read-only')
  assert.ok(!tools.some((t) => t.spec.name === 'write_file'))
})

test('buildChildTools RW spawn ∩ Execute definition → RO', () => {
  const def = { ...resolveAgentDefinition('general-purpose')!, defaultCapability: 'execute' as const }
  const { effectiveCapability } = buildChildTools(allTools, def, 'read-write', 'all')
  assert.equal(effectiveCapability, meetCapability('read-write', 'execute'))
  assert.equal(effectiveCapability, 'read-only')
})

test('listBuiltinNames 含 explore/plan/gp 与研究三角', () => {
  const names = listBuiltinNames()
  for (const n of ['explore', 'plan', 'general-purpose', 'searcher', 'reader', 'verifier']) {
    assert.ok(names.includes(n), n)
  }
})
