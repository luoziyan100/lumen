/**
 * [INPUT]: studio/widget-params' pure value rules and question lines, a Map standing in for localStorage
 * [OUTPUT]: unit evidence for P2: an unknown name is dropped, a number outside the range is clamped, a wrong type or a vanished choice falls back to the default; values saved
 *           under topic/material/section/title (position only when untitled) survive a widget inserted before it and a rewrite that keeps the names (a smaller max clamps them); and for P3's quote: the two program lines (title, then
 *           「当前参数」 with toggles as 开/关, choices by label, ranges with their unit) and widgetTitleOf reading the title back from the joined quote
 * [POS]: the pure half of the widget-params desktop proof; reading.test.ts feeds the same quote through both question parsers, ui-assert-reading.mts drives the real controls
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import type { WidgetParam } from '../src/mastra/data/client.ts'

const store = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value) }, removeItem: (key: string) => { store.delete(key) },
} })
const { defaultValues, fitValues, loadValues, paramsLine, paramsStoreKey, saveValues, widgetQuote, widgetTitleOf } = await import('../src/mastra/studio/widget-params.ts')

const params: WidgetParam[] = [
  { type: 'range', name: 'gain', label: '增益', min: 0, max: 4, step: 0.5, default: 1, unit: 'x' },
  { type: 'toggle', name: 'feedback', label: '反馈', default: true },
  { type: 'choice', name: 'mode', label: '模式', options: [{ value: 'fast', label: '快' }, { value: 'slow', label: '慢' }], default: 'slow' },
]

test('fitValues: the current declaration decides what survives', () => {
  assert.deepEqual(defaultValues(params), { gain: 1, feedback: true, mode: 'slow' })
  assert.deepEqual(fitValues(params, { gain: 3, feedback: false, mode: 'fast', stale: 9 }), { gain: 3, feedback: false, mode: 'fast' }, '未知 name 丢弃')
  assert.deepEqual(fitValues(params, { gain: 9 }), { gain: 4, feedback: true, mode: 'slow' }, '越界夹回上限')
  assert.deepEqual(fitValues(params, { gain: -2 }).gain, 0, '越界夹回下限')
  assert.deepEqual(fitValues(params, { gain: '3', feedback: 'yes', mode: 1 }), { gain: 1, feedback: true, mode: 'slow' }, '类型不符回默认')
  assert.deepEqual(fitValues(params, { gain: Number.NaN }).gain, 1, '非有限数回默认')
  assert.deepEqual(fitValues(params, { mode: 'medium' }).mode, 'slow', '选项不存在回默认')
  assert.deepEqual(fitValues(params, null), defaultValues(params))
})

test('values saved under the widget\'s place survive a rewrite that keeps the names', () => {
  const key = paramsStoreKey('topic-1', 'item-1', 's1', '增益回路', 1)
  assert.equal(key, 'lumen:widgetParams.v1:topic-1:item-1:s1:增益回路')
  assert.equal(paramsStoreKey('topic-1', 'item-1', 's1', undefined, 2), 'lumen:widgetParams.v1:topic-1:item-1:s1:2', '没有标题才退回节内序号')
  assert.deepEqual(loadValues(key, params), defaultValues(params), '没存过就是默认值')
  saveValues(key, { gain: 3.5, feedback: false, mode: 'fast' })
  const rewritten: WidgetParam[] = [{ ...params[0]!, max: 2 } as WidgetParam, params[1]!, { type: 'toggle', name: 'noise', label: '噪声', default: false }]
  assert.deepEqual(loadValues(key, rewritten), { gain: 2, feedback: false, noise: false }, '同名保留、上限调小夹回、删掉的 mode 丢弃、新参数取默认')
  const inserted = paramsStoreKey('topic-1', 'item-1', 's1', '另一个小实验', 1)
  saveValues(inserted, { gain: 0.5, feedback: true, mode: 'slow' })
  assert.equal(paramsStoreKey('topic-1', 'item-1', 's1', '增益回路', 2), key, '同一节前面补插一个小实验，原小实验序号后移、键不变')
  assert.deepEqual(loadValues(key, params), { gain: 3.5, feedback: false, mode: 'fast' }, '补插后原小实验的值不串')
  assert.deepEqual(loadValues(inserted, params), { gain: 0.5, feedback: true, mode: 'slow' })
  store.set(key, '{not json')
  assert.deepEqual(loadValues(key, params), defaultValues(params), '坏数据回默认')
})

test('the widget question quote: title line, then the current values in the model\'s words', () => {
  assert.equal(paramsLine(params, { gain: 2, feedback: false, mode: 'fast' }), '当前参数：增益=2x，反馈=关，模式=快')
  assert.equal(paramsLine(params, { gain: 9 }), '当前参数：增益=4x，反馈=开，模式=慢', '推送前同样经过声明过滤')
  assert.equal(widgetQuote('增益「回路」', params, { gain: 2 }), '小实验「增益「回路」」\n当前参数：增益=2x，反馈=开，模式=慢')
  assert.equal(widgetQuote('静态', undefined, {}), '小实验「静态」', '没有参数只有一行')
  assert.equal(widgetTitleOf('小实验「增益「回路」」 当前参数：增益=2x'), '增益「回路」')
  assert.equal(widgetTitleOf('小实验「静态」'), '静态')
  assert.equal(widgetTitleOf('an upper bound on surprise'), null)
})
