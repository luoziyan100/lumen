/**
 * [INPUT]: studio/widget-check's param caps and html self-check, studio/widget-guide's handbook and example, permissions' categories
 * [OUTPUT]: unit evidence for P1 (each param type valid and invalid, refusals name the block and the parameter), P4 (syntax error, module script, remote src,
 *           fetch(, declared-but-unread and read-but-undeclared params each refused with what to fix; a valid page with an application/json block passes;
 *           the check compiles and never runs page script: a global the page would set stays unset and a page that throws on run passes) and P5 (the handbook is ≤4KB, teaches lumenParams / lumen:params / __widgetSendMessage, its own example
 *           passes the check, and the tool is 'read')
 * [POS]: the pure half of the widget-params proof; reading.test.ts carries the same rules through the real Controller, reading_write and reading_view
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { toolCategory } from '../../src/permissions.ts'
import { StudioError } from '../../src/studio/errors.ts'
import { checkWidgetHtml, normalizeParams, type WidgetParamInput } from '../../src/studio/widget-check.ts'
import { WIDGET_EXAMPLE, WIDGET_GUIDE } from '../../src/studio/widget-guide.ts'

const range: WidgetParamInput = { type: 'range', name: 'rate', label: ' 衰减速率 ', min: 0, max: 10, step: 0.5, default: 2, unit: 'Hz' }
const toggle: WidgetParamInput = { type: 'toggle', name: 'showHalf', label: '标出半衰期', default: false }
const choice: WidgetParamInput = { type: 'choice', name: 'mode', label: '模式', options: [{ value: 'lin', label: '线性' }, { value: 'log', label: '对数' }], default: 'log' }
const READS = '<div id="o"></div><script>document.getElementById("o").textContent = JSON.stringify(window.lumenParams)</script>'

function refusal(run: () => unknown, pattern: RegExp) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof StudioError)
    assert.equal(error.code, 'reading.block_invalid')
    assert.match(error.message, pattern)
    return true
  })
}

test('normalizeParams: each type has a valid form and refusals name the block and the parameter', () => {
  assert.deepEqual(normalizeParams([range, toggle, choice], 3), [
    { type: 'range', name: 'rate', label: '衰减速率', min: 0, max: 10, step: 0.5, default: 2, unit: 'Hz' },
    { type: 'toggle', name: 'showHalf', label: '标出半衰期', default: false },
    { type: 'choice', name: 'mode', label: '模式', options: [{ value: 'lin', label: '线性' }, { value: 'log', label: '对数' }], default: 'log' },
  ])
  refusal(() => normalizeParams([{ ...range, min: 5, max: 5 }], 3), /第 3 块小实验的第 1 个参数「rate」的 min（5）要小于 max（5）/)
  refusal(() => normalizeParams([{ ...range, step: 0 }], 3), /「rate」的 step 要大于 0/)
  refusal(() => normalizeParams([{ ...range, default: 11 }], 3), /「rate」的 default（11）要在 0–10 之间/)
  refusal(() => normalizeParams([{ ...range, unit: '一二三四五六七八九十一二三' }], 3), /「rate」的 unit 最多 12 字/)
  refusal(() => normalizeParams([{ ...toggle, label: '' }], 2), /第 2 块小实验的第 1 个参数「showHalf」的 label 要 1–40 字/)
  refusal(() => normalizeParams([{ ...toggle, name: 'Show_half' }], 2), /「Show_half」的 name 不合格式/)
  refusal(() => normalizeParams([{ ...choice, default: 'exp' }], 4), /第 4 块小实验的第 1 个参数「mode」的 default「exp」不是任何一个选项的 value/)
  refusal(() => normalizeParams([{ ...choice, options: [{ value: 'lin', label: '线性' }] }], 4), /「mode」要有 2–6 个选项/)
  refusal(() => normalizeParams([range, { ...toggle, name: 'rate' }], 1), /第 2 个参数「rate」和前面的参数重名/)
  refusal(() => normalizeParams(Array.from({ length: 7 }, (_, i) => ({ ...toggle, name: `t${i}` })), 1), /声明了 7 个参数，最多 6 个/)
})

test('checkWidgetHtml: compiles without running, refuses what the sandbox would block, and pairs declared params with reads', () => {
  checkWidgetHtml(READS, 1, true)
  checkWidgetHtml('<script type="application/json">{ not: valid js ( </script><div>没有参数</div><script>var a = 1</script>', 1, false)
  checkWidgetHtml('<a href="#top">回顶部</a><p>讲解代码：fetch( 只是正文里的字</p>', 1, false)
  refusal(() => checkWidgetHtml('<script>var ok = 1</script><script>function (</script>', 2, false), /第 2 块小实验的第 2 个脚本有语法错误：/)
  refusal(() => checkWidgetHtml('<script type="module">var x = 1</script>', 2, false), /第 1 个脚本是 type="module"/)
  refusal(() => checkWidgetHtml('<script src="https://cdn.example.com/d3.js"></script>', 2, false), /引用了外网地址「https:\/\/cdn\.example\.com\/d3\.js」/)
  refusal(() => checkWidgetHtml('<div style="background:url(//img.example.com/a.png)"></div>', 2, false), /外网地址「\/\/img\.example\.com\/a\.png」/)
  refusal(() => checkWidgetHtml('<script>fetch("/data.json").then(r => r.json())</script>', 2, false), /脚本用了 fetch\(；小实验的沙箱禁止任何网络请求/)
  refusal(() => checkWidgetHtml('<button onclick="new WebSocket(\'ws://x\')">连</button>', 2, false), /脚本用了 WebSocket/)
  refusal(() => checkWidgetHtml('<script>var a = 1</script>', 5, true), /第 5 块小实验声明了 params，页面却没有读 window\.lumenParams/)
  refusal(() => checkWidgetHtml(READS, 5, false), /第 5 块小实验的页面用了 lumenParams，但块里没有声明 params/)
  const key = '__lumenWidgetCheckRan'
  checkWidgetHtml(`<script>globalThis.${key} = true; window.lumenParams</script><script>throw new Error('ran')</script>`, 1, true)
  assert.equal((globalThis as Record<string, unknown>)[key], undefined)
})

test('reading_widget_guide: a ≤4KB handbook whose own example passes the check; a read tool', () => {
  assert.ok(Buffer.byteLength(WIDGET_GUIDE) <= 4096, `${Buffer.byteLength(WIDGET_GUIDE)} bytes`)
  for (const term of ['lumenParams', 'lumen:params', '__widgetSendMessage', 'type="module"', '64KB']) assert.ok(WIDGET_GUIDE.includes(term), term)
  const params = normalizeParams(WIDGET_EXAMPLE.params.map(param => ({ ...param })), 1)
  checkWidgetHtml(WIDGET_EXAMPLE.html, 1, params.length > 0)
  assert.equal(toolCategory('reading_widget_guide'), 'read')
})
