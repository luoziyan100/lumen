/**
 * [INPUT]: 共享Disclosure卷帘、当前会话身份、LumenApi 的已授权旧证据列表/详情与 Kumo 控件
 * [OUTPUT]: Records：旧版证据的分页、内容和哈希完整性视图
 * [POS]: 独立于原生 trace 与评估；只读归档，不复活旧执行器，API/身份切换和迟到请求均隔离，重复选择保留已加载详情
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Disclosure } from '../../../components/disclosure/Disclosure'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import type { Identity, LegacyRecord, LegacyRecordDetail, LegacyRecordPage, LumenApi } from '../../data/client.ts'

type Props = { api: LumenApi; identity: Identity; revision?: number }
const integrity: Record<LegacyRecord['integrity'], string> = {
  verified: '内容哈希已核对', missing: '原始内容缺失', hash_mismatch: '内容哈希不符，停止展示',
  too_large: '内容超出只读展示大小限制', not_collected: '此记录未采集原始内容', unavailable: '内容暂不可用',
}

export function Records(props: Props) {
  const scope = useRef({ api: props.api, project: props.identity.projectId, task: props.identity.taskId, key: 0 })
  if (scope.current.api !== props.api || scope.current.project !== props.identity.projectId || scope.current.task !== props.identity.taskId) {
    scope.current = { api: props.api, project: props.identity.projectId, task: props.identity.taskId, key: scope.current.key + 1 }
  }
  return <RecordBrowser key={scope.current.key} {...props} />
}

function RecordBrowser({ api, identity, revision = 0 }: Props) {
  const [page, setPage] = useState(0), [refresh, setRefresh] = useState(0), [list, setList] = useState<LegacyRecordPage | null>(null)
  const [id, setId] = useState<string | null>(null), [detail, setDetail] = useState<LegacyRecordDetail | null>(null)
  const [listError, setListError] = useState(''), [detailError, setDetailError] = useState('')
  useEffect(() => {
    let active = true; setList(null); setListError('')
    void api.legacyRecords(identity, page).then(value => { if (active) setList(value) }).catch(error => { if (active) setListError(String(error)) })
    return () => { active = false }
  }, [api, identity.projectId, identity.taskId, page, revision, refresh])
  useEffect(() => {
    let active = true; setDetail(null); setDetailError('')
    if (id) void api.legacyRecord(identity, id).then(value => { if (active) setDetail(value) }).catch(error => { if (active) setDetailError(String(error)) })
    return () => { active = false }
  }, [api, identity.projectId, identity.taskId, id, revision, refresh])
  function paginate(next: number) { setId(null); setDetail(null); setPage(next) }
  const selected = detail?.record.id === id ? detail : null
  return <section className="md-legacy" aria-label="旧版执行证据">
    <header><h3>旧版执行证据</h3><Button variant="ghost" onClick={() => setRefresh(value => value + 1)}>刷新旧版证据</Button></header>
    <p className="md-hint">只读查看迁移归档中的旧版记录。它们与当前框架记录分开，不会重放旧运行时。</p>
    <div className="md-legacy-columns"><aside aria-label="旧版证据列表">
      {listError && <p role="alert" className="mw-error">旧版证据读取失败：{listError}</p>}
      {!list && !listError && <p role="status">正在读取旧版证据…</p>}
      {list && !list.available && <p>此会话没有可用的旧版证据档案。{list.reason && <> {list.reason}</>}</p>}
      {list?.available && list.total === 0 && <p>此会话没有旧版执行记录。</p>}
      {list?.items.map(record => <Button variant={id === record.id ? 'secondary' : 'ghost'} key={record.id} onClick={() => { if (id === record.id) return; setId(record.id); setDetail(null); setDetailError('') }}><span>{record.kind}</span><small>{new Date(record.createdAt).toLocaleString()}</small><small>{integrity[record.integrity]}</small></Button>)}
      {list && list.total > 0 && <footer><Button variant="ghost" disabled={!page} onClick={() => paginate(page - 1)}>上一页</Button><small>第 {page + 1} 页 · 共 {list.total} 条</small><Button variant="ghost" disabled={!list.hasMore} onClick={() => paginate(page + 1)}>下一页</Button></footer>}
    </aside><div className="md-legacy-detail">
      {detailError && <p role="alert" className="mw-error">记录内容读取失败：{detailError}</p>}
      {!selected && !detailError && <p>{id ? '正在读取归档内容…' : '选择一条旧版记录查看内容与完整性。'}</p>}
      {selected && <><h4>{selected.record.kind}</h4><p>{new Date(selected.record.createdAt).toLocaleString()}</p><p className="md-legacy-integrity">{integrity[selected.record.integrity]}</p>
        {(selected.record.redacted || selected.record.truncated) && <p className="md-hint">{selected.record.redacted && '显示内容已脱敏。'}{selected.record.truncated && '显示内容已裁剪。'}原归档保持不变。</p>}
        <p className="md-hint">记录 ID：<code>{selected.record.id}</code></p>
        <p className="md-hint">来源任务：<code>{selected.record.sourceTaskId}</code>{selected.record.agentId && <> · Agent <code>{selected.record.agentId}</code></>}{selected.record.turnId && <> · turn <code>{selected.record.turnId}</code></>}{selected.record.operationId && <> · operation <code>{selected.record.operationId}</code></>}</p>
        {selected.record.contentSha256 && <p className="md-hint">原始内容 SHA256：<code>{selected.record.contentSha256}</code></p>}
        {selected.content !== null && selected.record.integrity === 'verified' ? <pre>{typeof selected.content === 'string' ? selected.content : JSON.stringify(selected.content, null, 2)}</pre> : <p>没有可核验的原始内容可显示；列表元数据仍可查阅。</p>}
        <Disclosure summary="记录元数据"><pre>{JSON.stringify(selected.record.meta, null, 2)}</pre></Disclosure>
      </>}
    </div></div>
  </section>
}
