/**
 * [INPUT]: assistant 流式/完整 markdown 文本
 * [OUTPUT]: parseShowWidgets / extractPartialWidget —— 文本段与 widget 段交替
 * [POS]: widget/ 围栏解析;配合 WidgetFrame 流式渲染
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export type ContentSegment =
  | { kind: 'text'; text: string }
  | { kind: 'widget'; title: string; widgetCode: string; closed: boolean }

const FENCE_OPEN = /```show-widget\b[^\n]*\n/g

/** 从可能不完整的 JSON 里抠 widget_code 字符串(手写反转义,不能 JSON.parse) */
export function extractWidgetCodePartial(fenceBody: string): { title: string; widgetCode: string } {
  let title = ''
  const titleMatch = fenceBody.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/)
  if (titleMatch) title = unescapeJsonString(titleMatch[1] ?? '')

  const key = '"widget_code"'
  const keyIdx = fenceBody.indexOf(key)
  if (keyIdx < 0) return { title, widgetCode: '' }
  const afterKey = fenceBody.slice(keyIdx + key.length)
  const colon = afterKey.indexOf(':')
  if (colon < 0) return { title, widgetCode: '' }
  let i = colon + 1
  while (i < afterKey.length && /\s/.test(afterKey[i]!)) i++
  if (afterKey[i] !== '"') return { title, widgetCode: '' }
  i++
  let out = ''
  while (i < afterKey.length) {
    const ch = afterKey[i]!
    if (ch === '\\') {
      const next = afterKey[i + 1]
      if (next === undefined) break
      out += unescapeOne(next, afterKey, i + 1).char
      i += 1 + unescapeOne(next, afterKey, i + 1).consume
      continue
    }
    if (ch === '"') break
    out += ch
    i++
  }
  return { title, widgetCode: out }
}

function unescapeJsonString(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') { out += s[i]; continue }
    const next = s[i + 1]
    if (next === undefined) break
    const u = unescapeOne(next, s, i + 1)
    out += u.char
    i += u.consume
  }
  return out
}

function unescapeOne(next: string, src: string, at: number): { char: string; consume: number } {
  if (next === 'n') return { char: '\n', consume: 1 }
  if (next === 'r') return { char: '\r', consume: 1 }
  if (next === 't') return { char: '\t', consume: 1 }
  if (next === '"' || next === '\\' || next === '/') return { char: next, consume: 1 }
  if (next === 'u' && /^[0-9a-fA-F]{4}/.test(src.slice(at + 1, at + 5))) {
    return { char: String.fromCharCode(parseInt(src.slice(at + 1, at + 5), 16)), consume: 5 }
  }
  return { char: next, consume: 1 }
}

function parseClosedFenceBody(body: string): { title: string; widgetCode: string } | null {
  try {
    const obj = JSON.parse(body) as { title?: unknown; widget_code?: unknown }
    if (typeof obj.widget_code !== 'string') return null
    return {
      title: typeof obj.title === 'string' ? obj.title : '',
      widgetCode: obj.widget_code,
    }
  } catch {
    return extractWidgetCodePartial(body)
  }
}

/**
 * 解析完整或流式内容为交替段。
 * - 无围栏 → 单 text 段
 * - 未闭合围栏 → 前面 text + 一个 closed:false 的 widget
 */
export function parseShowWidgets(content: string): ContentSegment[] {
  if (!content.includes('```show-widget')) {
    return content ? [{ kind: 'text', text: content }] : []
  }

  const segments: ContentSegment[] = []
  let cursor = 0
  FENCE_OPEN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FENCE_OPEN.exec(content)) !== null) {
    const openStart = match.index
    const openEnd = match.index + match[0].length
    if (openStart > cursor) {
      segments.push({ kind: 'text', text: content.slice(cursor, openStart) })
    }
    const closeIdx = content.indexOf('```', openEnd)
    if (closeIdx < 0) {
      // 未闭合:partial
      const body = content.slice(openEnd)
      const { title, widgetCode } = extractWidgetCodePartial(body)
      segments.push({ kind: 'widget', title, widgetCode, closed: false })
      return segments
    }
    const body = content.slice(openEnd, closeIdx).trim()
    const parsed = parseClosedFenceBody(body)
    if (parsed && parsed.widgetCode) {
      segments.push({ kind: 'widget', title: parsed.title, widgetCode: parsed.widgetCode, closed: true })
    } else {
      segments.push({
        kind: 'text',
        text: content.slice(openStart, closeIdx + 3),
      })
    }
    cursor = closeIdx + 3
    FENCE_OPEN.lastIndex = cursor
  }
  if (cursor < content.length) {
    segments.push({ kind: 'text', text: content.slice(cursor) })
  }
  return segments.length ? segments : [{ kind: 'text', text: content }]
}
