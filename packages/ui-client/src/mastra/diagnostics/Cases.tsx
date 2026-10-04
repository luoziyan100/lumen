/**
 * [INPUT]: 会话诊断 API、持久标注/评估 DTO、可选 trace/span 目标和 Kumo 控件
 * [OUTPUT]: Cases：标注新增/编辑、录制回放与当前模型评估
 * [POS]: API/会话切换重建局部状态，显式操作同步互斥；失败保留草稿，迟到结果不覆盖另一标注
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Textarea } from '@cloudflare/kumo/components/input'
import { Select } from '@cloudflare/kumo/components/select'
import type { BadCase, EvaluationResult, Identity, LumenApi, MarkCaseInput, Page } from '../data/client.ts'
import { Evaluation } from './Evaluation'
import type { CaseTarget } from './Trace'

const kinds = { answer_quality: '回答质量', tool_failure: '工具问题', evidence_missing: '证据缺失' } as const
const empty = (): MarkCaseInput => ({ kind: 'answer_quality', actual: '', expected: '', note: '' })
type Props = { api: LumenApi; identity: Identity; target?: CaseTarget; revision?: number }
type Operation = 'save' | EvaluationResult['mode'] | null

export function Cases(props: Props) {
  const scope = useRef({ api: props.api, project: props.identity.projectId, task: props.identity.taskId, key: 0 })
  if (scope.current.api !== props.api || scope.current.project !== props.identity.projectId || scope.current.task !== props.identity.taskId) {
    scope.current = { api: props.api, project: props.identity.projectId, task: props.identity.taskId, key: scope.current.key + 1 }
  }
  return <CaseEditor key={scope.current.key} {...props} />
}

function CaseEditor({ api, identity, target, revision: refresh = 0 }: Props) {
  const [list, setList] = useState<Page<BadCase> | null>(null), [page, setPage] = useState(0), [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<BadCase | null>(null), [draft, setDraft] = useState<MarkCaseInput>(empty)
  const [busy, setBusy] = useState<Operation>(null), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  const operation = useRef<Operation>(null), alive = useRef(true), editor = useRef(0)
  const dirty = !!selected && (['kind', 'actual', 'expected', 'note'] as const).some(field => (draft[field] ?? '') !== selected[field])
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { edit(null) }, [target?.traceId, target?.spanId])
  useEffect(() => {
    let active = true; setList(null)
    void api.badCases(identity, page).then(value => {
      if (!active) return
      setList(value); setSelected(current => current ? value.items.find(item => item.id === current.id) ?? current : null)
    }).catch(error => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [api, identity.projectId, identity.taskId, page, revision, refresh])

  function edit(item: BadCase | null) {
    editor.current++; setSelected(item)
    setDraft(item ? { kind: item.kind, actual: item.actual, expected: item.expected, note: item.note } : empty())
    setSaved(false); setError('')
  }
  function begin(value: Exclude<Operation, null>) {
    if (operation.current) return false
    operation.current = value; setBusy(value); setError(''); setSaved(false); return true
  }
  function finish() { operation.current = null; if (alive.current) setBusy(null) }
  async function save() {
    if (!draft.actual.trim() || !draft.expected.trim() || !begin('save')) return
    const current = editor.current
    try {
      const input = { kind: draft.kind, actual: draft.actual.trim(), expected: draft.expected.trim(), note: draft.note ?? '' }
      const result = selected ? await api.updateBadCase(identity, selected.id, input) : await api.markBadCase(identity, { ...input, ...target })
      if (!alive.current) return
      if (current === editor.current) { edit(result); setSaved(true) }
      setPage(0); setRevision(value => value + 1)
    } catch (error) { if (alive.current && current === editor.current) setError(String(error)) }
    finally { finish() }
  }
  async function evaluate(mode: EvaluationResult['mode']) {
    if (!selected || dirty || !begin(mode)) return
    const id = selected.id, current = editor.current
    try {
      const result = await api.evaluateBadCase(identity, id, mode)
      if (!alive.current) return
      if (current === editor.current) setSelected(value => value?.id === id ? { ...value, lastEvaluation: result } : value)
      setRevision(value => value + 1)
    } catch (error) { if (alive.current && current === editor.current) setError(String(error)) }
    finally { finish() }
  }
  const association = selected ? { traceId: selected.traceId, spanId: selected.spanId } : target
  return <div className="md-cases"><aside><header><strong>问题标注</strong><Button disabled={!!busy} variant="ghost" onClick={() => edit(null)}>新增标注</Button></header>
    {list === null ? !error && <p role="status">正在读取…</p> : !list.items.length && <p>此会话还没有问题标注。</p>}
    {list?.items.map(item => <Button disabled={!!busy} variant={selected?.id === item.id ? 'secondary' : 'ghost'} key={item.id} onClick={() => edit(item)}><span>{kinds[item.kind]}</span><small>{item.actual}</small></Button>)}
    <footer><Button disabled={!!busy || page === 0} variant="ghost" onClick={() => setPage(value => value - 1)}>上一页</Button><Button disabled={!!busy || !list?.hasMore} variant="ghost" onClick={() => setPage(value => value + 1)}>下一页</Button></footer>
  </aside><form onSubmit={event => { event.preventDefault(); void save() }}>
    <h3>{selected ? '编辑问题标注' : '新增问题标注'}</h3><p className="md-hint">标注是你的观察，不代表问题已重现或修复。</p>
    <p className="md-association">{association?.traceId ? <>关联记录 <code>{association.traceId}</code>{association.spanId && <> / 步骤 <code>{association.spanId}</code></>}</> : '关联当前会话；没有执行记录时也可标注证据缺失。'}</p>
    <label>问题类型<Select disabled={!!busy} aria-label="问题类型" items={kinds} value={draft.kind ?? 'answer_quality'} onValueChange={value => { if (value && value in kinds) setDraft({ ...draft, kind: value as BadCase['kind'] }) }} /></label>
    {(['actual', 'expected', 'note'] as const).map(field => <label key={field}>{({ actual: '实际表现', expected: '预期表现', note: '补充说明' })[field]}<Textarea disabled={!!busy} aria-label={({ actual: '实际表现', expected: '预期表现', note: '补充说明' })[field]} required={field !== 'note'} maxLength={10000} value={draft[field] ?? ''} onChange={event => { setDraft({ ...draft, [field]: event.target.value }); setSaved(false) }} /></label>)}
    <footer><Button type="submit" disabled={!!busy || !draft.actual.trim() || !draft.expected.trim()}>{busy === 'save' ? '保存中…' : '保存标注'}</Button>{saved && <span role="status">已保存</span>}</footer>
    {error && <p role="alert" className="mw-error">{error}</p>}
    {selected && <Evaluation result={selected.lastEvaluation} disabled={!!busy} dirty={dirty} pending={busy === 'save' ? null : busy} onRun={mode => void evaluate(mode)} />}
  </form></div>
}
