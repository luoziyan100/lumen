/**
 * [INPUT]: 合成临时数据根、进程模式和健康延迟
 * [OUTPUT]: 真实内核锁/认证 HTTP 服务及 stdout ready 事件
 * [POS]: 部署行为测试的独立进程；不加载模型、不调用 launchctl 或旧服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createServer } from 'node:http'
import { acquireServiceLock } from '../../src/deployment/lock.ts'
import { publishDiscovery, removeDiscovery } from '../../src/deployment/discovery.ts'

const [root, mode = 'lock', healthDelay = '0'] = process.argv.slice(2)
const lock = acquireServiceLock(root!)
const alive = setInterval(() => {}, 10_000)
let server: ReturnType<typeof createServer> | undefined
if (mode === 'server') {
  const healthyAt = Date.now() + Number(healthDelay)
  server = createServer((request, response) => {
    const authorized = request.headers.authorization === `Bearer ${lock.identity}`
    response.statusCode = authorized ? Date.now() >= healthyAt ? 200 : 503 : 401
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ engine: 'mastra', ready: authorized && Date.now() >= healthyAt }))
  })
  await new Promise<void>(done => server!.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing server address')
  await publishDiscovery(lock, `http://127.0.0.1:${address.port}`)
}
process.stdout.write(`${JSON.stringify({ ready: true, pid: process.pid })}\n`)
let closing = false
async function close() {
  if (closing) return
  closing = true
  if (server) {
    await removeDiscovery(lock)
    await new Promise<void>((done, fail) => server!.close(error => error ? fail(error) : done()))
  }
  lock.release()
  clearInterval(alive)
}
process.on('SIGTERM', () => { void close() })
process.on('SIGINT', () => { void close() })
