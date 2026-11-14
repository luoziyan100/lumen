/**
 * [INPUT]: 当前会话身份、诊断 API、原生文件保存和局部诊断视图
 * [OUTPUT]: Diagnostics：会话 trace、问题标注及显式评估、导出与离线包查看
 * [POS]: 评估只由标注按钮发起；离线包只读；诊断滚动容器与 Markdown 正文样式隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Dialog } from '@cloudflare/kumo/components/dialog'
import type { DiagnosticTrace, Identity, LumenApi, RecordedInspection, TracePage } from '../data/client.ts'
import { Cases } from './Cases'
import { Coverage } from './Coverage'
import { Trace, type CaseTarget } from './Trace'
import { readDiagnosticFile, saveDiagnostic } from './files.ts'
import './diagnostics.css'
import { useT, errorText, formatDateTime } from '../../i18n/index.ts'

type Tab = 'traces' | 'cases' | 'recorded'
export function Diagnostics({ api, identity, onClose }: { api: LumenApi; identity: Identity; onClose: () => void }) {
  const { diagnostics: D, common } = useT()
  const [tab, setTab] = useState<Tab>('traces'), [page, setPage] = useState(0), [revision, setRevision] = useState(0)
  const [list, setList] = useState<TracePage | null>(null), [traceId, setTraceId] = useState<string | null>(null), [trace, setTrace] = useState<{ api: LumenApi; value: DiagnosticTrace } | null>(null)
  const [target, setTarget] = useState<CaseTarget>(), [recorded, setRecorded] = useState<RecordedInspection | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), generation = useRef(0), input = useRef<HTMLInputElement>(null)
  const selected = trace?.api === api && trace.value.traceId === traceId ? trace.value : null
  useEffect(() => () => { generation.current++ }, [api, identity.topicId, identity.taskId])
  useEffect(() => {
    let active = true; setList(null); setError('')
    void api.traces(identity, page).then(result => { if (active) setList(result) }).catch(error => { if (active) setError(errorText(error)) })
    return () => { active = false }
  }, [api, identity.topicId, identity.taskId, page, revision])
  useEffect(() => {
    let active = true; setTrace(null)
    if (traceId) void api.trace(identity, traceId).then(value => { if (active) setTrace({ api, value }) }).catch(error => { if (active) setError(errorText(error)) })
    return () => { active = false }
  }, [api, identity.topicId, identity.taskId, traceId, revision])
  async function exportRecord(single = false) {
    if (busy) return
    const current = generation.current; setBusy(true); setError(''); setNotice('')
    try {
      const pack = await api.exportDiagnostics(identity, single && traceId ? traceId : undefined)
      if (current !== generation.current) return
      const path = await saveDiagnostic(pack)
      if (current === generation.current && path) setNotice(D.saved(path))
    } catch (error) { if (current === generation.current) setError(errorText(error)) }
    finally { if (current === generation.current) setBusy(false) }
  }
  async function inspect(file: File) {
    if (busy) return
    const current = generation.current; setBusy(true); setError(''); setNotice(''); setRecorded(null); setTab('recorded')
    try { const result = await api.readRecorded(await readDiagnosticFile(file)); if (current === generation.current) setRecorded(result) }
    catch (error) { if (current === generation.current) setError(errorText(error)) }
    finally { if (current === generation.current) setBusy(false) }
  }
  function mark(next: CaseTarget) { setTarget(next); setTab('cases') }
  async function toggleCollection() {
    if (busy || !list) return
    const current = generation.current; setBusy(true); setError(''); setNotice('')
    try {
      const result = await api.updateSettings({ collectExecEvidence: !list.collectionEnabled })
      if (current === generation.current) { setRevision(value => value + 1); setNotice(result.collectExecEvidence ? D.collectionOn : D.collectionOff) }
    } catch (error) { if (current === generation.current) setError(errorText(error)) }
    finally { if (current === generation.current) setBusy(false) }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}><Dialog className="md-dialog" aria-label={D.title}>
    <header className="md-header"><div><h2>{D.title}</h2><small>{identity.topicId} / {identity.taskId}</small></div><Button variant="ghost" onClick={onClose}>{common.close}</Button></header>
    <div className="md-toolbar"><Button disabled={busy} variant="secondary" onClick={() => { setRevision(value => value + 1); setNotice('') }}>{D.refresh}</Button><Button disabled={busy} variant="secondary" onClick={() => void exportRecord()}>{D.exportAll}</Button><Button disabled={busy} variant="ghost" onClick={() => input.current?.click()}>{D.openPack}</Button><input ref={input} hidden type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void inspect(file) }} />{busy && <span role="status">{D.working}</span>}</div>
    <Coverage enabled={list?.collectionEnabled} total={list?.total} trace={selected} />
    <Button disabled={busy || !list} variant="ghost" onClick={() => void toggleCollection()}>{list?.collectionEnabled ? D.collectOff : D.collectOn}</Button>
    <nav className="md-tabs" aria-label={D.tabs}><Button variant={tab === 'traces' ? 'secondary' : 'ghost'} onClick={() => setTab('traces')}>{D.traces(list ? list.total : null)}</Button><Button variant={tab === 'cases' ? 'secondary' : 'ghost'} onClick={() => setTab('cases')}>{D.cases}</Button><Button variant={tab === 'recorded' ? 'secondary' : 'ghost'} onClick={() => setTab('recorded')}>{D.recorded}</Button></nav>
    {error && <p role="alert" className="mw-error">{error}</p>}{notice && <p role="status" className="md-notice">{notice}</p>}
    <div className="md-dialog-body">{tab === 'traces' && <div className="md-traces"><aside><nav aria-label={D.traceList}>{list?.items.map(item => <Button variant={traceId === item.traceId ? 'secondary' : 'ghost'} key={item.traceId} onClick={() => { setTraceId(item.traceId); setError('') }}><span>{item.name}</span><small>{formatDateTime(item.startedAt)} · {item.status}</small></Button>)}</nav>{list === null && !error && <p role="status">{D.reading}</p>}{list?.total === 0 && <p>{D.none}</p>}<footer><Button variant="ghost" disabled={page === 0} onClick={() => setPage(value => value - 1)}>{common.previous}</Button><Button variant="ghost" disabled={!list?.hasMore} onClick={() => setPage(value => value + 1)}>{common.next}</Button></footer></aside><div className="md-trace-detail">{selected ? <><Button variant="ghost" disabled={busy} onClick={() => void exportRecord(true)}>{D.exportOne}</Button><Trace trace={selected} onMark={mark} /></> : <p>{traceId && !error ? D.readingSteps : D.pick}</p>}</div></div>}
      <div hidden={tab !== 'cases'}><Cases api={api} identity={identity} target={target} revision={revision} /></div>
      {tab === 'recorded' && <section className="md-recorded"><h3>{D.recordedTitle}</h3><p>{D.recordedHint}</p>{recorded ? <><p role="status">{D.verified}</p>{recorded.redacted && <p>{D.redacted}</p>}{recorded.truncated && <p>{D.truncated}</p>}<pre>{JSON.stringify(recorded.record, null, 2)}</pre></> : <Button disabled={busy} variant="secondary" onClick={() => input.current?.click()}>{D.choose}</Button>}</section>}
    </div>
  </Dialog></Dialog.Root>
}
