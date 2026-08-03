/**
 * 对话轮次 rail 数据层。
 * npm test -w packages/ui-client
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { ChatItem } from '../src/useAgent.ts'
import { buildTurnRailItems, clipTurnText, msgAnchorId } from '../src/components/turnRail.ts'

describe('clipTurnText', () => {
  it('压空白并截断', () => {
    assert.equal(clipTurnText('a\n\nb', 10), 'a b')
    assert.equal(clipTurnText('abcdefghij', 5), 'abcd…')
  })
})

describe('buildTurnRailItems', () => {
  it('仅用户一轮 → 思考中', () => {
    const items: ChatItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', content: '你好' },
    ]
    const turns = buildTurnRailItems(items)
    assert.equal(turns.length, 1)
    assert.equal(turns[0]?.userMsgId, 'u1')
    assert.equal(turns[0]?.label, '你好')
    assert.equal(turns[0]?.description, '思考中…')
  })

  it('用户+process+助手:过程不占刻度,描述取最后助手', () => {
    const items: ChatItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', content: '查一下' },
      {
        kind: 'process',
        id: 'p1',
        running: false,
        steps: [{ id: 's1', name: 'web_search', done: true, label: '网页搜索 · 完成' }],
      },
      { kind: 'msg', id: 'a1', role: 'assistant', content: '第一版' },
      { kind: 'msg', id: 'a2', role: 'assistant', content: '最终答复在这里' },
    ]
    const turns = buildTurnRailItems(items)
    assert.equal(turns.length, 1)
    assert.equal(turns[0]?.description, '最终答复在这里')
  })

  it('多轮:上一轮无答标暂无回复;锚点 id', () => {
    const items: ChatItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', content: '第一问' },
      { kind: 'msg', id: 'u2', role: 'user', content: '第二问' },
      { kind: 'msg', id: 'a2', role: 'assistant', content: '第二答' },
      { kind: 'compaction', id: 'c1' },
    ]
    const turns = buildTurnRailItems(items)
    assert.equal(turns.length, 2)
    assert.equal(turns[0]?.description, '暂无回复')
    assert.equal(turns[1]?.label, '第二问')
    assert.equal(turns[1]?.description, '第二答')
    assert.equal(msgAnchorId(turns[1]!.id), 'msg-u2')
  })
})
