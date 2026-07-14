/**
 * 方案 B 运行时集成(owner 拍板 2026-07-14):水位→确定性压缩→大结果落盘→软着陆。
 * 契约:全程零 LLM 摘要调用;事件流只增不减;压缩后模型视图 = 检查点(清单+用户原话逐字)+ 最近轮原文;
 *      不配 contextBudget 时行为与旧版逐字节一致。
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { AgentRuntime } from '../../src/runtime/agent-runtime.ts'
import { ScriptedModel, assistantReply, fixedTool } from '../helpers/scripted-model.ts'
import type { ModelPort, ModelResponse } from '../../src/core/model-port.ts'
import type { Message } from '../../src/core/types.ts'

async function makeEnv(t: TestContext) {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-ctx-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => {
    db.close()
    return rm(base, { recursive: true, force: true })
  })
  return { base, store: new TaskStore(db) }
}

test('水位超阈值 → 回合前确定性压缩:检查点+近轮原文;零额外模型调用', async (t) => {
  const { base, store } = await makeEnv(t)
  const model = new ScriptedModel([
    { ...assistantReply('大'.repeat(1200)), usage: { promptTokens: 3900, completionTokens: 1200 } },
    assistantReply('第二轮回答'),
  ])
  const rt = new AgentRuntime({
    store, model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: [],
    contextBudget: { window: () => 4000, keepRecentTokens: 400, userVerbatimTokens: 400 },
  })
  const id = rt.createDraft('p', '研究')
  rt.continueTask(id, '第一轮问题:读这篇论文')
  await rt.waitFor(id)
  rt.continueTask(id, '第二轮问题:总结一下')
  await rt.waitFor(id)

  const events = store.listEvents(id)
  const kinds = events.map((e) => e.kind)
  assert.ok(kinds.includes('compaction'), `没触发压缩:${kinds.join(',')}`)
  assert.ok(kinds.includes('context_usage'), '缺水位事件')
  assert.equal(model.calls.length, 2, '压缩不该额外调用模型(零摘要)')

  const view = model.calls[1]
  const joined = view.map((m) => `${m.role}:${m.content}`).join('\n---\n')
  assert.ok(joined.includes('上下文检查点'), '缺检查点消息')
  assert.ok(joined.includes('第一轮问题:读这篇论文'), '用户原话必须逐字保留')
  assert.ok(!joined.includes('大'.repeat(1200)), '被归档的大回答不该出现在视图里')
  assert.ok(view[view.length - 1].content.includes('第二轮问题'), '最新一轮必须原样在场')

  // 事件流只增不减:压缩前的原文一条不少
  const steps = events.filter((e) => e.kind === 'model_step')
  assert.ok(steps.some((e) => (JSON.parse(e.payload_json) as { content: string }).content.includes('大大大')), '归档内容仍完整在事件库')
})

test('大结果落盘:超限工具输出全文进 cache/tool-results/,事件里只剩预览+路径,可读回', async (t) => {
  const { base, store } = await makeEnv(t)
  const big = 'PDF正文'.repeat(5000) // 20000 字符 > 16000 默认阈值
  const call = { id: 'c1', name: 'bigtool', arguments: {} }
  const model = new ScriptedModel([
    { message: { role: 'assistant', content: '', toolCalls: [call] }, toolCalls: [call] },
    assistantReply('读完了'),
  ])
  const rt = new AgentRuntime({
    store, model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: [fixedTool('bigtool', big)],
    contextBudget: { window: () => 200000 },
  })
  const id = rt.createDraft('p', 'x')
  rt.continueTask(id, '读大文件')
  await rt.waitFor(id)

  const tr = store.listEvents(id).find((e) => e.kind === 'tool_result')
  assert.ok(tr, '缺 tool_result 事件')
  const payload = JSON.parse(tr.payload_json) as { llmContent: string }
  assert.ok(payload.llmContent.includes('cache/tool-results/'), '事件里应是落盘标记+路径')
  assert.ok(payload.llmContent.length < 3000, '事件里只留预览')
  const m = payload.llmContent.match(/cache\/tool-results\/\S+\.txt/)
  assert.ok(m, '标记里应含文件路径')
  const full = await readFile(path.join(base, 'workspaces', 'p', 'sessions', id, m[0]), 'utf8')
  assert.equal(full, big, '全文可从磁盘逐字读回')
})

test('软着陆:超窗错误 → 自动压缩 → 原地重试成功,任务不死', async (t) => {
  const { base, store } = await makeEnv(t)
  const fat = 'x'.repeat(2000)
  let calls = 0
  const model: ModelPort = {
    async chat(messages: Message[]): Promise<ModelResponse> {
      calls += 1
      if (calls <= 2) return { message: { role: 'assistant', content: `回答${calls}` }, toolCalls: [], usage: { promptTokens: 100, completionTokens: 5 } }
      if (calls === 3) throw new Error('OpenAI request failed (400): {"error":{"message":"This model\'s maximum context length is 4000 tokens","code":"context_length_exceeded"}}')
      return { message: { role: 'assistant', content: '压缩后成功' }, toolCalls: [] }
    },
  }
  const rt = new AgentRuntime({
    store, model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: [],
    contextBudget: { window: () => 999_999_999, keepRecentTokens: 50, userVerbatimTokens: 100 },
  })
  const id = rt.createDraft('p', 'x')
  rt.continueTask(id, `第一轮${fat}`)
  await rt.waitFor(id)
  rt.continueTask(id, `第二轮${fat}`)
  await rt.waitFor(id)
  rt.continueTask(id, `第三轮${fat}`)
  await rt.waitFor(id)

  assert.equal(store.getTask(id)?.status, 'done', '软着陆后应正常完成')
  assert.ok(store.listEvents(id).some((e) => e.kind === 'compaction'), '应有压缩事件')
  assert.equal(calls, 4, '恰好重试一次')
})

test('回归守护:不配 contextBudget → 无压缩/无水位事件/工具不包装(旧行为)', async (t) => {
  const { base, store } = await makeEnv(t)
  const big = 'B'.repeat(20000)
  const call = { id: 'c1', name: 'bigtool', arguments: {} }
  const model = new ScriptedModel([
    { message: { role: 'assistant', content: '', toolCalls: [call] }, toolCalls: [call], usage: { promptTokens: 999999, completionTokens: 1 } },
    assistantReply('好'),
    assistantReply('第二轮'),
  ])
  const rt = new AgentRuntime({
    store, model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: [fixedTool('bigtool', big)],
  })
  const id = rt.createDraft('p', 'x')
  rt.continueTask(id, '一')
  await rt.waitFor(id)
  rt.continueTask(id, '二')
  await rt.waitFor(id)

  const events = store.listEvents(id)
  assert.ok(!events.some((e) => e.kind === 'compaction'), '不该压缩')
  assert.ok(!events.some((e) => e.kind === 'context_usage'), '不该有水位事件')
  const tr = events.find((e) => e.kind === 'tool_result')
  assert.ok(tr)
  assert.equal((JSON.parse(tr.payload_json) as { llmContent: string }).llmContent, big, '大结果原样保留(不落盘)')
})
