/**
 * 方案 B 纯函数层:窗口解析 / 水位估算 / 超窗识别 / 确定性压缩计划。
 * 契约:切点只落在 user 事件;用户原话逐字;全程零模型参与。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveContextWindow,
  estimateWatermark,
  isContextOverflowError,
  planCompaction,
  buildCompactionPreamble,
} from '../../src/storage/context-budget.ts'
import type { TaskEvent } from '../../src/storage/task-store.ts'

let seq = 0
function ev(kind: string, payload: Record<string, unknown>, agentRole: string | null = 'main'): TaskEvent {
  seq += 1
  return { id: `e${seq}`, task_id: 't', seq, kind, payload_json: JSON.stringify(payload), agent_role: agentRole, created_at: '' }
}

test('resolveContextWindow:已知模型保守值 / 未知 128K / 覆盖优先', () => {
  assert.equal(resolveContextWindow('deepseek-v4-pro'), 1_000_000) // 2026-07-14 真机实测
  assert.equal(resolveContextWindow('claude-opus-4-8'), 1_000_000)
  assert.equal(resolveContextWindow('claude-haiku-4-5'), 200_000)
  assert.equal(resolveContextWindow('mystery-model-9000'), 128_000)
  assert.equal(resolveContextWindow('deepseek-v4-pro', 1_000_000), 1_000_000)
})

test('isContextOverflowError:各家超窗文案认得;其它错误不误伤', () => {
  assert.ok(isContextOverflowError('Claude request failed (400): {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 210021 tokens > 200000 maximum"}}'))
  assert.ok(isContextOverflowError('OpenAI request failed (400): {"error":{"message":"This model\'s maximum context length is 131072 tokens. However, you requested 140000 tokens","code":"context_length_exceeded"}}'))
  assert.ok(isContextOverflowError('input is too long for requested model'))
  assert.ok(!isContextOverflowError('Claude request failed (401): {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'))
  assert.ok(!isContextOverflowError('OpenAI request failed (502): {"error":{"message":"All available accounts exhausted"}}'))
  assert.ok(!isContextOverflowError('fetch failed: socket hang up'))
})

test('estimateWatermark:真实 usage 为锚点,其后内容按 2 字符/token 估算', () => {
  seq = 0
  const events = [
    ev('user', { content: 'a'.repeat(100) }),
    ev('model_step', { content: 'ok', usage: { promptTokens: 5000, completionTokens: 10 } }),
    ev('tool_result', { llmContent: 'x'.repeat(2000) }),
  ]
  const wm = estimateWatermark(events)
  assert.equal(wm.promptTokens, 5000)
  assert.equal(wm.estimatedTotal, 5000 + 1000)
})

test('estimateWatermark:无 usage 时全量估算(含系统提示词)', () => {
  seq = 0
  const events = [ev('user', { content: 'a'.repeat(200) })]
  const wm = estimateWatermark(events, 800)
  assert.equal(wm.promptTokens, 0)
  assert.equal(wm.estimatedTotal, Math.ceil((800 + 200) / 2))
})

test('estimateWatermark:worker 事件不计入主线程水位', () => {
  seq = 0
  const events = [
    ev('model_step', { content: 'ok', usage: { promptTokens: 1000, completionTokens: 1 } }),
    ev('tool_result', { llmContent: 'w'.repeat(9000) }, 'worker-reader'),
  ]
  assert.equal(estimateWatermark(events).estimatedTotal, 1000)
})

test('planCompaction:切点落在 user 事件;最新轮无条件保留;历史用户原话逐字入计划', () => {
  seq = 0
  const events = [
    ev('user', { content: '第一轮问题:读这篇论文' }),
    ev('model_step', { content: 'x'.repeat(30000) }),
    ev('tool_result', { llmContent: 'y'.repeat(30000) }),
    ev('user', { content: '第二轮问题:再深入一点' }),
    ev('model_step', { content: 'z'.repeat(30000) }),
    ev('user', { content: '第三轮问题:总结' }),
    ev('model_step', { content: '短回答' }),
  ]
  const plan = planCompaction(events, { keepRecentTokens: 1000, userVerbatimTokens: 4000 })
  assert.ok(plan, '应产出压缩计划')
  assert.equal(plan.cutFromSeq, 6, '切点应是第三轮 user 的 seq')
  assert.deepEqual(plan.verbatimUsers, ['第一轮问题:读这篇论文', '第二轮问题:再深入一点'])
  assert.equal(plan.archivedEvents, 5)
})

test('planCompaction:不足两轮 / 预算装得下全部 → null(没什么可压)', () => {
  seq = 0
  assert.equal(planCompaction([ev('user', { content: 'hi' }), ev('model_step', { content: 'yo' })]), null)
  seq = 0
  const small = [
    ev('user', { content: 'a' }), ev('model_step', { content: 'b' }),
    ev('user', { content: 'c' }), ev('model_step', { content: 'd' }),
  ]
  assert.equal(planCompaction(small, { keepRecentTokens: 20000, userVerbatimTokens: 1000 }), null)
})

test('planCompaction:用户原话超预算 → 从新到旧装,最老一条截断并标注', () => {
  seq = 0
  const events = [
    ev('user', { content: '早'.repeat(3000) }),
    ev('model_step', { content: 'x'.repeat(20000) }),
    ev('user', { content: '中期问题' }),
    ev('model_step', { content: 'y'.repeat(20000) }),
    ev('user', { content: '最新问题' }),
    ev('model_step', { content: 'z' }),
  ]
  const plan = planCompaction(events, { keepRecentTokens: 100, userVerbatimTokens: 200 })
  assert.ok(plan)
  assert.equal(plan.verbatimUsers.length, 2)
  assert.equal(plan.verbatimUsers[1], '中期问题', '新的完整保留')
  assert.ok(plan.verbatimUsers[0].includes('已截断'), '装不下的最老一条截断并标注')
})

test('buildCompactionPreamble:清单与用户原话逐字在场', () => {
  const text = buildCompactionPreamble({
    cutFromSeq: 6, manifest: '- papers/a.pdf\n- docs/报告.md',
    verbatimUsers: ['问 A', '问 B'], archivedEvents: 5, estTokensBefore: 90000,
  })
  assert.ok(text.includes('- papers/a.pdf'))
  assert.ok(text.includes('1. 问 A'))
  assert.ok(text.includes('2. 问 B'))
  assert.ok(text.includes('不是摘要'))
})

test('水位把图片计为固定 token 当量(每张 2400 字符)', () => {
  seq = 0
  const events = [
    ev('user', { content: '看图', images: [{ base64: 'x', mediaType: 'image/png' }, { base64: 'y', mediaType: 'image/png' }] }),
  ]
  const wm = estimateWatermark(events, 0)
  assert.equal(wm.estimatedTotal, Math.ceil((2 + 2 * 2400) / 2))
})
