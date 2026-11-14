/**
 * [INPUT]: React、StudioApp（白板工作台外壳）、唯一 Mastra 服务发现、皮肤与独立桌面 SpriteDesktopApp、i18n (the stored language loads before the first render)
 * [OUTPUT]: 当前只渲染主窗口；桌面功能常量开启后才识别独立入口，该入口不读取服务连接
 * [POS]: 应用唯一入口；入口选择两个独立根，桌面精灵不挂载服务发现钩子，主窗口仍保留原有冷启动与重试行为
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { lazy, Suspense, useEffect, useState } from 'react'
import type { Connection } from './mastra/data/client'
import { bootstrapLocale, errorText, useT } from './i18n/index.ts'
import { keepLiveConnection, refreshConnection, retryConnection } from './mastra/data/connection'
import { Button } from '@cloudflare/kumo/components/button'
/** Stands for "no service was discovered" until the catalog can say it in the chosen language */
const NO_SERVICE = 'lumen:no-service'
const MastraApp = lazy(() => import('./mastra/studio/StudioApp').then(module => ({ default: module.StudioApp })))
const connection = (window as Window & { __LUMEN_MASTRA__?: Connection }).__LUMEN_MASTRA__ ?? { baseUrl: '', token: '', error: NO_SERVICE }
import { bootstrapAppearance } from './appearance'
import { useDesktopSpritePreference } from './mastra/studio/sprite-desktop/bridge'
import { DESKTOP_SPRITE_ENABLED } from './mastra/studio/sprite-desktop/preference'
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

const isSpriteDesktopWindow = DESKTOP_SPRITE_ENABLED && new URLSearchParams(window.location.search).get('sprite-desktop') === '1'

function MainAppRoot() {
  const B = useT().boot
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
  if (current.error || !current.baseUrl || !current.token) return <main className="mw-empty" role="alert"><h1>{B.noConnection}</h1><p>{current.error === NO_SERVICE ? B.noService : current.error || B.badConnection}</p><Button onClick={() => { void refreshConnection().catch(error => setCurrent(previous => ({ ...previous, error: errorText(error) }))) }}>{B.retry}</Button></main>
  return <Suspense fallback={<main className="mw-empty" role="status">{B.opening}</main>}><MastraApp connection={current} /></Suspense>
}

bootstrapAppearance()
const Root = isSpriteDesktopWindow ? SpriteDesktopApp : MainAppRoot

// The stored language (English on first launch) is loaded before the first paint, so nothing flashes in the wrong language
void bootstrapLocale().finally(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
))
