/**
 * [INPUT]: 共享Disclosure卷帘、LumenApi 的项目角色目录与配置写入入口、Kumo 对话框
 * [OUTPUT]: Agents：可审阅角色来源和权限的管理面板
 * [POS]: 静态配置展示；不推导或复制原生子任务运行状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Disclosure } from '../../components/disclosure/Disclosure'
import { useEffect, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Dialog } from '@cloudflare/kumo/components/dialog'
import type { AgentCatalog } from '../../../../mastra-service/src/agents/catalog/types.ts'
import { LumenApi } from '../data/client'

export function Agents({ api, projectId, onClose }: { api: LumenApi; projectId: string; onClose: () => void }) {
  const [catalog, setCatalog] = useState<AgentCatalog | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void api.agents(projectId).then(value => { if (active) setCatalog(value) }).catch(error => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [api, projectId])
  async function update(work: () => Promise<AgentCatalog>) {
    setBusy(true); setError('')
    try { setCatalog(await work()) } catch (error) { setError(String(error)) } finally { setBusy(false) }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose() }}><Dialog className="mw-dialog mw-settings" aria-label="研究角色">
    <header><h2>研究角色</h2><Button variant="ghost" disabled={busy} onClick={onClose}>关闭</Button></header>
    <p>主研究者按任务委派专家。角色启停作用于所有项目；修改 Markdown 定义后，在研究空闲时重新加载。</p>
    <Button disabled={busy} variant="secondary" onClick={() => void update(() => api.reloadAgents(projectId))}>重新加载角色</Button>
    {error && <p role="alert" className="mw-error">{error}</p>}
    {catalog?.entries.map(({ role, layer, sourcePath, disabled }) => <section className="mw-question" key={role.id}>
      <header><strong>{role.name}</strong><Button disabled={busy} variant="ghost" onClick={() => void update(() => api.setAgentDisabled(projectId, role.id, !disabled))}>{disabled ? '启用' : '停用'}</Button></header>
      <p>{role.description}</p><small>{role.id} · {disabled ? '已停用' : '已启用'} · {layer === 'builtin' ? '内建' : layer} · {role.maxSteps} 步</small>
      <p>{role.execute ? '可申请执行代码；写入独立工作目录' : role.writable ? '写入独立工作目录' : '只读材料'}</p>
      {sourcePath && <p>{sourcePath}</p>}
      <Disclosure summary="工具与指令"><p>{role.tools.join('、')}</p><pre>{role.instructions}</pre></Disclosure>
    </section>)}
    {catalog?.diagnostics.map((item, index) => <p key={index} role="status">{item.sourcePath ? `${item.sourcePath}：` : ''}{item.message}</p>)}
  </Dialog></Dialog.Root>
}
