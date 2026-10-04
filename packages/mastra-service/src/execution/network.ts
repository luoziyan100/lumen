/**
 * [INPUT]: node:http/net/dns 与显式域名策略
 * [OUTPUT]: startNetworkProxy：可关闭的本机 HTTP/CONNECT 网络闸门
 * [POS]: Seatbelt 只允许访问此代理；箱外校验域名并固定公网解析，关闭会销毁全部连接
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import http from 'node:http'
import net from 'node:net'
import { lookup } from 'node:dns/promises'
import { hostAllowed, normalizeHost } from './domains.ts'

interface Target { host: string; port: number; path: string }

function publicAddress(address: string): boolean {
  if (net.isIPv6(address)) return /^[23][0-9a-f]{3}:/i.test(address) && !address.startsWith('2001:db8:')
  const [a, b] = address.split('.').map(Number)
  return a !== 0 && a !== 10 && a !== 127 && a! < 224 && !(a === 169 && b === 254)
    && !(a === 172 && b! >= 16 && b! <= 31) && !(a === 192 && b === 168)
    && !(a === 100 && b! >= 64 && b! <= 127) && !(a === 198 && (b === 18 || b === 19))
}

function target(raw: string, connect = false): Target {
  const url = new URL(connect ? `https://${raw}` : raw)
  if ((!connect && url.protocol !== 'http:') || url.username || url.password) throw new Error('仅支持 HTTP 或 CONNECT 代理请求')
  return { host: normalizeHost(url.hostname), port: Number(url.port || (connect ? 443 : 80)), path: `${url.pathname}${url.search}` }
}

export async function startNetworkProxy(options: { allowedDomains: readonly string[]; allowPrivateAddresses?: boolean }) {
  const sockets = new Set<net.Socket>()
  const denials = new Set<string>()
  let closing = false
  const remember = (socket: net.Socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.setTimeout(30_000, () => socket.destroy())
  }
  const authorize = async (destination: Target) => {
    if (!hostAllowed(destination.host, options.allowedDomains)) throw new Error('域名不在网络白名单')
    const addresses = await lookup(destination.host, { all: true })
    if (!addresses.length || (!options.allowPrivateAddresses && addresses.some(item => !publicAddress(item.address)))) throw new Error('禁止连接本机或私有网络地址')
    if (closing) throw new Error('网络代理已关闭')
    return addresses.find(address => address.family === 4) ?? addresses[0]!
  }
  const denied = (host: string, error: unknown) => {
    if (denials.size < 20) denials.add(`${host}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const server = http.createServer((request, response) => {
    void (async () => {
      const destination = target(request.url ?? '')
      const address = await authorize(destination)
      const headers: http.OutgoingHttpHeaders = { ...request.headers, host: destination.host + (destination.port === 80 ? '' : `:${destination.port}`) }
      delete headers['proxy-authorization']; delete headers['proxy-connection']
      const upstream = http.request({ hostname: address.address, family: address.family, port: destination.port, path: destination.path, method: request.method, headers }, result => {
        response.writeHead(result.statusCode ?? 502, result.headers)
        result.pipe(response)
      })
      upstream.on('socket', remember)
      upstream.on('error', error => { if (!response.headersSent) response.writeHead(502); response.end(error.message) })
      request.on('error', () => upstream.destroy())
      response.on('close', () => upstream.destroy())
      request.pipe(upstream)
    })().catch(error => { denied(request.url ?? 'unknown', error); response.writeHead(403); response.end(String(error)) })
  })
  server.on('connection', remember)
  server.on('connect', (request, client, head) => {
    client.on('error', () => client.destroy())
    void (async () => {
      const destination = target(request.url ?? '', true)
      const address = await authorize(destination)
      const upstream = net.connect({ host: address.address, family: address.family, port: destination.port }, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        upstream.pipe(client); client.pipe(upstream)
      })
      remember(upstream)
      upstream.on('error', () => client.destroy())
      upstream.on('close', () => client.destroy())
      client.on('error', () => upstream.destroy())
      client.on('close', () => upstream.destroy())
    })().catch(error => { denied(request.url ?? 'unknown', error); client.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n') })
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('网络代理绑定失败')
  return {
    port: address.port,
    denials: () => [...denials],
    close: () => new Promise<void>(resolve => {
      closing = true
      server.close(() => resolve())
      for (const socket of sockets) socket.destroy()
    }),
  }
}
