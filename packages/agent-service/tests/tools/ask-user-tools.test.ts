/**
 * ask_user 规范化与挂起解开(真实 tool.run + 内存 waiter)。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createAskUserTools,
  formatAskUserResult,
  normalizeAskUserArgs,
  type AskUserAnswer,
  type AskUserQuestion,
} from '../../src/tools/env/ask-user-tools.ts'
import type { ToolContext } from '../../src/core/tool.ts'

const sampleQ: AskUserQuestion[] = [
  {
    id: 'q1',
    question: '用哪份语料?',
    options: [
      { label: 'Nature 上周', description: '推荐' },
      { label: '本地库' },
    ],
  },
]

describe('normalizeAskUserArgs', () => {
  it('接受 1–3 题并补默认 id', () => {
    const n = normalizeAskUserArgs({
      questions: [
        {
          question: '  范围?  ',
          options: [{ label: 'A' }, { label: 'B', description: '详' }],
        },
      ],
    })
    assert.ok(typeof n !== 'string')
    assert.equal(n.length, 1)
    assert.equal(n[0]?.id, 'q1')
    assert.equal(n[0]?.question, '范围?')
    assert.equal(n[0]?.options[1]?.description, '详')
  })

  it('拒空题 / 选项不足 / 过多题', () => {
    assert.equal(typeof normalizeAskUserArgs({ questions: [] }), 'string')
    assert.equal(
      typeof normalizeAskUserArgs({
        questions: [{ question: 'x', options: [{ label: 'only' }] }],
      }),
      'string',
    )
    assert.equal(
      typeof normalizeAskUserArgs({
        questions: [1, 2, 3, 4].map((i) => ({
          question: `q${i}`,
          options: [{ label: 'a' }, { label: 'b' }],
        })),
      }),
      'string',
    )
  })
})

describe('formatAskUserResult', () => {
  it('跳过与选项+备注', () => {
    assert.equal(formatAskUserResult({ answers: {}, skipped: true }, sampleQ), '用户跳过了提问。')
    const text = formatAskUserResult(
      { answers: { q1: { selected: ['Nature 上周'], note: '只要英文' } } },
      sampleQ,
    )
    assert.match(text, /Nature 上周/)
    assert.match(text, /只要英文/)
  })
})

describe('ask_user tool', () => {
  it('挂起后由 waiter 解开并回灌', async () => {
    const [tool] = createAskUserTools()
    assert.ok(tool)
    let resolveAnswer!: (a: AskUserAnswer) => void
    const waiterPromise = new Promise<AskUserAnswer>((r) => { resolveAnswer = r })
    const ctx = {
      taskId: 't1',
      agentRole: 'main',
      depth: 0,
      toolCallId: 'call-1',
      spawn: async () => ({ llmContent: '' }),
      emit: () => {},
      deps: {
        askUser: async () => waiterPromise,
      },
    } satisfies ToolContext

    const runP = tool.run(
      {
        questions: [{
          question: '用哪份语料?',
          options: [{ label: 'Nature 上周' }, { label: '本地库' }],
        }],
      },
      ctx,
    )
    resolveAnswer({ answers: { q1: { selected: ['本地库'] } } })
    const out = await runP
    assert.match(out.llmContent, /本地库/)
    assert.doesNotMatch(out.llmContent, /^error:/)
  })

  it('无 waiter / 无 toolCallId → error llmContent', async () => {
    const [tool] = createAskUserTools()
    assert.ok(tool)
    const base = {
      taskId: 't1',
      agentRole: 'main',
      depth: 0,
      spawn: async () => ({ llmContent: '' }),
      emit: () => {},
      deps: {},
    } satisfies ToolContext
    const a = await tool.run(
      { questions: [{ question: 'x', options: [{ label: 'a' }, { label: 'b' }] }] },
      { ...base, toolCallId: 'c1' },
    )
    assert.match(a.llmContent, /等待桥未注入/)
    const b = await tool.run(
      { questions: [{ question: 'x', options: [{ label: 'a' }, { label: 'b' }] }] },
      {
        ...base,
        deps: { askUser: async () => ({ answers: {}, skipped: true }) },
      },
    )
    assert.match(b.llmContent, /toolCallId/)
  })
})
