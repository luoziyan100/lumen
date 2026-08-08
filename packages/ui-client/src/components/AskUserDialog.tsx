/**
 * [INPUT]: Kumo Button;ASK_USER_COPY;PendingAsk 题目结构
 * [OUTPUT]: AskUserDialog —— ask_user 输入框上方悬浮问询卡(选项 +「其他」幽灵输入 + 跳过)
 * [POS]: 贴 composer 上方,无遮罩、不居中霸屏;见 doc/ask-user.md;
 *        「其他」是真 input + placeholder,不是实心标签堵光标
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

  const canSubmit = useMemo(() => {
    return questions.every((q) => {
      if (selected[q.id]) return true
      if ((notes[q.id] ?? '').trim()) return true
      return false
    })
  }, [questions, selected, notes])

  function pick(q: AskUserQuestion, opt: AskUserOption): void {
    setSelected((prev) => ({ ...prev, [q.id]: opt.label }))
    setNotes((prev) => ({ ...prev, [q.id]: '' }))
  }

  function onOtherChange(q: AskUserQuestion, value: string): void {
    setNotes((prev) => ({ ...prev, [q.id]: value }))
    if (value.trim()) {
      setSelected((prev) => ({ ...prev, [q.id]: '' }))
    }
  }

  function onOtherFocus(q: AskUserQuestion): void {
    setSelected((prev) => ({ ...prev, [q.id]: '' }))
  }

  async function submit(): Promise<void> {
    if (!canSubmit || busy) return
    const answers: AskUserSubmitPayload['answers'] = {}
    for (const q of questions) {
      const list: string[] = []
      if (selected[q.id]) list.push(selected[q.id])
      const note = (notes[q.id] ?? '').trim()
      if (note) {
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
        {questions.map((q, qi) => {
          const note = notes[q.id] ?? ''
          const otherActive = !selected[q.id] && note.trim().length > 0
          return (
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
                  const active = selected[q.id] === opt.label
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
                      onFocus={() => onOtherFocus(q)}
                      onChange={(e) => onOtherChange(q, e.target.value)}
                    />
                  </label>
                </li>
              </ul>
            </section>
          )
        })}
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
