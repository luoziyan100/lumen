/**
 * [INPUT]: useAgent.parseAskUserQuestions
 * [OUTPUT]: 断言 UI 侧题目解析宽松但拒非法
 * [POS]: ask_user Dialog 入参契约
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseAskUserQuestions } from '../src/useAgent.ts'

describe('parseAskUserQuestions', () => {
  it('解析合法 questions', () => {
    const q = parseAskUserQuestions({
      questions: [{
        id: 'scope',
        header: '范围',
        question: '做多大?',
        options: [
          { label: '小', description: '一篇' },
          { label: '大' },
        ],
      }],
    })
    assert.ok(q)
    assert.equal(q[0]?.id, 'scope')
    assert.equal(q[0]?.options.length, 2)
  })

  it('拒选项不足', () => {
    assert.equal(
      parseAskUserQuestions({
        questions: [{ question: 'x', options: [{ label: 'only' }] }],
      }),
      null,
    )
  })
})
