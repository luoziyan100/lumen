/**
 * [INPUT]: Kumo Button;ASK_USER_COPY;PendingAsk 题目结构
 * [OUTPUT]: AskUserDialog —— ask_user 输入框上方悬浮问询卡
 *           多题:Claude 式一题一页 +「i of n」+ 左右切换;选项 +「其他」幽灵输入 + 跳过
 * [POS]: 贴 composer 上方,无遮罩、不居中霸屏;见 doc/ask-user.md;
 *        「其他」是真 input + placeholder,不是实心标签堵光标
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useMemo, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { ASK_USER_COPY } from '../appCopy'
import type { AskUserOption, AskUserQuestion } from '../useAgent'
import { BackIcon, ChevronIcon, CloseIcon } from './icons'

export interface AskUserSubmitPayload {
  answers: Record<string, { selected: string[]; note?: string }>
  skipped?: boolean
}

function questionAnswered(
  q: AskUserQuestion,
  selected: Record<string, string>,
  notes: Record<string, string>,
): boolean {
  if (selected[q.id]) return true
  if ((notes[q.id] ?? '').trim()) return true
  return false
}

export function AskUserDialog({
  questions,
  busy,
  onSubmit,
  onSkip,
}: {
  questions: AskUserQuestion[]
  busy?: boolean
  onSubmit: (payload: AskUserSubmitPayload) => void | Promise<void>
  onSkip: () => void | Promise<void>
}) {
  const multi = questions.length > 1
  const [page, setPage] = useState(0)
  const safePage = Math.min(Math.max(0, page), Math.max(0, questions.length - 1))
  const q = questions[safePage]

  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const item of questions) init[item.id] = ''
    return init
  })
  const [notes, setNotes] = useState<Record<string, string>>({})

  const canSubmit = useMemo(() => {
    return questions.every((item) => questionAnswered(item, selected, notes))
  }, [questions, selected, notes])

  const currentAnswered = q ? questionAnswered(q, selected, notes) : false

  function goPrev(): void {
    setPage((p) => Math.max(0, p - 1))
  }

  function goNext(): void {
    setPage((p) => Math.min(questions.length - 1, p + 1))
  }

  function pick(opt: AskUserOption): void {
    if (!q) return
    setSelected((prev) => ({ ...prev, [q.id]: opt.label }))
    setNotes((prev) => ({ ...prev, [q.id]: '' }))
    // 选完自动进下一题(Claude 式节奏);末题停住等确认
    if (safePage < questions.length - 1) {
      setPage(safePage + 1)
    }
  }

  function onOtherChange(value: string): void {
    if (!q) return
    setNotes((prev) => ({ ...prev, [q.id]: value }))
    if (value.trim()) {
      setSelected((prev) => ({ ...prev, [q.id]: '' }))
    }
  }

  function onOtherFocus(): void {
    if (!q) return
    setSelected((prev) => ({ ...prev, [q.id]: '' }))
  }

  async function submit(): Promise<void> {
    if (!canSubmit || busy) return
    const answers: AskUserSubmitPayload['answers'] = {}
    for (const item of questions) {
      const list: string[] = []
      if (selected[item.id]) list.push(selected[item.id])
      const note = (notes[item.id] ?? '').trim()
      if (note) {
        if (!list.includes(ASK_USER_COPY.otherLabel)) list.push(ASK_USER_COPY.otherLabel)
      }
      answers[item.id] = {
        selected: list,
        ...(note ? { note } : {}),
      }
    }
    await onSubmit({ answers })
  }

  if (!q) return null

  const note = notes[q.id] ?? ''
  const otherActive = !selected[q.id] && note.trim().length > 0
  // 标题:有 header 用 header,否则用题干(单题不重复显示 body 题干)
  const headLine = q.header || q.question || ASK_USER_COPY.title
  const showBodyQuestion = Boolean(q.header) && Boolean(q.question)

  return (
    <aside className="ask-user-card" role="dialog" aria-label={ASK_USER_COPY.title}>
      <div className="ask-user-head">
        <h2 className="ask-user-title">{headLine}</h2>
        <div className="ask-user-head-trail">
          {multi && (
            <div className="ask-user-pager" role="navigation" aria-label={ASK_USER_COPY.pagerLabel}>
              <button
                type="button"
                className="ask-user-page-btn"
                aria-label={ASK_USER_COPY.prev}
                disabled={busy || safePage <= 0}
                onClick={goPrev}
              >
                <BackIcon size={14} />
              </button>
              <span className="ask-user-page-count" aria-live="polite">
                {safePage + 1} {ASK_USER_COPY.of} {questions.length}
              </span>
              <button
                type="button"
                className="ask-user-page-btn"
                aria-label={ASK_USER_COPY.next}
                disabled={busy || safePage >= questions.length - 1}
                onClick={goNext}
              >
                <span className="ask-user-page-next">
                  <ChevronIcon />
                </span>
              </button>
            </div>
          )}
          <button
            type="button"
            className="ask-user-x"
            aria-label={ASK_USER_COPY.skip}
            disabled={busy}
            onClick={() => { void onSkip() }}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </div>

      <div className="ask-user-body">
        <section className="ask-user-q" key={q.id}>
          {showBodyQuestion && <p className="ask-user-q-text">{q.question}</p>}
          <ul className="ask-user-opts">
            {q.options.map((opt, oi) => {
              const active = selected[q.id] === opt.label
              return (
                <li key={`${q.id}-${oi}`}>
                  <button
                    type="button"
                    className={`ask-user-opt${active ? ' is-active' : ''}`}
                    disabled={busy}
                    onClick={() => pick(opt)}
                  >
                    <span className="ask-user-opt-n">{oi + 1}</span>
                    <span className="ask-user-opt-main">
                      <span className="ask-user-opt-label">{opt.label}</span>
                      {opt.description && (
                        <span className="ask-user-opt-desc">{opt.description}</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
            <li>
              <label
                className={`ask-user-opt ask-user-opt-other${otherActive ? ' is-active' : ''}`}
              >
                <span className="ask-user-opt-n" aria-hidden>+</span>
                <input
                  type="text"
                  className="ask-user-other-input"
                  disabled={busy}
                  placeholder={ASK_USER_COPY.otherPlaceholder}
                  value={note}
                  aria-label={ASK_USER_COPY.otherPlaceholder}
                  onFocus={onOtherFocus}
                  onChange={(e) => onOtherChange(e.target.value)}
                />
              </label>
            </li>
          </ul>
          {multi && !currentAnswered && (
            <p className="ask-user-page-hint">{ASK_USER_COPY.pageHint}</p>
          )}
        </section>
      </div>

      <div className="ask-user-actions">
        {multi && safePage < questions.length - 1 ? (
          <Button
            type="button"
            variant="primary"
            disabled={busy || !currentAnswered}
            onClick={goNext}
          >
            {ASK_USER_COPY.next}
          </Button>
        ) : (
          <>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { void onSkip() }}>
              {ASK_USER_COPY.skip}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!canSubmit || !!busy}
              onClick={() => { void submit() }}
            >
              {ASK_USER_COPY.submit}
            </Button>
          </>
        )}
      </div>
    </aside>
  )
}
