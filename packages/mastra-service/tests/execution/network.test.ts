/**
 * [INPUT]: 真实 HTTP/TCP 本机服务和箱外代理
 * [OUTPUT]: 域名/私网限制、HTTP 转发及 CONNECT 关闭语义
 * [POS]: 网络边界验证；私网放行只用于显式本机夹具，不经生产工具公开
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { once } from 'node:events'
import { startNetworkProxy } from '../../src/execution/network.ts'

function request(port: number, url: string) {
  return new Promise<{ status?: number; text: string }>((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: url, agent: false }, response => {
      let text = ''
      response.on('data', chunk => { text += chunk })
      response.on('end', () => resolve({ status: response.statusCode, text }))
    }).on('error', reject)
  })
}

test('代理阻断私网与未知域名，显式夹具网络转发成功且关闭销毁开放隧道', { timeout: 8000 }, async () => {
  const upstream = http.createServer((_request, response) => response.end('UPSTREAM_OK'))
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening')
  const address = upstream.address(); assert.ok(address && typeof address !== 'string')
  const proxy = await startNetworkProxy({ allowedDomains: ['localhost'] })
  const fixture = await startNetworkProxy({ allowedDomains: ['localhost'], allowPrivateAddresses: true })
  let tunnel: net.Socket | undefined
  try {
    assert.equal((await request(proxy.port, `http://localhost:${address.port}/`)).status, 403)
    assert.equal((await request(proxy.port, 'http://unknown.invalid/')).status, 403)
    assert.match(proxy.denials().join('\n'), /私有网络|白名单/)
    assert.deepEqual(await request(fixture.port, `http://localhost:${address.port}/`), { status: 200, text: 'UPSTREAM_OK' })
    tunnel = net.connect(fixture.port, '127.0.0.1'); await once(tunnel, 'connect')
    tunnel.write(`CONNECT localhost:${address.port} HTTP/1.1\r\nHost: localhost\r\n\r\n`)
    assert.match(String((await once(tunnel, 'data'))[0]), /200 Connection Established/)
    const ended = once(tunnel, 'close')
    await fixture.close()
    await ended
    assert.equal(tunnel.destroyed, true)
  } finally { tunnel?.destroy(); await proxy.close(); await fixture.close(); upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())) }
})
