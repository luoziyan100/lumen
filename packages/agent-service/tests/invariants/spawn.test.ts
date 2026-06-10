import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Thread } from '../../src/core/thread.ts'
import { runAgent } from '../../src/core/loop.ts'
import { createSpawnFn, spawnTool } from '../../src/core/spawn.ts'
import { DEFAULT_LIMITS } from '../../src/core/limits.ts'
import {
  ScriptedModel,
  assistantToolCall,
  assistantReply,
  fixedTool,
  noopCtx,
} from '../helpers/scripted-model.ts'

test('递归不变式：worker 用同一个循环，worker 的 tool_result 回灌进 worker 自己的线程', async () => {
  const mainModel = new ScriptedModel([
    assistantToolCall('s1', 'spawn', { role: 'searcher', scope: '扫期刊', prompt: '搜今天的论文' }),
    assistantReply('主 agent 综合完成'),
  ])
  const workerModel = new ScriptedModel([
    assistantToolCall('w1', 'search'),
    assistantReply('Scope: 扫期刊\nNote: 找到 3 篇'),
  ])

  const spawn = createSpawnFn({
    model: mainModel,
    roles: {
      searcher: {
        systemPrompt: 'you are a searcher worker',
        tools: [fixedTool('search', 'WORKER_RESULT_XYZ')],
        limits: DEFAULT_LIMITS,
        model: workerModel,
      },
    },
  })

  const thread = new Thread([
    { role: 'system', content: 'main' },
    { role: 'user', content: '今天有什么论文' },
  ])

  const result = await runAgent({
    thread,
    model: mainModel,
    tools: [spawnTool],
    limits: DEFAULT_LIMITS,
    ctx: noopCtx({ spawn }),
  })

  assert.equal(result.status, 'done')

  // 同一铁律在递归层成立：worker 第 2 次模型调用必须看见它第 1 轮 search 的结果
  const workerSecondCall = workerModel.calls[1]
  const workerToolResult = workerSecondCall.find((m) => m.role === 'tool_result' && m.toolCallId === 'w1')
  assert.ok(workerToolResult, 'worker 的线程必须回灌它自己的 tool_result')
  assert.equal(workerToolResult?.content, 'WORKER_RESULT_XYZ')

  // 上下文隔离：主 agent 只看到 worker 的压缩 final reply，看不到 worker 内部工具结果
  const mainSecondCall = mainModel.calls[1]
  const spawnResult = mainSecondCall.find((m) => m.role === 'tool_result' && m.toolCallId === 's1')
  assert.ok(spawnResult)
  assert.match(spawnResult?.content ?? '', /找到 3 篇/)
  assert.doesNotMatch(
    spawnResult?.content ?? '',
    /WORKER_RESULT_XYZ/,
    '主 agent 不该看到 worker 内部的工具结果',
  )
})

test('递归深度上限：超过 maxDepth 拒绝 spawn', async () => {
  const model = new ScriptedModel([assistantReply('unused')])
  const spawn = createSpawnFn({
    model,
    maxDepth: 1,
    roles: { w: { systemPrompt: 's', tools: [], limits: DEFAULT_LIMITS } },
  })

  // 模拟已经在 depth 1 的 ctx 再 spawn → 应被拒绝
  const ctx = noopCtx({ depth: 1, spawn })
  const result = await spawn({ role: 'w', scope: '', prompt: '' }, ctx)

  assert.match(result.llmContent, /max recursion depth/)
  assert.equal(model.calls.length, 0, '被拒绝时不该真的跑 worker')
})

test('未知 role 返回错误而非崩溃', async () => {
  const model = new ScriptedModel([])
  const spawn = createSpawnFn({ model, roles: {} })
  const result = await spawn({ role: 'ghost', scope: '', prompt: '' }, noopCtx({ spawn }))
  assert.match(result.llmContent, /unknown role/)
})
