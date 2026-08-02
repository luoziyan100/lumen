/**
 * show-widget 围栏解析与 sanitize 轻测。
 * npm test -w packages/ui-client
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractWidgetCodePartial, parseShowWidgets } from '../src/components/widget/parseShowWidget.ts'
import { sanitizeForStreaming, truncateOpenScript } from '../src/components/widget/sanitize.ts'
import { nextWidgetHeight } from '../src/components/widget/height.ts'

describe('parseShowWidgets', () => {
  it('纯文本原样一段', () => {
    const segs = parseShowWidgets('你好')
    assert.equal(segs.length, 1)
    assert.equal(segs[0]?.kind, 'text')
  })

  it('闭合围栏拆出 widget', () => {
    const md = '先看图\n\n```show-widget\n{"title":"T","widget_code":"<svg></svg>"}\n```\n\n后文'
    const segs = parseShowWidgets(md)
    assert.equal(segs.filter((s) => s.kind === 'text').length, 2)
    const w = segs.find((s) => s.kind === 'widget')
    assert.ok(w && w.kind === 'widget')
    assert.equal(w.closed, true)
    assert.equal(w.title, 'T')
    assert.equal(w.widgetCode, '<svg></svg>')
  })

  it('未闭合围栏 closed=false', () => {
    const md = '```show-widget\n{"title":"X","widget_code":"<div>a'
    const segs = parseShowWidgets(md)
    const w = segs.find((s) => s.kind === 'widget')
    assert.ok(w && w.kind === 'widget')
    assert.equal(w.closed, false)
    assert.match(w.widgetCode, /<div>a/)
  })
})

describe('extractWidgetCodePartial', () => {
  it('反转义换行', () => {
    const { widgetCode } = extractWidgetCodePartial('{"widget_code":"<div>\\n</div>"}')
    assert.equal(widgetCode, '<div>\n</div>')
  })
})

describe('sanitize', () => {
  it('流式剥 script 与 on*', () => {
    const out = sanitizeForStreaming('<div onclick="x()">a</div><script>evil()</script>')
    assert.ok(!out.includes('script'))
    assert.ok(!out.includes('onclick'))
    assert.ok(out.includes('<div'))
  })

  it('未闭合 script 截断', () => {
    const { html, truncated } = truncateOpenScript('<div>ok</div><script>var x=')
    assert.equal(truncated, true)
    assert.equal(html, '<div>ok</div>')
  })
})

describe('nextWidgetHeight', () => {
  it('流式只增不减(防闪烁)', () => {
    assert.equal(nextWidgetHeight(800, 500, { streaming: true, first: false }), 800)
    assert.equal(nextWidgetHeight(500, 800, { streaming: true, first: false }), 800)
  })
  it('终态允许收缩(进出阅读器后消空白)', () => {
    assert.equal(nextWidgetHeight(800, 500, { streaming: false, first: false }), 500)
  })
  it('首帧跟测量', () => {
    assert.equal(nextWidgetHeight(120, 640, { streaming: true, first: true }), 640)
  })
})
