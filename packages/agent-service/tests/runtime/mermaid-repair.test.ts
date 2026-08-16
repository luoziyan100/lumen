/**
 * [INPUT]: mermaid-repair Phase B 纯核
 * [OUTPUT]: 抽围栏 / 限次 / 禁令文案
 * [POS]: doc/mermaid-pipeline.md AT-B + §4.3
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRepairMessages,
  extractMermaidBody,
  hashMermaidSource,
  MermaidRepairGate,
  REPAIR_SYSTEM,
} from '../../src/runtime/mermaid-repair.ts'

describe('extractMermaidBody', () => {
  it('抽第一个 mermaid 围栏', () => {
    const text = '废话\n```mermaid\nflowchart TB\n  A-->B\n```\n后文'
    assert.equal(extractMermaidBody(text), 'flowchart TB\n  A-->B')
  })

  it('无围栏但 kind 行开头则整段收下', () => {
    const text = 'flowchart TB\n  A["入口"] --> B'
    assert.equal(extractMermaidBody(text), text)
  })

  it('散文拒绝', () => {
    assert.equal(extractMermaidBody('好的，这是你要的图'), null)
  })
})

describe('MermaidRepairGate', () => {
  it('同 task+原文只许一次', () => {
    const g = new MermaidRepairGate()
    const src = 'flowchart TB\n  A["x" --> B'
    assert.equal(g.consume('t1', src), true)
    assert.equal(g.consume('t1', src), false)
    assert.equal(g.consume('t2', src), true)
  })

  it('hash 稳定', () => {
    assert.equal(hashMermaidSource('abc'), hashMermaidSource('abc'))
    assert.notEqual(hashMermaidSource('abc'), hashMermaidSource('abd'))
  })
})

describe('buildRepairMessages', () => {
  it('含 §4.3 三条禁令', () => {
    const msgs = buildRepairMessages('flowchart TB\n  A', '第 2 行附近 · 括号')
    assert.equal(msgs[0]?.role, 'system')
    assert.match(REPAIR_SYSTEM, /只修正 Mermaid \*\*语法\*\*|只修正 Mermaid 语法/)
    assert.match(msgs[0]!.content, /只修正 Mermaid 语法/)
    assert.match(msgs[0]!.content, /不要重写围栏外的研究结论/)
    assert.match(msgs[0]!.content, /只输出一个 ```mermaid/)
    assert.match(msgs[1]!.content, /第 2 行/)
    assert.match(msgs[1]!.content, /flowchart TB/)
  })
})
