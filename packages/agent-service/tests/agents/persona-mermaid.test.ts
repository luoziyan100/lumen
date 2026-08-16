/**
 * [INPUT]: LUMEN_PERSONA 可视化段
 * [OUTPUT]: AT5 安全子集在;「短 ID + 长标签」不在
 * [POS]: doc/mermaid-readability.md
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

  it('不再邀请长标签进节点', () => {
    assert.doesNotMatch(LUMEN_PERSONA, /短 ID \+ 长标签/)
  })
})
