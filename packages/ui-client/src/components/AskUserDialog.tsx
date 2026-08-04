/**
 * [INPUT]: Kumo Button;ASK_USER_COPY;PendingAsk 题目结构
 * [OUTPUT]: AskUserDialog —— ask_user 输入框上方悬浮问询卡(多选 + 备注 + 跳过)
 * [POS]: 贴 composer 上方,无遮罩、不居中霸屏;见 doc/ask-user.md
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useMemo, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { ASK_USER_COPY } from '../appCopy'
import type { AskUserOption, AskUserQuestion } from '../useAgent'
import { CloseIcon } from './icons'

export interface AskUserSubmitPayload {
  answers: Record<string, { selected: string[]; note?: string }>
  skipped?: boolean
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
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const q of questions) init[q.id] = ''
    return init
  })
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [otherOn, setOtherOn] = useState<Record<string, boolean>>({})

  const canSubmit = useMemo(() => {
    return questions.every((q) => {
      const sel = selected[q.id]
      if (sel) return true
      if (otherOn[q.id] && (notes[q.id] ?? '').trim()) return true
      return false
    })
  }, [questions, selected, otherOn, notes])

  function pick(q: AskUserQuestion, opt: AskUserOption): void {
    setSelected((prev) => ({ ...prev, [q.id]: opt.label }))
    setOtherOn((prev) => ({ ...prev, [q.id]: false }))
  }

  function toggleOther(q: AskUserQuestion): void {
    setOtherOn((prev) => {
      const next = !prev[q.id]
      if (next) setSelected((s) => ({ ...s, [q.id]: '' }))
      return { ...prev, [q.id]: next }
    })
  }

  async function submit(): Promise<void> {
    if (!canSubmit || busy) return
    const answers: AskUserSubmitPayload['answers'] = {}
    for (const q of questions) {
      const list: string[] = []
      if (selected[q.id]) list.push(selected[q.id])
      const note = (notes[q.id] ?? '').trim()
      if (otherOn[q.id] && note) {
        if (!list.includes(ASK_USER_COPY.otherLabel)) list.push(ASK_USER_COPY.otherLabel)
      }
      answers[q.id] = {
        selected: list,
        ...(note ? { note } : {}),
      }
    }
    await onSubmit({ answers })
  }

  const title = questions[0]?.header || questions[0]?.question || ASK_USER_COPY.title
  const titleIsQuestion = questions.length === 1 && !questions[0]?.header

  return (
    <aside className="ask-user-card" role="dialog" aria-label={ASK_USER_COPY.title}>
      <div className="ask-user-head">
        <h2 className="ask-user-title">{title}</h2>
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

      <div className="ask-user-body">
        {questions.map((q, qi) => (
          <section key={q.id} className="ask-user-q">
            {questions.length > 1 && (
              <div className="ask-user-q-head">
                {q.header || `${ASK_USER_COPY.questionN}${qi + 1}`}
              </div>
            )}
            {!(titleIsQuestion && qi === 0) && (
              <p className="ask-user-q-text">{q.question}</p>
            )}
            <ul className="ask-user-opts">
              {q.options.map((opt, oi) => {
                const active = selected[q.id] === opt.label && !otherOn[q.id]
                return (
                  <li key={`${q.id}-${oi}`}>
                    <button
                      type="button"
                      className={`ask-user-opt${active ? ' is-active' : ''}`}
                      disabled={busy}
                      onClick={() => pick(q, opt)}
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
                <button
                  type="button"
                  className={`ask-user-opt ask-user-opt-other${otherOn[q.id] ? ' is-active' : ''}`}
                  disabled={busy}
                  onClick={() => toggleOther(q)}
                >
                  <span className="ask-user-opt-n">+</span>
                  <span className="ask-user-opt-main">
                    <span className="ask-user-opt-label">{ASK_USER_COPY.otherLabel}</span>
                  </span>
                </button>
              </li>
            </ul>
            {(otherOn[q.id] || (notes[q.id] ?? '').length > 0) && (
              <textarea
                className="ask-user-note"
                rows={2}
                disabled={busy}
                placeholder={ASK_USER_COPY.notePlaceholder}
                value={notes[q.id] ?? ''}
                onChange={(e) => setNotes((prev) => ({ ...prev, [q.id]: e.target.value }))}
              />
            )}
          </section>
        ))}
      </div>

      <div className="ask-user-actions">
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
      </div>
    </aside>
  )
}
