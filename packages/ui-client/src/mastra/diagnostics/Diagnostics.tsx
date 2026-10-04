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
import { Records } from './legacy/Records'
import { readDiagnosticFile, saveDiagnostic } from './files.ts'
import './diagnostics.css'

type Tab = 'traces' | 'cases' | 'recorded' | 'legacy'
export function Diagnostics({ api, identity, onClose }: { api: LumenApi; identity: Identity; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('traces'), [page, setPage] = useState(0), [revision, setRevision] = useState(0)
  const [list, setList] = useState<TracePage | null>(null), [traceId, setTraceId] = useState<string | null>(null), [trace, setTrace] = useState<{ api: LumenApi; value: DiagnosticTrace } | null>(null)
  const [target, setTarget] = useState<CaseTarget>(), [recorded, setRecorded] = useState<RecordedInspection | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), generation = useRef(0), input = useRef<HTMLInputElement>(null)
  const selected = trace?.api === api && trace.value.traceId === traceId ? trace.value : null
  useEffect(() => () => { generation.current++ }, [api, identity.projectId, identity.taskId])
  useEffect(() => {
    let active = true; setList(null); setError('')
    void api.traces(identity, page).then(result => { if (active) setList(result) }).catch(error => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [api, identity.projectId, identity.taskId, page, revision])
  useEffect(() => {
    let active = true; setTrace(null)
    if (traceId) void api.trace(identity, traceId).then(value => { if (active) setTrace({ api, value }) }).catch(error => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [api, identity.projectId, identity.taskId, traceId, revision])
  async function exportRecord(single = false) {
    if (busy) return
    const current = generation.current; setBusy(true); setError(''); setNotice('')
    try {
      const pack = await api.exportDiagnostics(identity, single && traceId ? traceId : undefined)
      if (current !== generation.current) return
      const path = await saveDiagnostic(pack)
      if (current === generation.current && path) setNotice(`已保存：${path}`)
    } catch (error) { if (current === generation.current) setError(String(error)) }
    finally { if (current === generation.current) setBusy(false) }
  }
  async function inspect(file: File) {
    if (busy) return
    const current = generation.current; setBusy(true); setError(''); setNotice(''); setRecorded(null); setTab('recorded')
    try { const result = await api.readRecorded(await readDiagnosticFile(file)); if (current === generation.current) setRecorded(result) }
    catch (error) { if (current === generation.current) setError(String(error)) }
    finally { if (current === generation.current) setBusy(false) }
  }
  function mark(next: CaseTarget) { setTarget(next); setTab('cases') }
  async function toggleCollection() {
    if (busy || !list) return
    const current = generation.current; setBusy(true); setError(''); setNotice('')
    try {
      const result = await api.updateSettings({ collectExecEvidence: !list.collectionEnabled })
      if (current === generation.current) { setRevision(value => value + 1); setNotice(result.collectExecEvidence ? '采集已开启，将记录后续框架观察。' : '采集已关闭，已有记录仍可查看；进行中的记录可能不完整。') }
    } catch (error) { if (current === generation.current) setError(String(error)) }
    finally { if (current === generation.current) setBusy(false) }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}><Dialog className="md-dialog" aria-label="会话诊断">
    <header className="md-header"><div><h2>会话诊断</h2><small>{identity.projectId} / {identity.taskId}</small></div><Button variant="ghost" onClick={onClose}>关闭</Button></header>
    <div className="md-toolbar"><Button disabled={busy} variant="secondary" onClick={() => { setRevision(value => value + 1); setNotice('') }}>刷新记录</Button><Button disabled={busy} variant="secondary" onClick={() => void exportRecord()}>导出会话记录</Button><Button disabled={busy} variant="ghost" onClick={() => input.current?.click()}>打开诊断包</Button><input ref={input} hidden type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void inspect(file) }} />{busy && <span role="status">处理中…</span>}</div>
    <Coverage enabled={list?.collectionEnabled} total={list?.total} trace={selected} />
    <Button disabled={busy || !list} variant="ghost" onClick={() => void toggleCollection()}>{list?.collectionEnabled ? '关闭采集' : '开启采集'}</Button>
    <nav className="md-tabs" aria-label="诊断内容"><Button variant={tab === 'traces' ? 'secondary' : 'ghost'} onClick={() => setTab('traces')}>执行记录{list ? ` · ${list.total}` : ''}</Button><Button variant={tab === 'cases' ? 'secondary' : 'ghost'} onClick={() => setTab('cases')}>问题标注</Button><Button variant={tab === 'recorded' ? 'secondary' : 'ghost'} onClick={() => setTab('recorded')}>离线包查看</Button><Button variant={tab === 'legacy' ? 'secondary' : 'ghost'} onClick={() => setTab('legacy')}>旧版证据</Button></nav>
    {error && <p role="alert" className="mw-error">{error}</p>}{notice && <p role="status" className="md-notice">{notice}</p>}
    <div className="md-dialog-body">{tab === 'traces' && <div className="md-traces"><aside><nav aria-label="执行记录列表">{list?.items.map(item => <Button variant={traceId === item.traceId ? 'secondary' : 'ghost'} key={item.traceId} onClick={() => { setTraceId(item.traceId); setError('') }}><span>{item.name}</span><small>{new Date(item.startedAt).toLocaleString()} · {item.status}</small></Button>)}</nav>{list === null && !error && <p role="status">正在读取…</p>}{list?.total === 0 && <p>暂无记录</p>}<footer><Button variant="ghost" disabled={page === 0} onClick={() => setPage(value => value - 1)}>上一页</Button><Button variant="ghost" disabled={!list?.hasMore} onClick={() => setPage(value => value + 1)}>下一页</Button></footer></aside><div className="md-trace-detail">{selected ? <><Button variant="ghost" disabled={busy} onClick={() => void exportRecord(true)}>仅导出此记录</Button><Trace trace={selected} onMark={mark} /></> : <p>{traceId && !error ? '正在读取步骤…' : '选择一条记录查看模型与工具步骤。'}</p>}</div></div>}
      <div hidden={tab !== 'cases'}><Cases api={api} identity={identity} target={target} revision={revision} /></div>
      {tab === 'legacy' && <Records api={api} identity={identity} revision={revision} />}
      {tab === 'recorded' && <section className="md-recorded"><h3>离线诊断包查看</h3><p>选择已导出的 JSON；只读检查保存内容，不执行录制回放，不调用模型、工具或网络资料。</p>{recorded ? <><p role="status">完整性校验通过；来源未认证；没有执行任何研究操作。</p>{recorded.redacted && <p>显示内容已再次脱敏。</p>}{recorded.truncated && <p>显示内容已裁剪，原包仍保持不变。</p>}<pre>{JSON.stringify(recorded.record, null, 2)}</pre></> : <Button disabled={busy} variant="secondary" onClick={() => input.current?.click()}>选择诊断 JSON</Button>}</section>}
    </div>
  </Dialog></Dialog.Root>
}
