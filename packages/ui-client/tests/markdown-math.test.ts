/**
 * [INPUT]: markdownMath.normalizeMathDelimiters + remark-math + rehype-katex + ReactMarkdown SSR
 * [OUTPUT]: M-T1..M-T14 + 跨围栏/code span 不得配对 closer — LaTeX 定界符兼容;代码区原样;流式不跑 KaTeX
 * [POS]: briefs/active/rendering/markdown-math-wide-mermaid-fix.md Phase 1
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { normalizeMathDelimiters } from '../src/components/markdownMath.ts'
import { MATH_DIALECT_FIXTURE } from './fixtures/l98-rendering.ts'

function renderKatex(markdown: string, opts?: { deferMath?: boolean }): string {
  if (opts?.deferMath) {
    return renderToStaticMarkup(createElement(ReactMarkdown, null, markdown))
  }
  const normalized = normalizeMathDelimiters(markdown)
  return renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex] }, normalized),
  )
}

function katexStats(html: string): { display: number; katex: number; inline: number } {
  const display = (html.match(/class="katex-display"/g) ?? []).length
  const katex = (html.match(/class="katex"/g) ?? []).length
  return { display, katex, inline: katex - display }
}

describe('M-T baseline: remark-math without normalizer does not see LaTeX delimiters', () => {
  it('L98 fixture through raw remark-math yields 0 katex', () => {
    const html = renderToStaticMarkup(
      createElement(ReactMarkdown, { remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex] }, MATH_DIALECT_FIXTURE),
    )
    const s = katexStats(html)
    assert.equal(s.katex, 0)
    assert.equal(s.display, 0)
    assert.equal(s.inline, 0)
  })
})

describe('markdown math delimiters', () => {
  it('M-T1 $x$ stays inline katex', () => {
    const src = '$x$'
    assert.equal(normalizeMathDelimiters(src), src)
    const s = katexStats(renderKatex(src))
    assert.equal(s.inline, 1)
    assert.equal(s.display, 0)
  })

  it('M-T2 $$x$$ stays display katex', () => {
    const src = '$$\nx\n$$'
    assert.equal(normalizeMathDelimiters(src), src)
    const s = katexStats(renderKatex(src))
    assert.equal(s.display, 1)
    assert.equal(s.inline, 0)
  })

  it('M-T3 \\(x\\) becomes inline katex', () => {
    const s = katexStats(renderKatex(String.raw`\(x\)`))
    assert.equal(s.inline, 1)
    assert.equal(s.display, 0)
  })

  it('M-T4 \\[x\\] becomes display katex', () => {
    const s = katexStats(renderKatex(String.raw`\[x\]`))
    assert.equal(s.display, 1)
    assert.equal(s.inline, 0)
  })

  it('M-T5 L98 fixture → 2 display + 4 inline', () => {
    const s = katexStats(renderKatex(MATH_DIALECT_FIXTURE))
    assert.equal(s.display, 2)
    assert.equal(s.inline, 4)
    assert.equal(s.katex, 6)
  })

  it('M-T6 fenced tex keeps \\[x\\] and yields 0 katex', () => {
    const src = '```tex\n\\[not rendered\\]\n```\n'
    assert.equal(normalizeMathDelimiters(src), src)
    const s = katexStats(renderKatex(src))
    assert.equal(s.katex, 0)
    assert.match(normalizeMathDelimiters(src), /\\\[not rendered\\\]/)
  })

  it('M-T7 fenced mermaid label keeps \\(x\\)', () => {
    const src = '```mermaid\nflowchart TD\n  A["\\(x\\)"] --> B\n```\n'
    assert.equal(normalizeMathDelimiters(src), src)
  })

  it('M-T8 inline code keeps \\(x\\) and yields 0 katex', () => {
    const src = '`\\(not rendered\\)`'
    assert.equal(normalizeMathDelimiters(src), src)
    const s = katexStats(renderKatex(src))
    assert.equal(s.katex, 0)
  })

  it('M-T9 double-backtick code span stays code', () => {
    const src = '``\\(still code\\)``'
    assert.equal(normalizeMathDelimiters(src), src)
    const s = katexStats(renderKatex(src))
    assert.equal(s.katex, 0)
  })

  it('M-T10 unclosed openers do not swallow trailing prose', () => {
    const src = String.raw`\(x still here \[y also here`
    assert.equal(normalizeMathDelimiters(src), src)
    const s = katexStats(renderKatex(src))
    assert.equal(s.katex, 0)
    assert.match(renderKatex(src), /still here/)
    assert.match(renderKatex(src), /also here/)
  })

  it('M-T10b unclosed \\( does not close across fenced code', () => {
    const src = 'before \\( unclosed\n```tex\n\\) inside fence\n```\nafter \\(ok\\)\n'
    const out = normalizeMathDelimiters(src)
    assert.match(out, /\\\) inside fence/)
    assert.match(out, /after \$ok\$/)
    assert.doesNotMatch(out, /before \$/)
    const s = katexStats(renderKatex(src))
    assert.equal(s.inline, 1)
    assert.equal(s.display, 0)
  })

  it('M-T10c unclosed \\( does not close across inline code', () => {
    const src = 'before \\( unclosed `\\) still code`'
    assert.equal(normalizeMathDelimiters(src), src)
    assert.match(normalizeMathDelimiters(src), /`\\\) still code`/)
    const s = katexStats(renderKatex(src))
    assert.equal(s.katex, 0)
  })

  it('M-T11 escaped opener stays ordinary text', () => {
    const src = String.raw`\\(not math\\)`
    assert.equal(normalizeMathDelimiters(src), src)
    const s = katexStats(renderKatex(src))
    assert.equal(s.katex, 0)
  })

  it('M-T12 formula body keeps \\{0,1\\} and katex succeeds', () => {
    const src = String.raw`\[R(x,\tau)\in\{0,1\}\]`
    const normalized = normalizeMathDelimiters(src)
    assert.match(normalized, /\\\{0,1\\\}/)
    const s = katexStats(renderKatex(src))
    assert.equal(s.display, 1)
    assert.doesNotMatch(renderKatex(src), /ParseError|katex-error/)
  })

  it('M-T13 mixed $x$ and \\(y\\) each one inline, not double-wrapped', () => {
    const src = String.raw`$x$ and \(y\)`
    const normalized = normalizeMathDelimiters(src)
    assert.equal(normalized, '$x$ and $y$')
    const s = katexStats(renderKatex(src))
    assert.equal(s.inline, 2)
    assert.equal(s.display, 0)
  })

  it('M-T14 normalizer is idempotent', () => {
    const once = normalizeMathDelimiters(MATH_DIALECT_FIXTURE)
    const twice = normalizeMathDelimiters(once)
    assert.equal(twice, once)
    assert.equal(normalizeMathDelimiters(String.raw`\(x\)`), normalizeMathDelimiters(normalizeMathDelimiters(String.raw`\(x\)`)))
  })

  it('M8 streaming deferMath does not run katex', () => {
    const html = renderKatex(MATH_DIALECT_FIXTURE, { deferMath: true })
    assert.equal(katexStats(html).katex, 0)
    assert.doesNotMatch(html, /katex/)
  })

  it('Markdown.tsx final path normalizes; stream path does not', async () => {
    const src = await readFile(new URL('../src/components/Markdown.tsx', import.meta.url), 'utf8')
    assert.match(src, /normalizeMathDelimiters/)
    assert.match(src, /deferMath \? children : normalizeMathDelimiters\(children\)/)
  })

  it('does not trim surrounding newlines', () => {
    const src = String.raw`
\(a\)
`
    assert.equal(normalizeMathDelimiters(src), '\n$a$\n')
  })
})
