/**
 * [INPUT]: 真实 Mastra Agent/Memory、原生 TokenLimiter 与模型 HTTP 夹具
 * [OUTPUT]: 长输入裁剪、近期工具配对、视觉关闭及持久历史保留的证据
 * [POS]: 输入预算只影响当次请求，不引入摘要存储或截断模型输出
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { createTool } from '@mastra/core/tools'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { z } from 'zod'
import { createInputProcessors, modelTools } from '../../src/agents/context.ts'
import { createModelGateway, modelId } from '../../src/model.ts'
import { fixtureProvider, textReply, toolReply } from '../provider-fixture.ts'

test('原生输入限额保留近期工具配对，长输出和持久历史不被截断；vision off 不暴露图像工具', { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-context-policy-'))
  const finalText = `${'完整结果 '.repeat(1800)}END_RESULT`
  const fixture = fixtureProvider(request => {
    const prompt = JSON.stringify(request.messages)
    assert.doesNotMatch(prompt, /OLD_CONTEXT_MARKER/)
    assert.match(prompt, /LATEST_KEEP/)
    assert.ok(!request.tools?.some(tool => tool.function.name === 'look_at_image'))
    if (!request.messages.some(message => message.role === 'tool')) return toolReply('evidence', {})
    assert.match(prompt, /RECENT_PROOF/)
    const tool = request.messages.find(message => message.role === 'tool')!
    assert.ok(request.messages.some(message => message.role === 'assistant' && JSON.stringify(message).includes(tool.tool_call_id!)))
    return textReply(finalText)
  })
  const settings = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch }
  const storage = new LibSQLStore({ id: 'context-policy', url: `file:${join(root, 'memory.sqlite')}` })
  const memory = new Memory({ storage, options: { lastMessages: 100, semanticRecall: false, workingMemory: { enabled: false } } })
  const policy = { contextWindow: 1000, vision: 'off' as const }
  const agent = new Agent({ id: 'context', name: 'Context', instructions: '研究材料并保留证据。', model: modelId(settings), memory,
    inputProcessors: () => createInputProcessors(policy), tools: () => modelTools(policy, {
      evidence: createTool({ id: 'evidence', description: '读取证据', inputSchema: z.object({}), execute: async () => 'RECENT_PROOF' }),
      look_at_image: createTool({ id: 'look_at_image', description: '图像', inputSchema: z.object({}), execute: async () => { throw new Error('Vision is off') } }),
    }),
  })
  const mastra = new Mastra({ agents: { context: agent }, storage, gateways: { lumen: createModelGateway(settings) } })
  try {
    await memory.createThread({ threadId: 'thread', resourceId: 'resource' })
    const text = `OLD_CONTEXT_MARKER ${'historical-context '.repeat(5000)}`
    await memory.saveMessages({ messages: [{ id: 'old', role: 'user', threadId: 'thread', resourceId: 'resource', createdAt: new Date(0), content: { format: 2, parts: [{ type: 'text', text }] } }] })
    const stream = await agent.stream('LATEST_KEEP', { memory: { thread: 'thread', resource: 'resource' }, maxSteps: 3 })
    assert.equal((await stream.getFullOutput()).text, finalText)
    assert.equal(fixture.requests.length, 2)
    assert.match(JSON.stringify((await memory.recall({ threadId: 'thread', resourceId: 'resource', perPage: false })).messages), /OLD_CONTEXT_MARKER/)
  } finally { await mastra.shutdown(); await storage.close(); await rm(root, { recursive: true, force: true }) }
})
