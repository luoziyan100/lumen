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
import './agents.css'

export function AgentsPane({ api, onBusy }: { api: LumenApi; onBusy: (busy: boolean) => void }) {
  const [catalog, setCatalog] = useState<AgentCatalog | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void api.agents().then(value => { if (active) setCatalog(value) }).catch(error => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [api])
  async function update(work: () => Promise<AgentCatalog>) {
    setBusy(true); onBusy(true); setError('')
    try { setCatalog(await work()) } catch (error) { setError(String(error)) } finally { setBusy(false); onBusy(false) }
  }
  return <>
    <div className="mp-head"><h2 className="settings-h">专家</h2><Button type="button" disabled={busy} variant="outline" size="sm" onClick={() => void update(() => api.reloadAgents())}>重新加载专家</Button></div>
    <p className="set-hint">主研究者按任务委派专家。专家启停作用于所有主题；修改 Markdown 定义后，在研究空闲时重新加载。</p>
    {error && <p role="alert" className="mw-error">{error}</p>}
    {!catalog && !error && <p className="set-hint">加载中…</p>}
    {catalog && <div className="agent-list">{catalog.entries.map(({ role, layer, sourcePath, disabled }) => <section className="agent-card glass-card" key={role.id} aria-label={role.name}>
      <header className="agent-card-head"><h3 className="agent-card-name">{role.name}</h3><Button type="button" disabled={busy} variant="outline" size="sm" onClick={() => void update(() => api.setAgentDisabled(role.id, !disabled))}>{disabled ? '启用' : '停用'}</Button></header>
      <p className="agent-card-text">{role.description}</p><small className="agent-card-meta">{role.id} · {disabled ? '已停用' : '已启用'} · {layer === 'builtin' ? '内建' : layer} · {role.maxSteps} 步</small>
      <p className="agent-card-text">{role.execute ? '可申请执行代码；写入独立工作目录' : role.writable ? '写入独立工作目录' : '只读材料'}</p>
      {sourcePath && <p className="agent-card-text">{sourcePath}</p>}
      <Disclosure summary="工具与指令"><p className="agent-card-text">{role.tools.join('、')}</p><pre>{role.instructions}</pre></Disclosure>
    </section>)}</div>}
    {!!catalog?.diagnostics.length && <div className="agent-notes">{catalog.diagnostics.map((item, index) => <p key={index} className="set-hint" role="status">{item.sourcePath ? `${item.sourcePath}：` : ''}{item.message}</p>)}</div>}
  </>
}
