/**
 * [INPUT]: 最终态 Markdown 原文
 * [OUTPUT]: normalizeMathDelimiters —— 代码区外、已闭合、未转义的 \( \) / \[ \]
 *           转为 remark-math 已支持的 $ / $$;不解析 TeX,不碰美元形式
 * [POS]: Markdown.tsx 终稿管线入口;流式 deferMath 不走此函数。
 *        CommonMark 会把反斜杠当转义吃掉,必须在 tokenizer 之前归一。
 *        未闭合 opener 不得跨 fenced code / inline code 配对 closer。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

function atLineStart(src: string, i: number): boolean {
  return i === 0 || src[i - 1] === '\n'
}

/** 连续反斜杠以 i 结尾时,i 处的 `\` 是否未被转义(奇数长度) */
function isUnescapedBackslash(src: string, i: number): boolean {
  if (src[i] !== '\\') return false
  let n = 0
  while (i - n >= 0 && src[i - n] === '\\') n++
  return n % 2 === 1
}

function fenceOpenerAt(src: string, i: number): { marker: '`' | '~'; len: number; afterOpener: number } | null {
  if (!atLineStart(src, i)) return null
  let j = i
  let spaces = 0
  while (spaces < 3 && src[j] === ' ') {
    spaces++
    j++
  }
  const ch = src[j]
  if (ch !== '`' && ch !== '~') return null
  let len = 0
  while (src[j + len] === ch) len++
  if (len < 3) return null
  return { marker: ch, len, afterOpener: j + len }
}

function skipFenceLineRest(src: string, from: number): number {
  let k = from
  while (k < src.length && src[k] !== '\n') k++
  if (k < src.length && src[k] === '\n') k++
  return k
}

/** 从行首扫描围栏;未闭合则吞到文末(与 CommonMark 一致) */
function readFence(src: string, i: number): number | null {
  const opener = fenceOpenerAt(src, i)
  if (!opener) return null
  let k = skipFenceLineRest(src, opener.afterOpener)
  while (k < src.length) {
    let p = k
    let spaces = 0
    while (spaces < 3 && src[p] === ' ') {
      spaces++
      p++
    }
    let clen = 0
    while (src[p + clen] === opener.marker) clen++
    if (clen >= opener.len) {
      let q = p + clen
      while (q < src.length && (src[q] === ' ' || src[q] === '\t')) q++
      if (q >= src.length || src[q] === '\n') {
        return q >= src.length ? q : q + 1
      }
    }
    while (k < src.length && src[k] !== '\n') k++
    if (k < src.length) k++
  }
  return src.length
}

function readInlineCode(src: string, i: number): number | null {
  if (src[i] !== '`') return null
  let len = 0
  while (src[i + len] === '`') len++
  let j = i + len
  while (j < src.length) {
    if (src[j] === '`') {
      let clen = 0
      while (src[j + clen] === '`') clen++
      if (clen === len) return j + clen
      j += clen
      continue
    }
    j++
  }
  return null
}

function findMathCloser(src: string, from: number, closeChar: ')' | ']'): number {
  let i = from
  while (i < src.length - 1) {
    if (fenceOpenerAt(src, i)) return -1
    if (src[i] === '`') {
      const codeEnd = readInlineCode(src, i)
      if (codeEnd !== null) return -1
    }
    if (src[i] === '\\' && src[i + 1] === closeChar && isUnescapedBackslash(src, i)) return i
    i++
  }
  return -1
}

/**
 * 单次左到右扫描。幂等:已是 $ / $$ 的公式不会再被改写。
 */
export function normalizeMathDelimiters(markdown: string): string {
  const out: string[] = []
  let i = 0
  const n = markdown.length
  while (i < n) {
    if (atLineStart(markdown, i)) {
      const fenceEnd = readFence(markdown, i)
      if (fenceEnd !== null) {
        out.push(markdown.slice(i, fenceEnd))
        i = fenceEnd
        continue
      }
    }
    if (markdown[i] === '`') {
      const codeEnd = readInlineCode(markdown, i)
      if (codeEnd !== null) {
        out.push(markdown.slice(i, codeEnd))
        i = codeEnd
        continue
      }
    }
    const next = markdown[i + 1]
    if (
      markdown[i] === '\\'
      && (next === '(' || next === '[')
      && isUnescapedBackslash(markdown, i)
    ) {
      const display = next === '['
      const closeAt = findMathCloser(markdown, i + 2, display ? ']' : ')')
      if (closeAt < 0) {
        out.push(markdown.slice(i, i + 2))
        i += 2
        continue
      }
      const body = markdown.slice(i + 2, closeAt)
      if (display) {
        const lead = body.startsWith('\n') ? '' : '\n'
        const trail = body.endsWith('\n') ? '' : '\n'
        out.push('$$', lead, body, trail, '$$')
      } else {
        out.push('$', body, '$')
      }
      i = closeAt + 2
      continue
    }
    out.push(markdown[i]!)
    i += 1
  }
  return out.join('')
}
