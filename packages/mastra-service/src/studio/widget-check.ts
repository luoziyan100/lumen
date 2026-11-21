/**
 * [INPUT]: node:vm's Script (compile only, never run), zod, studio/errors's StudioError, studio/types's WidgetParam union
 * [OUTPUT]: WIDGET_PARAM_LIMITS, widgetParamInput (the structural shape of one declared parameter), normalizeParams (the per-item caps on a widget's params),
 *           checkWidgetHtml (the static self-check of a widget's html before it is stored)
 * [POS]: the widget half of reading.ts's normalizeBlock. A reading widget declares its controls as params and the desktop draws them (P1); the html is checked here
 *        without executing a line: classic inline scripts compile under vm.Script, module scripts, remote addresses and network APIs are refused (the receiver's CSP
 *        blocks them anyway, so the person would see a blank widget), and declared params must be read while undeclared ones must not be. Runtime errors stay the
 *        desktop's (the 「请 AI 修正」 path). Every refusal names the block, the script or the parameter and how to fix it, like the rest of normalizeBlock
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { Script } from 'node:vm'
import { z } from 'zod'
import { StudioError } from './errors.ts'
import type { WidgetParam } from './types.ts'

export const WIDGET_PARAM_LIMITS = { params: 6, label: 40, unit: 12, choices: { min: 2, max: 6 }, value: 40 } as const

const PARAM_NAME = /^[a-z][a-zA-Z0-9]{0,31}$/

const base = { name: z.string(), label: z.string() }
export const widgetParamInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('range'), ...base, min: z.number(), max: z.number(), step: z.number(), default: z.number(), unit: z.string().optional() }).strict(),
  z.object({ type: z.literal('toggle'), ...base, default: z.boolean() }).strict(),
  z.object({ type: z.literal('choice'), ...base, options: z.array(z.object({ value: z.string(), label: z.string() }).strict()), default: z.string() }).strict(),
])
export type WidgetParamInput = z.infer<typeof widgetParamInput>

function refuse(n: number, message: string, extra: Record<string, unknown> = {}): never {
  throw new StudioError(`第 ${n} 块小实验${message}`, 400, 'reading.block_invalid', { paragraph: n, kind: 'widget', ...extra })
}

/** Check and trim one widget's declared params; the result is what the desktop draws and what reading_view shows back. */
export function normalizeParams(params: WidgetParamInput[], n: number): WidgetParam[] {
  const { params: max, label: labelMax, unit: unitMax, choices, value: valueMax } = WIDGET_PARAM_LIMITS
  if (params.length > max) refuse(n, `声明了 ${params.length} 个参数，最多 ${max} 个；只留最能牵动结果的几个`)
  const names = new Set<string>()
  return params.map((param, index) => {
    const at = `的第 ${index + 1} 个参数「${param.name}」`, extra = { param: param.name }
    if (!PARAM_NAME.test(param.name)) refuse(n, `${at}的 name 不合格式；用小写字母开头的字母数字（如 rate、gainDb），最长 32 个字符`, extra)
    if (names.has(param.name)) refuse(n, `${at}和前面的参数重名；每个参数的 name 在块内唯一`, extra)
    names.add(param.name)
    const label = param.label.trim()
    if (!label || label.length > labelMax) refuse(n, `${at}的 label 要 1–${labelMax} 字`, extra)
    if (param.type === 'toggle') return { type: 'toggle', name: param.name, label, default: param.default }
    if (param.type === 'range') {
      const { min, max: top, step } = param, unit = param.unit?.trim() || undefined
      if (![min, top, step, param.default].every(Number.isFinite)) refuse(n, `${at}的 min/max/step/default 都要是有限数字`, extra)
      if (!(min < top)) refuse(n, `${at}的 min（${min}）要小于 max（${top}）`, extra)
      if (!(step > 0)) refuse(n, `${at}的 step 要大于 0`, extra)
      if (param.default < min || param.default > top) refuse(n, `${at}的 default（${param.default}）要在 ${min}–${top} 之间`, extra)
      if (unit && unit.length > unitMax) refuse(n, `${at}的 unit 最多 ${unitMax} 字`, extra)
      return { type: 'range', name: param.name, label, min, max: top, step, default: param.default, ...(unit ? { unit } : {}) }
    }
    const options = param.options.map(option => ({ value: option.value.trim(), label: option.label.trim() }))
    if (options.length < choices.min || options.length > choices.max) refuse(n, `${at}要有 ${choices.min}–${choices.max} 个选项`, extra)
    if (options.some(option => !option.value || option.value.length > valueMax || !option.label || option.label.length > labelMax))
      refuse(n, `${at}的每个选项要有 value（1–${valueMax} 字）和 label（1–${labelMax} 字）`, extra)
    if (new Set(options.map(option => option.value)).size !== options.length) refuse(n, `${at}的选项 value 有重复`, extra)
    if (!options.some(option => option.value === param.default)) refuse(n, `${at}的 default「${param.default}」不是任何一个选项的 value`, extra)
    return { type: 'choice', name: param.name, label, options, default: param.default }
  })
}

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
/** Script types the browser runs as classic script; any other type (application/json, text/plain…) is data and is not compiled */
const CLASSIC = new Set(['', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript'])
const REMOTE = /\b(?:src|href)\s*=\s*["']?\s*((?:https?:|\/\/)[^\s"'>]*)|url\(\s*["']?\s*((?:https?:|\/\/)[^\s"')]*)/i
const NETWORK = /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bimport\s*\(/
const HANDLER = /\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
const READS_PARAMS = /\blumenParams\b|lumen:params/

/** The static self-check of a widget's html (compile, never execute). `declared` says whether the block declares params. */
export function checkWidgetHtml(html: string, n: number, declared: boolean) {
  const remote = REMOTE.exec(html)
  if (remote) refuse(n, `引用了外网地址「${(remote[1] ?? remote[2])!.slice(0, 80)}」；小实验不能联网，把图片、字体或脚本内联进 html，或者删掉`)
  const code: string[] = []
  let k = 0
  for (const [, attrs, body] of html.matchAll(SCRIPT)) {
    k++
    const type = /\btype\s*=\s*["']?([^"'\s>]*)/i.exec(attrs!)?.[1]?.toLowerCase() ?? ''
    if (type === 'module') refuse(n, `的第 ${k} 个脚本是 type="module"；小实验零依赖，用不到 import，改成普通 <script>`, { script: k })
    if (!CLASSIC.has(type)) continue
    try { new Script(body!, { filename: `widget-script-${k}.js` }) } catch (error) {
      refuse(n, `的第 ${k} 个脚本有语法错误：${error instanceof Error ? error.message : String(error)}。改好再写`, { script: k })
    }
    code.push(body!)
  }
  for (const [, double, single] of html.matchAll(HANDLER)) code.push(double ?? single ?? '')
  const network = code.map(text => NETWORK.exec(text)?.[0]).find(Boolean)
  if (network) refuse(n, `的脚本用了 ${network.replace(/\s*\($/, '(')}；小实验的沙箱禁止任何网络请求，数据直接写进脚本`)
  const reads = code.some(text => READS_PARAMS.test(text))
  if (declared && !reads) refuse(n, '声明了 params，页面却没有读 window.lumenParams，也没有监听 lumen:params 事件；读法见 reading_widget_guide')
  if (!declared && reads) refuse(n, '的页面用了 lumenParams，但块里没有声明 params；照 reading_widget_guide 声明 params，或删掉页面里对它的读取')
}
