import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { elapsedMs, formatElapsed } from '../src/elapsedLabel.ts'
import { partitionProcessSteps, stepChip, PROCESS_RECENT_KEEP } from '../src/processSteps.ts'
import type { ProcStep } from '../src/useAgent.ts'

describe('formatElapsed', () => {
  it('under 60s keeps one decimal and s suffix', () => {
    assert.equal(formatElapsed(3200), '3.2s')
    assert.equal(formatElapsed(12_400), '12.4s')
  })
  it('minutes use m + one-decimal s', () => {
    assert.equal(formatElapsed(72_000), '1m 12.0s')
    assert.equal(formatElapsed(2_811_500), '46m 51.5s')
  })
})

describe('elapsedMs', () => {
  it('returns null without start', () => {
    assert.equal(elapsedMs(undefined), null)
  })
  it('uses endedAt when given', () => {
    const ms = elapsedMs('2026-08-13T00:00:00.000Z', '2026-08-13T00:00:04.000Z')
    assert.equal(ms, 4000)
  })
})

describe('partitionProcessSteps', () => {
  const steps = Array.from({ length: 20 }, (_, i) => ({
    id: `s${i}`,
    name: 'web_search',
    done: i < 19,
    label: `网页搜索 ${i}`,
  })) satisfies ProcStep[]

  it('windows to last N when collapsed', () => {
    const { hidden, visible } = partitionProcessSteps(steps, false)
    assert.equal(hidden, 20 - PROCESS_RECENT_KEEP)
    assert.equal(visible.length, PROCESS_RECENT_KEEP)
    assert.equal(visible[0]?.id, 's14')
    assert.equal(visible[visible.length - 1]?.id, 's19')
  })

  it('showAll reveals the full list', () => {
    const { hidden, visible } = partitionProcessSteps(steps, true)
    assert.equal(hidden, 0)
    assert.equal(visible.length, 20)
  })
})

describe('stepChip', () => {
  it('takes the basename of a path', () => {
    assert.equal(stepChip({
      id: '1', name: 'read_file', done: true, label: '读取文件', path: 'notes/clark2013.md',
    }), 'clark2013.md')
  })
})
