/**
 * [INPUT]: 官方 Controller 路由、Lumen 归属验证/会话绑定入口与 Hono 请求
 * [OUTPUT]: nativeRoutePolicy：固定任务身份的原生 HTTP 白名单
 * [POS]: 产品与框架边界；历史读取仅验证归属，执行/状态/订阅才绑定工作区，禁止框架另建身份或运行入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { MiddlewareHandler } from 'hono'

type BindSession = (projectId: string, taskId: string) => Promise<unknown>
const ID = '[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}'
const RESOURCE = new RegExp(`^(${ID}):(${ID})$`)
const SESSION = /^\/api\/agent-controller\/lumen\/sessions\/([^/]+)(.*)$/
const ACTIONS = new Set(['/messages', '/abort', '/tool-approval', '/tool-suspension', '/steer'])
const MESSAGE_QUERY = new Set(['page', 'perPage', 'limit', 'orderBy'])

function validQuery(url: URL, suffix: string, resourceId: string): boolean {
  const allowed = suffix === '' ? new Set(['threadId']) : suffix.endsWith('/messages') ? MESSAGE_QUERY : new Set<string>()
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || (key === 'threadId' && value !== resourceId)) return false
  }
  return true
}

export function nativeRoutePolicy(bindSession: BindSession, authorizeSession: BindSession): MiddlewareHandler {
  return async (c, next) => {
    const url = new URL(c.req.url)
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return next()
    const match = SESSION.exec(url.pathname)
    if (!match) return c.json({ error: 'Unsupported framework route' }, 404)
    let resourceId: string, suffix: string
    try { resourceId = decodeURIComponent(match[1]!); suffix = decodeURIComponent(match[2]!) }
    catch { return c.json({ error: 'Invalid task identity' }, 400) }
    const identity = RESOURCE.exec(resourceId)
    if (!identity) return c.json({ error: 'Invalid task identity' }, 400)
    const read = c.req.method === 'GET' && ['', '/stream', `/threads/${resourceId}/messages`].includes(suffix)
    const write = c.req.method === 'POST' && ACTIONS.has(suffix)
    if (!read && !write) return c.json({ error: 'Unsupported framework route' }, 404)
    if (!validQuery(url, suffix, resourceId)) return c.json({ error: 'Unsupported session query' }, 400)
    const history = c.req.method === 'GET' && suffix === `/threads/${resourceId}/messages`
    await (history ? authorizeSession : bindSession)(identity[1]!, identity[2]!)
    await next()
  }
}
