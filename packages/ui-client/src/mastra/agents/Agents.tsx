/**
 * [INPUT]: 共享Disclosure卷帘、LumenApi 的全局专家目录与配置写入入口、设置页的标题/说明样式与 glass-card 卡面、agents.css
 * [OUTPUT]: AgentsPane：设置里的「专家」分页——来源、权限、工具与指令，全局启停与空闲重载，配置错误展示；写入中经 onBusy 告诉设置页锁住分类与关闭
 * [POS]: 静态配置展示；不推导或复制原生子任务运行状态，运行中写入由服务拒绝并如实显示
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Disclosure } from '../../components/disclosure/Disclosure'
import { useEffect, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import type { AgentCatalog } from '../../../../mastra-service/src/agents/catalog/types.ts'
import { LumenApi } from '../data/client'
import { useT, errorText } from '../../i18n/index.ts'
import './agents.css'

export function AgentsPane({ api, onBusy }: { api: LumenApi; onBusy: (busy: boolean) => void }) {
  const { agents: A, common } = useT()
  const [catalog, setCatalog] = useState<AgentCatalog | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void api.agents().then(value => { if (active) setCatalog(value) }).catch(error => { if (active) setError(errorText(error)) })
    return () => { active = false }
  }, [api])
  async function update(work: () => Promise<AgentCatalog>) {
    setBusy(true); onBusy(true); setError('')
    try { setCatalog(await work()) } catch (error) { setError(errorText(error)) } finally { setBusy(false); onBusy(false) }
  }
  return <>
    <div className="mp-head"><h2 className="settings-h">{A.title}</h2><Button type="button" disabled={busy} variant="outline" size="sm" onClick={() => void update(() => api.reloadAgents())}>{A.reload}</Button></div>
    <p className="set-hint">{A.hint}</p>
    {error && <p role="alert" className="mw-error">{error}</p>}
    {!catalog && !error && <p className="set-hint">{common.loading}</p>}
    {catalog && <div className="agent-list">{catalog.entries.map(({ role, layer, sourcePath, disabled }) => <section className="agent-card glass-card" key={role.id} aria-label={role.name}>
      <header className="agent-card-head"><h3 className="agent-card-name">{role.name}</h3><Button type="button" disabled={busy} variant="outline" size="sm" onClick={() => void update(() => api.setAgentDisabled(role.id, !disabled))}>{disabled ? A.enable : A.disable}</Button></header>
      <p className="agent-card-text">{role.description}</p><small className="agent-card-meta">{role.id} · {disabled ? A.disabled : A.enabled} · {layer === 'builtin' ? A.builtin : layer} · {A.steps(role.maxSteps)}</small>
      <p className="agent-card-text">{role.execute ? A.execute : role.writable ? A.writable : A.readOnly}</p>
      {sourcePath && <p className="agent-card-text">{sourcePath}</p>}
      <Disclosure summary={A.tools}><p className="agent-card-text">{role.tools.join(common.listSeparator)}</p><pre>{role.instructions}</pre></Disclosure>
    </section>)}</div>}
    {!!catalog?.diagnostics.length && <div className="agent-notes">{catalog.diagnostics.map((item, index) => <p key={index} className="set-hint" role="status">{item.sourcePath ? common.labelled(item.sourcePath, item.message) : item.message}</p>)}</div>}
  </>
}
