/**
 * [INPUT]: React、WorkspaceApp、唯一 Mastra 服务发现和皮肤
 * [OUTPUT]: 桌面根渲染；冷启动失败有界退避，已连接后的探测失败保留工作台
 * [POS]: 应用唯一入口；未就绪或首次发现失败始终停留在 Mastra，不加载旧运行时
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { lazy, Suspense, useEffect, useState } from 'react'
import type { Connection } from './mastra/data/client'
import { MASTRA_COPY } from './copy/mastraCopy'
import { keepLiveConnection, refreshConnection, retryConnection } from './mastra/data/connection'
import { Button } from '@cloudflare/kumo/components/button'
const MastraApp = lazy(() => import('./mastra/views/WorkspaceApp').then(module => ({ default: module.WorkspaceApp })))
const connection = (window as Window & { __LUMEN_MASTRA__?: Connection }).__LUMEN_MASTRA__ ?? { baseUrl: '', token: '', error: '未发现本机研究服务，请启动 Mastra 服务后重试。' }
import { bootstrapAppearance } from './appearance'
import './tokens.css'
import './kumo.css'
import './styles.css'
import './mastra/views/workbench.css'

function AppRoot() {
  const [current, setCurrent] = useState(connection)
  useEffect(() => {
    const apply = (next: Connection) => setCurrent(previous => keepLiveConnection(previous, next))
    const listener = (event: Event) => apply((event as CustomEvent<Connection>).detail)
    window.addEventListener('lumen-mastra-connection', listener)
    const injected = (window as Window & { __LUMEN_MASTRA__?: Connection }).__LUMEN_MASTRA__
    if (injected) apply(injected)
    return () => window.removeEventListener('lumen-mastra-connection', listener)
  }, [])
  useEffect(() => {
    if (current.error || !current.baseUrl || !current.token) return retryConnection()
  }, [Boolean(current.error || !current.baseUrl || !current.token)])
  if (current.error || !current.baseUrl || !current.token) return <main className="mw-empty" role="alert"><h1>{MASTRA_COPY.noConnection}</h1><p>{current.error || '研究服务连接信息无效，请重试。'}</p><Button onClick={() => { void refreshConnection().catch(error => setCurrent(previous => ({ ...previous, error: String(error) }))) }}>{MASTRA_COPY.retry}</Button></main>
  return <Suspense fallback={<main className="mw-empty" role="status">正在打开研究工作台…</main>}><MastraApp connection={current} /></Suspense>
}

bootstrapAppearance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
)
