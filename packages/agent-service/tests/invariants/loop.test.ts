import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Thread } from '../../src/core/thread.ts'
import { runAgent } from '../../src/core/loop.ts'
import { DEFAULT_LIMITS } from '../../src/core/limits.ts'
import {
  ScriptedModel,
  assistantToolCall,
  assistantReply,
  fixedTool,
  throwingTool,
  noopCtx,
} from '../helpers/scripted-model.ts'

test('不变式：tool_result 回灌——第 N 轮工具结果出现在第 N+1 轮喂给模型的线程里', async () => {
  const model = new ScriptedModel([
    assistantToolCall('t1', 'search'),
    assistantReply('done'),
  ])
  const thread = new Thread([
    { role: 'system', content: 'sys' },
    { role: 'user', content: '今天有什么论文' },
  ])

  const result = await runAgent({
    thread,
    model,
    tools: [fixedTool('search', 'RESULT_ABC')],
    limits: DEFAULT_LIMITS,
    ctx: noopCtx(),
  })

  assert.equal(result.status, 'done')
  assert.equal(result.reply, 'done')

  // 核心断言：第 2 次模型调用的线程里必须含第 1 轮 search 的真实结果
  const secondCall = model.calls[1]
  const toolResult = secondCall.find((m) => m.role === 'tool_result' && m.toolCallId === 't1')
  assert.ok(toolResult, '第二轮模型调用的线程里必须有 t1 的 tool_result')
  assert.equal(toolResult?.content, 'RESULT_ABC')
})

test('恢复：未知工具的错误进线程，循环继续而非中断', async () => {
  const model = new ScriptedModel([
    assistantToolCall('t1', 'does_not_exist'),
    assistantReply('recovered'),
  ])
  const thread = new Thread([{ role: 'user', content: 'go' }])

  const result = await runAgent({ thread, model, tools: [], limits: DEFAULT_LIMITS, ctx: noopCtx() })

  assert.equal(result.status, 'done')
  const injected = model.calls[1].find((m) => m.role === 'tool_result' && m.toolCallId === 't1')
  assert.match(injected?.content ?? '', /unknown tool/)
})

test('恢复：工具抛错时错误进线程，循环继续', async () => {
  const model = new ScriptedModel([
    assistantToolCall('t1', 'boom'),
    assistantReply('ok'),
  ])
  const thread = new Thread([{ role: 'user', content: 'go' }])

  const result = await runAgent({
    thread,
    model,
    tools: [throwingTool('boom', 'kaboom')],
    limits: DEFAULT_LIMITS,
    ctx: noopCtx(),
  })

  assert.equal(result.status, 'done')
  const injected = model.calls[1].find((m) => m.role === 'tool_result' && m.toolCallId === 't1')
  assert.match(injected?.content ?? '', /kaboom/)
})

test('预算：超过 maxSteps 返回 exhausted', async () => {
  const script = Array.from({ length: 10 }, (_, i) => assistantToolCall(`t${i}`, 'search'))
  const model = new ScriptedModel(script)
  const thread = new Thread([{ role: 'user', content: 'loop' }])

  const result = await runAgent({
    thread,
    model,
    tools: [fixedTool('search', 'x')],
    limits: { maxSteps: 3, maxDepth: 3 },
    ctx: noopCtx(),
  })

  assert.equal(result.status, 'exhausted')
  assert.equal(model.calls.length, 3)
})

test('取消：预先 abort 的 signal 直接返回 aborted，不调用模型', async () => {
  const controller = new AbortController()
  controller.abort()
  const model = new ScriptedModel([assistantReply('never')])
  const thread = new Thread([{ role: 'user', content: 'x' }])

  const result = await runAgent({
    thread,
    model,
    tools: [],
    limits: DEFAULT_LIMITS,
    ctx: noopCtx(),
    signal: controller.signal,
  })

  assert.equal(result.status, 'aborted')
  assert.equal(model.calls.length, 0)
})

test('多工具并发回灌：一轮里多个 tool_call 的结果都进线程', async () => {
  const model = new ScriptedModel([
    {
      message: {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'a', name: 'search', arguments: {} },
          { id: 'b', name: 'lookup', arguments: {} },
        ],
      },
      toolCalls: [
        { id: 'a', name: 'search', arguments: {} },
        { id: 'b', name: 'lookup', arguments: {} },
      ],
    },
    assistantReply('combined'),
  ])
  const thread = new Thread([{ role: 'user', content: 'go' }])

  const result = await runAgent({
    thread,
    model,
    tools: [fixedTool('search', 'R_A'), fixedTool('lookup', 'R_B')],
    limits: DEFAULT_LIMITS,
    ctx: noopCtx(),
  })

  assert.equal(result.status, 'done')
  const second = model.calls[1]
  assert.equal(second.find((m) => m.toolCallId === 'a')?.content, 'R_A')
  assert.equal(second.find((m) => m.toolCallId === 'b')?.content, 'R_B')
})
