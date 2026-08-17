/**
 * [INPUT]: mermaid 源码字符串
 * [OUTPUT]: detectDiagramKind / repairMermaidSyntax / summarizeParseError / prepareMermaid /
 *           mermaidMetrics —— 确定性语法闸（doc/mermaid-pipeline.md S4′ Phase A）
 * [POS]: MermaidBlock 渲染前、颜色 sanitize 之前或与之组合；按图类型门控规则（flowchart 含 R7 补 ]）
 * [PROTOCOL]: 变更时更新此头部与 doc/mermaid-pipeline.md §5
 */

import { sanitizeMermaidSource } from './mermaidSanitize.ts'

export type DiagramKind =
  | 'flowchart'
  | 'sequence'
  | 'class'
  | 'er'
  | 'state'
  | 'xy'
  | 'pie'
  | 'gantt'
  | 'unknown'

export interface SyntaxRepairResult {
  source: string
  kind: DiagramKind
  actions: string[]
}

export interface PrepareMermaidResult {
  source: string
  kind: DiagramKind
  actions: string[]
}

/** 本地观测（非远程遥测）；dev 可看 console.debug */
export const mermaidMetrics = {
  parse_ok: 0,
  parse_fail: 0,
  rule_then_parse_ok: 0,
  llm_repair_attempt: 0,
  llm_repair_ok: 0,
  rule_hits: {} as Record<string, number>,
  bump(key: string, n = 1): void {
    if (
      key === 'parse_ok' || key === 'parse_fail' || key === 'rule_then_parse_ok'
      || key === 'llm_repair_attempt' || key === 'llm_repair_ok'
    ) {
      this[key] += n
    } else {
      this.rule_hits[key] = (this.rule_hits[key] ?? 0) + n
    }
    const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    if (nodeEnv?.LUMEN_MERMAID_DEBUG === '1') {
      console.debug('[mermaid-metrics]', key, n, { ...this.rule_hits, parse_ok: this.parse_ok, parse_fail: this.parse_fail })
    }
  },
  reset(): void {
    this.parse_ok = 0
    this.parse_fail = 0
    this.rule_then_parse_ok = 0
    this.llm_repair_attempt = 0
    this.llm_repair_ok = 0
    this.rule_hits = {}
  },
}

const FLOWCHART_KINDS = new Set<DiagramKind>(['flowchart'])

export function detectDiagramKind(source: string): DiagramKind {
  const head = source.replace(/^\uFEFF/, '').trimStart()
  // 跳过前导注释 / init
  const lines = head.split(/\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('%%')) continue
    if (/^(flowchart|graph)\b/i.test(line)) return 'flowchart'
    if (/^sequenceDiagram\b/i.test(line)) return 'sequence'
    if (/^classDiagram\b/i.test(line)) return 'class'
    if (/^erDiagram\b/i.test(line)) return 'er'
    if (/^stateDiagram(-v2)?\b/i.test(line)) return 'state'
    if (/^xychart(-beta)?\b/i.test(line)) return 'xy'
    if (/^pie\b/i.test(line)) return 'pie'
    if (/^gantt\b/i.test(line)) return 'gantt'
    break
  }
  return 'unknown'
}

/** R1 弯引号 */
function normalizeSmartQuotes(source: string): { source: string; hit: boolean } {
  const next = source
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
  return { source: next, hit: next !== source }
}

function isProperlyQuoted(label: string): boolean {
  const t = label.trim()
  if (t.length < 2 || t[0] !== '"') return false
  let i = 1
  while (i < t.length) {
    if (t[i] === '\\') {
      i += 2
      continue
    }
    if (t[i] === '"') return i === t.length - 1
    i += 1
  }
  return false
}

