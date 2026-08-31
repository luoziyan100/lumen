/**
 * [INPUT]: LUMEN_PERSONA 可视化段
 * [OUTPUT]: AT5 安全子集在;「短 ID + 长标签」不在
 * [POS]: doc/mermaid-readability.md
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { LUMEN_PERSONA } from '../../src/agents/persona.ts'

describe('AT5 persona mermaid safe subset', () => {
  it('含 TD/LR、引号、分支标签、短标题、先闭合', () => {
    assert.match(LUMEN_PERSONA, /flowchart TD/)
    assert.match(LUMEN_PERSONA, /flowchart LR/)
    assert.match(LUMEN_PERSONA, /节点\/边标签一律加双引号/)
    assert.match(LUMEN_PERSONA, /-- "是" -->/)
    assert.match(LUMEN_PERSONA, /≤15/)
    assert.match(LUMEN_PERSONA, /短标题/)
    assert.match(LUMEN_PERSONA, /解释写在围栏外/)
    assert.match(LUMEN_PERSONA, /先闭合再写边/)
    assert.match(LUMEN_PERSONA, /A\["标签"\] --> B/)
  })

  it('长链优先 TD,LR 留给短链或并列,渲染器不改方向', () => {
    assert.match(LUMEN_PERSONA, /较长链优先/)
    assert.match(LUMEN_PERSONA, /flowchart TD/)
    assert.match(LUMEN_PERSONA, /约 6 个及以上连续节点时优先 TD/)
    assert.match(LUMEN_PERSONA, /只用于短链、并列比较或天然横向关系/)
    assert.match(LUMEN_PERSONA, /渲染器不会改方向/)
    assert.doesNotMatch(LUMEN_PERSONA, /渲染器自动把 LR 改成 TD/)
    assert.doesNotMatch(LUMEN_PERSONA, /自动改方向/)
  })

  it('数学建议美元定界符,同时声明前端兼容 LaTeX 风格', () => {
    assert.match(LUMEN_PERSONA, /\$x\$/)
    assert.match(LUMEN_PERSONA, /\\\(\.\.\.\\\)/)
    assert.match(LUMEN_PERSONA, /不要把兼容责任推回模型/)
  })

  it('不再邀请长标签进节点', () => {
    assert.doesNotMatch(LUMEN_PERSONA, /短 ID \+ 长标签/)
  })
})
