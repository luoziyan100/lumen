/**
 * [INPUT]: React、StudioApp（白板工作台外壳）、唯一 Mastra 服务发现、皮肤与独立桌面 SpriteDesktopApp
 * [OUTPUT]: 主窗口或 ?sprite-desktop=1 桌面窗口的根渲染；桌面窗口不读取 Mastra 连接、不创建会话订阅
 * [POS]: 应用唯一入口；入口选择两个独立根，桌面精灵不挂载服务发现钩子，主窗口仍保留原有冷启动与重试行为
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { lazy, Suspense, useEffect, useState } from 'react'
import type { Connection } from './mastra/data/client'
import { MASTRA_COPY } from './copy/mastraCopy'
import { keepLiveConnection, refreshConnection, retryConnection } from './mastra/data/connection'
import { Button } from '@cloudflare/kumo/components/button'
const MastraApp = lazy(() => import('./mastra/studio/StudioApp').then(module => ({ default: module.StudioApp })))
const connection = (window as Window & { __LUMEN_MASTRA__?: Connection }).__LUMEN_MASTRA__ ?? { baseUrl: '', token: '', error: '未发现本机研究服务，请启动 Mastra 服务后重试。' }
import { bootstrapAppearance } from './appearance'
import { useDesktopSpritePreference } from './mastra/studio/sprite-desktop/bridge'
import { SpriteDesktopApp } from './mastra/studio/sprite-desktop/App'
import 'yan-design-system/fonts.css'
import 'yan-design-system/tokens.css'
import 'yan-design-system/base.css'
import './tokens.css'
import './kumo.css'
import 'yan-design-system/icons/motion.css'
import './styles.css'
import './mastra/views/workbench.css'
import './appearance/fonts.css'

const isSpriteDesktopWindow = new URLSearchParams(window.location.search).get('sprite-desktop') === '1'

function MainAppRoot() {
  useDesktopSpritePreference()
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
const Root = isSpriteDesktopWindow ? SpriteDesktopApp : MainAppRoot

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
