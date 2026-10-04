/**
 * [INPUT]: 共享Disclosure卷帘、原生专家历史索引 API、父会话身份与显式继续入口
 * [OUTPUT]: Specialists：折叠专家目录、状态与带新任务的继续表单
 * [POS]: 只展示服务认可的继续能力；同一会话的状态轮询串行，迟到结果不会回退当前状态；202 留在原审批流程，审批/运行状态由父会话原生卡片展示，不保留会过期的提交通知，不重复 POST 或重放历史工具
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Disclosure } from '../../../components/disclosure/Disclosure'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Textarea } from '@cloudflare/kumo/components/input'
import type { LumenApi, Identity } from '../../data/client'

interface Entry { id: string; role: string; title: string; directory: string; continuations: number; canContinue: boolean; status: 'running' | 'completed' | 'incomplete' | 'failed' | 'interrupted' }
const status = { running: '研究中', completed: '已完成', incomplete: '未完成', failed: '失败', interrupted: '已中断' }
export function Specialists({ api, identity, idle, onActivity }: { api: LumenApi; identity: Identity; idle: boolean; onActivity: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]), [selected, setSelected] = useState<string | null>(null)
  const [prompt, setPrompt] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const generation = useRef(0), submitting = useRef(false)
  useEffect(() => {
    const current = ++generation.current
    let pending = false
    const refresh = () => {
      if (generation.current !== current || pending) return
      pending = true
      void api.request<{ specialists: Entry[] }>(`/lumen/specialists?${api.query(identity)}`).then(result => { if (generation.current === current) setEntries(result.specialists) }).catch(() => {}).finally(() => { pending = false })
    }
    refresh(); const timer = window.setInterval(refresh, 3000)
    return () => { generation.current++; clearInterval(timer) }
  }, [api, identity.projectId, identity.taskId])
  async function resume() {
    if (!selected || !prompt.trim() || submitting.current || !idle) return
    const current = generation.current; submitting.current = true; setBusy(true); setError('')
    try {
      await api.request<{ continued: boolean; pendingApproval?: boolean }>('/lumen/specialists/continue', 'POST', { ...identity, specialistId: selected, prompt: prompt.trim() })
      if (current !== generation.current) return
      setSelected(null); setPrompt(''); onActivity()
    } catch (error) { if (current === generation.current) setError(String(error)) }
    finally { if (current === generation.current) { submitting.current = false; setBusy(false) } }
  }
  if (!entries.length) return null
  return <Disclosure className="mw-process mw-specialists" summary={<>专家协作 · {entries.length} 位</>}>
    {entries.map(entry => <section key={entry.id}><div className="mw-specialist-head"><strong>{entry.role}</strong><span>{status[entry.status]}</span><Button variant="ghost" disabled={!entry.canContinue || !idle || busy} onClick={() => { setSelected(entry.id); setPrompt('') }}>继续研究</Button></div><p>{entry.title}</p><small>{entry.continuations > 0 ? `已继续 ${entry.continuations} 次 · ` : ''}{entry.directory}</small>
      {selected === entry.id && <form onSubmit={event => { event.preventDefault(); void resume() }}><Textarea aria-label="专家继续要求" placeholder="补充这位专家接下来需要核对的问题…" value={prompt} onChange={event => setPrompt(event.target.value)} /><Button type="submit" disabled={!prompt.trim() || busy || !idle}>{busy ? '正在提交…' : '提交继续要求'}</Button><Button variant="ghost" type="button" disabled={busy} onClick={() => setSelected(null)}>取消</Button></form>}
    </section>)}
    {error && <p role="alert" className="mw-error">{error}</p>}
  </Disclosure>
}
