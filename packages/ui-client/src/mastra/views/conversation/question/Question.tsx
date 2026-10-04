/**
 * [INPUT]: 原生 ask_user suspendPayload、官方恢复回调与原 ask-user 卡片样式
 * [OUTPUT]: Question：编号纵排选项、自由补充与提交状态；单选回字符串，多选回字符串数组
 * [POS]: 由会话挂在输入坞上方；只恢复展示，不合成跳过或改写原生 resume 契约
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { MASTRA_COPY as C } from '../../../../copy/mastraCopy'
import './question.css'

function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null }
export function Question({ payload, onAnswer }: { payload: unknown; onAnswer: (text: string | string[]) => Promise<void> }) {
  const titleId = useId()
  const [answer, setAnswer] = useState(''), [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const data = object(payload), question = typeof data?.question === 'string' ? data.question : C.question
  const multiple = data?.selectionMode === 'multi_select'
  const options = Array.isArray(data?.options) ? data.options.flatMap(value => {
    const option = object(value)
    return typeof option?.label === 'string' ? [{ label: option.label, description: typeof option.description === 'string' ? option.description : '' }] : []
  }) : []
  const result = multiple ? [...selected, ...(answer.trim() ? [answer.trim()] : [])] : selected[0] ?? answer.trim()
  function pick(label: string) {
    if (!multiple) { setSelected([label]); setAnswer(''); return }
    setSelected(current => current.includes(label) ? current.filter(value => value !== label) : [...current, label])
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!result.length || busy) return
    setBusy(true); setError('')
    void onAnswer(result).catch(error => { setError(String(error)); setBusy(false) })
  }
  return <form className="ask-user-card mw-native-question" aria-labelledby={titleId} onSubmit={submit}>
    <div className="ask-user-head"><h2 className="ask-user-title" id={titleId}>{question}</h2></div>
    <div className="ask-user-body">
      {multiple && <p className="ask-user-page-hint">{C.multipleAnswers}</p>}
      <ul className="ask-user-opts">
        {options.map((option, index) => <li key={`${index}:${option.label}`}>
          <button className={`ask-user-opt${selected.includes(option.label) ? ' is-active' : ''}`} type="button" aria-pressed={selected.includes(option.label)} disabled={busy} onClick={() => pick(option.label)}>
            <span className="ask-user-opt-n" aria-hidden>{index + 1}</span>
            <span className="ask-user-opt-main"><span className="ask-user-opt-label">{option.label}</span>{option.description && <span className="ask-user-opt-desc">{option.description}</span>}</span>
          </button>
        </li>)}
        <li><label className={`ask-user-opt ask-user-opt-other${answer.trim() ? ' is-active' : ''}`}>
          <span className="ask-user-opt-n" aria-hidden>+</span>
          <input className="ask-user-other-input" aria-label={C.answer} placeholder={options.length ? C.otherAnswer : C.answer} value={answer} disabled={busy} onFocus={() => { if (!multiple) setSelected([]) }} onChange={event => { setAnswer(event.target.value); if (!multiple) setSelected([]) }} />
        </label></li>
      </ul>
    </div>
    {error && <p className="ask-user-error" role="alert">{error}</p>}
    <div className="ask-user-actions"><Button type="submit" disabled={busy || !result.length}>{busy ? C.submitting : C.answer}</Button></div>
  </form>
}
