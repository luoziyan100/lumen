import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { startNetProxy } from '../../src/tools/env/run-code/net-proxy.ts'

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') reject(new Error('bind failed'))
      else resolve(addr.port)
    })
  })
}

test('net-proxy:HTTP 放行本地假上游', async (t) => {
  const upstream = http.createServer((_req, res) => { res.end('UPSTREAM_OK') })
  t.after(() => upstream.close())
  const upPort = await listen(upstream)
  const proxy = await startNetProxy({ allowedDomains: ['127.0.0.1'] })
  t.after(() => proxy.close())

  const body = await new Promise<string>((resolve, reject) => {
    http.get(
      {
        host: '127.0.0.1',
        port: proxy.port,
        path: `http://127.0.0.1:${upPort}/`,
        headers: { Host: `127.0.0.1:${upPort}` },
      },
      (res) => {
        assert.equal(res.statusCode, 200)
        let s = ''
        res.on('data', (d) => { s += d })
        res.on('end', () => resolve(s))
      },
    ).on('error', reject)
  })
  assert.equal(body, 'UPSTREAM_OK')
  assert.equal(proxy.formatDenials(), '')
})

test('net-proxy:名单外 HTTP 回 403 并记拒绝', async (t) => {
  const proxy = await startNetProxy({ allowedDomains: ['127.0.0.1'] })
  t.after(() => proxy.close())

  const got = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    http.get(
      {
        host: '127.0.0.1',
        port: proxy.port,
        path: 'http://evil.example.com/',
        headers: { Host: 'evil.example.com' },
      },
      (res) => {
        let s = ''
        res.on('data', (d) => { s += d })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: s }))
      },
    ).on('error', reject)
  })
  assert.equal(got.status, 403)
  assert.match(got.body, /网络白名单拒绝: evil.example.com/)
  assert.match(proxy.formatDenials(), /\[网络白名单拒绝: evil.example.com ×1\]/)
})

test('net-proxy:CONNECT 隧道通本地假上游', async (t) => {
  const upstream = http.createServer((_req, res) => { res.end('TUNNEL_OK') })
  t.after(() => upstream.close())
  const upPort = await listen(upstream)
  const proxy = await startNetProxy({ allowedDomains: ['127.0.0.1'] })
  t.after(() => proxy.close())

  const body = await new Promise<string>((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: proxy.port,
      method: 'CONNECT',
      path: `127.0.0.1:${upPort}`,
    })
    req.on('connect', (_res, socket) => {
      socket.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n')
      let s = ''
      socket.on('data', (d) => { s += d })
      socket.on('end', () => {
        const idx = s.indexOf('\r\n\r\n')
        resolve(idx >= 0 ? s.slice(idx + 4) : s)
      })
      socket.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
  assert.equal(body, 'TUNNEL_OK')
})

test('net-proxy:CONNECT 拒绝体为 403 明文', async (t) => {
  const proxy = await startNetProxy({ allowedDomains: ['127.0.0.1'] })
  t.after(() => proxy.close())

  const raw = await new Promise<string>((resolve, reject) => {
    const socket = net.connect(proxy.port, '127.0.0.1', () => {
      socket.write('CONNECT evil.example.com:443 HTTP/1.1\r\nHost: evil.example.com:443\r\n\r\n')
    })
    let s = ''
    socket.on('data', (d) => { s += d })
    socket.on('end', () => resolve(s))
    socket.on('error', reject)
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error('CONNECT deny timeout')) })
  })
  assert.match(raw, /^HTTP\/1\.1 403/)
  assert.match(raw, /网络白名单拒绝: evil.example.com/)
  assert.match(proxy.formatDenials(), /evil.example.com ×1/)
})
