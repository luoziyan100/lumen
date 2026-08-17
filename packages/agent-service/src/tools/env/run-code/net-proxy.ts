/**
 * [INPUT]: node:http / node:net, net-allowlist 的 hostAllowed
 * [OUTPUT]: startNetProxy({ allowedDomains }) → { port, formatDenials, close }
 * [POS]: run_code 箱外闸门。每次 run 起一个、随子进程关;沙箱只开这一口。
 *        HTTPS 走 CONNECT 隧道,明文 HTTP 转发。信 client 报的主机名,不解密 TLS。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import http from 'node:http'
import net from 'node:net'
import { hostAllowed, normalizeHost } from './net-allowlist.ts'

export interface NetProxyHandle {
  port: number
  formatDenials: () => string
  close: () => Promise<void>
}

export function startNetProxy(opts: { allowedDomains: readonly string[] }): Promise<NetProxyHandle> {
  const allowed = opts.allowedDomains
  const denials = new Map<string, number>()

  const recordDeny = (host: string): void => {
    const h = normalizeHost(host) || host
    denials.set(h, (denials.get(h) ?? 0) + 1)
  }

  const server = http.createServer((req, res) => {
    const target = parseHttpTarget(req)
    if (!target || !hostAllowed(target.host, allowed)) {
      const host = target?.host ?? 'unknown'
      recordDeny(host)
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`网络白名单拒绝: ${host}`)
      return
    }
    const fwd = http.request(
      {
        hostname: target.host,
        port: target.port,
        path: target.path,
        method: req.method,
        headers: req.headers,
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
      },
    )
    fwd.on('error', (err) => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`代理上游失败: ${err.message}`)
    })
    req.pipe(fwd)
  })

  server.on('connect', (req, clientSocket, head) => {
    const parsed = parseHostPort(req.url ?? '', 443)
    if (!parsed || !hostAllowed(parsed.host, allowed)) {
      const host = parsed?.host ?? 'unknown'
      recordDeny(host)
      clientSocket.write(
        `HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n网络白名单拒绝: ${host}`,
      )
      clientSocket.end()
      return
    }
    const dest = net.connect(parsed.port, parsed.host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length > 0) dest.write(head)
      dest.pipe(clientSocket)
      clientSocket.pipe(dest)
    })
    dest.on('error', () => clientSocket.destroy())
    clientSocket.on('error', () => dest.destroy())
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('net-proxy: 绑定失败'))
        return
      }
      resolve({
        port: addr.port,
        formatDenials: () => formatDenials(denials),
        close: () =>
          new Promise((done) => {
            server.close(() => done())
          }),
      })
    })
  })
}

export function formatDenials(denials: ReadonlyMap<string, number>): string {
  if (denials.size === 0) return ''
  const parts = [...denials].map(([host, n]) => `${host} ×${n}`)
  return `[网络白名单拒绝: ${parts.join(', ')}]`
}

function parseHostPort(raw: string, defaultPort: number): { host: string; port: number } | null {
  const s = raw.trim()
  if (!s) return null
  if (s.startsWith('[')) {
    const end = s.indexOf(']')
    if (end < 0) return null
    const host = s.slice(1, end)
    const rest = s.slice(end + 1)
    const port = rest.startsWith(':') ? Number(rest.slice(1)) : defaultPort
    if (!host || !Number.isFinite(port)) return null
    return { host, port }
  }
  const colon = s.lastIndexOf(':')
  if (colon > 0 && /^\d+$/.test(s.slice(colon + 1))) {
    return { host: s.slice(0, colon), port: Number(s.slice(colon + 1)) }
  }
  return { host: s, port: defaultPort }
}

function parseHttpTarget(req: http.IncomingMessage): { host: string; port: number; path: string } | null {
  const url = req.url ?? '/'
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url)
      const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80
      return { host: u.hostname, port, path: `${u.pathname}${u.search}` || '/' }
    } catch {
      return null
    }
  }
  const header = req.headers.host
  if (!header) return null
  const parsed = parseHostPort(header, 80)
  if (!parsed) return null
  return { host: parsed.host, port: parsed.port, path: url || '/' }
}