/** 未加引号且含 flowchart 标签危险符 */
function needsQuote(label: string): boolean {
  if (isProperlyQuoted(label)) return false
  // {} () # @ & 裸引号；路径斜杠；未闭合感
  return /[{}()#@&"'`]|\//.test(label)
}

function quoteLabel(label: string): string {
  const t = label.trim()
  if (isProperlyQuoted(t)) return t
  return `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

type ShapePair = { open: string; close: string }

/** 长开括号优先 */
const SHAPE_PAIRS: ShapePair[] = [
  { open: '[[', close: ']]' },
  { open: '[(', close: ')]' },
  { open: '((', close: '))' },
  { open: '{{', close: '}}' },
  { open: '[/', close: '/]' },
  { open: '[\\', close: '\\]' },
  { open: '[', close: ']' },
  { open: '(', close: ')' },
  { open: '{', close: '}' },
]

function findShapeClose(source: string, contentStart: number, open: string, close: string): number {
  let depth = 1
  let i = contentStart
  let inQuote = false
  while (i < source.length) {
    const ch = source[i]!
    if (inQuote) {
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === '"') inQuote = false
      i += 1
      continue
    }
    if (ch === '"') {
      inQuote = true
      i += 1
      continue
    }
    if (open !== close && source.startsWith(open, i)) {
      depth += 1
      i += open.length
      continue
    }
    if (source.startsWith(close, i)) {
      depth -= 1
      if (depth === 0) return i
      i += close.length
      continue
    }
    i += 1
  }
  return -1
}

/**
 * flowchart：扫描 ID+形状，未引号危险标签加双引号。
 * 禁止改 ID；跳过已正确引号标签。
 */
function quoteFlowchartLabels(source: string): { source: string; actions: string[] } {
  const actions: string[] = []
  let out = ''
  let i = 0
  while (i < source.length) {
    const rest = source.slice(i)
    const idMatch = rest.match(/^([A-Za-z_][\w-]*)/)
    if (idMatch) {
      const id = idMatch[1]!
      let j = i + id.length
      let matched = false
      for (const { open, close } of SHAPE_PAIRS) {
        if (!source.startsWith(open, j)) continue
        const contentStart = j + open.length
        const closeIdx = findShapeClose(source, contentStart, open, close)
        if (closeIdx < 0) continue
        const content = source.slice(contentStart, closeIdx)
        let newContent = content
        if (needsQuote(content)) {
          newContent = quoteLabel(content)
          actions.push('quote-label')
        }
        out += id + open + newContent + close
        i = closeIdx + close.length
        matched = true
        break
      }
      if (matched) continue
    }
    out += source[i]
    i += 1
  }
  return { source: out, actions }
}

/** R5：仅 flowchart；勿碰 sequence 的 A->B: */
function fixFlowchartArrows(source: string): { source: string; hit: boolean } {
  // 非 -- / == / . 前缀的 -> 改为 -->
  const next = source.replace(/(?<![-.=])(\s*)->(\s*)(?!>)/g, '$1-->$2')
  return { source: next, hit: next !== source }
}

/**
 * R7：矩形节点写了 ID["标签" 却漏 ]，下一 token 已是边。
 * 模型常把边标签接到未闭合节点上：E["x" -. "贯穿" .-> A
 * 已有 ] 的不匹配；不改 ID。
 */
function closeQuotedRectBeforeEdge(source: string): { source: string; hit: boolean } {
  const next = source.replace(
    /([A-Za-z_][\w-]*)\[\s*"((?:[^"\\]|\\.)*)"(\s*)(?=-->|---|==>|-\.|-\.->|\.->|==|--)/g,
    (_m, id: string, label: string, ws: string) => `${id}["${label}"]${ws}`,
  )
  return { source: next, hit: next !== source }
}

/**
 * 确定性语法 repair（doc §5）。
 * unknown：仅 R1；flowchart：R1+R2+R3+R4+R5+R7。
 */
export function repairMermaidSyntax(source: string): SyntaxRepairResult {
  const kind = detectDiagramKind(source)
  const actions: string[] = []
  let text = source.replace(/\r\n/g, '\n')

  const q = normalizeSmartQuotes(text)
  text = q.source
  if (q.hit) {
    actions.push('smart-quotes')
    mermaidMetrics.bump('R1')
  }

  if (FLOWCHART_KINDS.has(kind)) {
    const quoted = quoteFlowchartLabels(text)
    text = quoted.source
    if (quoted.actions.length) {
      actions.push(...quoted.actions)
      mermaidMetrics.bump('R2/R3', quoted.actions.length)
    }
    const closed = closeQuotedRectBeforeEdge(text)
    text = closed.source
    if (closed.hit) {
      actions.push('close-rect')
      mermaidMetrics.bump('R7')
    }
    const arrows = fixFlowchartArrows(text)
    text = arrows.source
    if (arrows.hit) {
      actions.push('arrow-fix')
      mermaidMetrics.bump('R5')
    }
  }

  return { source: text, kind, actions }
}

const TOKEN_HINTS: Array<{ re: RegExp; hint: string }> = [
  {
    re: /DIAMOND_START|got 'DIAMOND/i,
    hint: '标签里的 { 未加引号（路径模板请写成 ID["...{x}"]）',
  },
  {
    re: /Expecting.*STADIUM|got 'STADIUM|PQ|LEXER/i,
    hint: '引号未配对或标签形状括号不匹配',
  },
  {
    re: /EOF|Expecting 'NEWLINE'|got 'EOF'/i,
    hint: '可能缺少 end 或围栏/括号未闭合',
  },
]

/** R6：短错误摘要 */
export function summarizeParseError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '流程图解析失败')
  const lineMatch = raw.match(/Parse error on line\s*(\d+)/i)
    ?? raw.match(/\bline\s*(\d+)\b/i)
  const line = lineMatch?.[1]
  let hint = ''
  for (const { re, hint: h } of TOKEN_HINTS) {
    if (re.test(raw)) {
      hint = h
      break
    }
  }
  if (!hint) {
    const first = raw.split('\n')[0]?.trim() ?? raw
    hint = first.length > 120 ? `${first.slice(0, 117)}…` : first
  }
  if (line) return `第 ${line} 行附近 · ${hint}`
  return hint
}

export function prepareMermaid(raw: string): PrepareMermaidResult {
  const syntax = repairMermaidSyntax(raw)
  const color = sanitizeMermaidSource(syntax.source)
  return {
    source: color.source,
    kind: syntax.kind,
    actions: [...syntax.actions, ...color.actions],
  }
}

export type ValidateOk = {
  ok: true
  source: string
  kind: DiagramKind
  actions: string[]
  ruleHelped: boolean
}

export type ValidateFail = {
  ok: false
  source: string
  kind: DiagramKind
  actions: string[]
  error: string
  detail: string
}

/**
 * prepare + 官方 parse（注入 parse 以便单测）。
 * parse 必须与 render 同源 mermaid 实例。
 */
export async function prepareAndValidate(
  raw: string,
  parse: (src: string) => void | Promise<void>,
): Promise<ValidateOk | ValidateFail> {
  const prepared = prepareMermaid(raw)
  const hadRules = prepared.actions.some((a) =>
    a === 'smart-quotes' || a === 'quote-label' || a === 'arrow-fix' || a === 'close-rect' || a.startsWith('quote-label'),
  )
  try {
    await parse(prepared.source)
    mermaidMetrics.bump('parse_ok')
    if (hadRules) mermaidMetrics.bump('rule_then_parse_ok')
    return {
      ok: true,
      source: prepared.source,
      kind: prepared.kind,
      actions: prepared.actions,
      ruleHelped: hadRules,
    }
  } catch (e) {
    mermaidMetrics.bump('parse_fail')
    const detail = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      source: prepared.source,
      kind: prepared.kind,
      actions: prepared.actions,
      error: summarizeParseError(e),
      detail,
    }
  }
}
