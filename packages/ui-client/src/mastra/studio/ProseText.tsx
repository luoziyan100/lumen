/**
 * [INPUT]: reading-ask.ts's prose (shown text and its bold, code and formula marks), KaTeX and its stylesheet
 * [OUTPUT]: marked (a slice of shown text as React nodes: strong, code, or a whole KaTeX formula carrying its shown-text range in data-start/data-end), Rich (a whole string drawn the same way)
 * [POS]: the one drawer of reading text. The Reading view's paragraphs, headings, tables, captions and ask window, and the conversation's ask bubble use it,
 *        so a formula looks the same wherever a quote travels. A formula's source stays in the shown text; selection offsets map through data-start/data-end (Reading.tsx's shownOffset)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { ReactNode } from 'react'
import { prose, type Prose, type ProseMark } from './reading-ask.ts'

const formulas = new Map<string, string>()
function formula(mark: ProseMark): string {
  const key = `${mark.display ? 'D' : 'I'}${mark.tex}`
  let html = formulas.get(key)
  if (html === undefined) {
    html = katex.renderToString(mark.tex!, { throwOnError: false, displayMode: !!mark.display })
    if (formulas.size > 500) formulas.clear()
    formulas.set(key, html)
  }
  return html
}

export function marked({ text, marks }: Prose, from: number, to: number): ReactNode[] {
  const parts: ReactNode[] = []
  let at = from
  for (const mark of marks) {
    const start = Math.max(mark.start, from), end = Math.min(mark.end, to)
    if (start >= end) continue
    if (start > at) parts.push(text.slice(at, start))
    parts.push(mark.kind === 'math'
      ? <span key={start} className={`reading-math${mark.display ? ' is-display' : ''}`} data-start={mark.start} data-end={mark.end} dangerouslySetInnerHTML={{ __html: formula(mark) }} />
      : mark.kind === 'code' ? <code key={start}>{text.slice(start, end)}</code> : <strong key={start}>{text.slice(start, end)}</strong>)
    at = end
  }
  if (at < to) parts.push(text.slice(at, to))
  return parts
}

export function Rich({ text }: { text: string }) {
  const shown = prose(text)
  return <>{marked(shown, 0, shown.text.length)}</>
}
