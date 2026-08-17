/**
 * [INPUT]: window.__LUMEN_WS__/__LUMEN_TOKEN__;VITE_LUMEN_DEMO;localStorage
 * [OUTPUT]: SERVICE_URL / SERVICE_TOKEN / IS_DEMO / initialProjectId
 * [POS]: App 启动常量;service 只绑 IPv4,默认 127.0.0.1(localhost→::1 会假死)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

// 默认必须 127.0.0.1:service 只绑 IPv4;localhost 常解析到 ::1 → 永远「服务未连接」
const w = window as { __LUMEN_WS__?: string; __LUMEN_TOKEN__?: string }
export const SERVICE_URL = w.__LUMEN_WS__ ?? 'ws://127.0.0.1:8787'
export const SERVICE_TOKEN = w.__LUMEN_TOKEN__ || new URLSearchParams(window.location.search).get('token') || undefined
export const IS_DEMO = import.meta.env.VITE_LUMEN_DEMO === '1'

/** demo=访客空间;本地=最近项目或 default */
export function initialProjectId(): string {
  if (IS_DEMO) {
    try {
      let id = localStorage.getItem('lumen:visitor')
      if (!id) { id = 'v-' + crypto.randomUUID(); localStorage.setItem('lumen:visitor', id) }
      return id
    } catch { return 'default' }
  }
  return localStorage.getItem('lumen:projectId') || 'default'
}
