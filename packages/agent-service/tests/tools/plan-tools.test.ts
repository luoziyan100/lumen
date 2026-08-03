/**
 * update_plan 规范化与落盘。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import {
  createPlanTools,
  normalizePlan,
  planToMarkdown,
  PLAN_PATH,
} from '../../src/tools/env/plan-tools.ts'
import { FsWorkspace } from '../../src/workspace/fs-workspace.ts'
import type { ToolContext } from '../../src/core/tool.ts'

describe('normalizePlan', () => {
  it('规范化 steps 与默认 id', () => {
    const p = normalizePlan({
      title: '  实现计划  ',
      steps: [
        { label: '查数据流', status: 'done' },
        { id: 's2', label: '改 schema', status: 'in_progress' },
      ],
    })
    assert.ok(typeof p !== 'string')
    assert.equal(p.title, '实现计划')
    assert.equal(p.steps[0]?.id, 's1')
    assert.equal(p.steps[1]?.status, 'in_progress')
  })

  it('拒空 title / 非法 status', () => {
    assert.equal(typeof normalizePlan({ title: '', steps: [{ label: 'a', status: 'pending' }] }), 'string')
    assert.equal(
      typeof normalizePlan({ title: 'T', steps: [{ label: 'a', status: 'nope' }] }),
      'string',
    )
  })
})

describe('update_plan tool', () => {
  it('写 drafts/plan.md 并回灌 JSON', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lumen-plan-'))
    const ws = new FsWorkspace({ root })
    const [tool] = createPlanTools()
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
          { id: 'a', label: 'Inspect the current data flow.', status: 'done' },
          { id: 'b', label: 'Update the response schema.', status: 'done' },
          { id: 'c', label: 'Add coverage for edge cases.', status: 'in_progress' },
          { id: 'd', label: 'Run checks and prepare the result.', status: 'pending' },
        ],
      },
      ctx,
    )
    assert.match(out.llmContent, /2\/4/)
    assert.ok(out.data && typeof out.data === 'object')
    const md = readFileSync(path.join(root, PLAN_PATH), 'utf8')
    assert.match(md, /# Implementation plan/)
    assert.match(md, /\[x\] Inspect/)
    assert.match(md, /进行中/)
    assert.ok(planToMarkdown((out.data as { plan: { title: string } }).plan).includes('Implementation'))
  })
})
