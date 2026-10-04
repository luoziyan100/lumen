/**
 * [INPUT]: 显式独立数据根、模型档案路径、内核锁和原子发现文件，官方 Hono Node 服务
 * [OUTPUT]: 仅本机 HTTP/SSE 服务和 0600 discovery 文件
 * [POS]: 新应用启动入口；部署负责 launchd，服务禁止直接打开旧数据目录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { mkdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve, join } from 'node:path'
import { parseArgs } from 'node:util'
import { serve } from '@hono/node-server'
import { createHttpService } from './server.ts'
import { openSettingsStore } from './settings/store.ts'
import { acquireServiceLock } from './deployment/lock.ts'
import { publishDiscovery, removeDiscovery } from './deployment/discovery.ts'

const { values } = parseArgs({ options: { 'data-root': { type: 'string' }, settings: { type: 'string' } } })
if (!values['data-root']) throw new Error('Required: --data-root <data directory> [--settings <legacy settings.json>]')
const root = resolve(values['data-root'])
if (root === join(homedir(), '.lumen')) throw new Error('Mastra service cannot open the legacy data root')
const devOrigin = process.env.LUMEN_DEV_ORIGIN
if (devOrigin) {
  const url = new URL(devOrigin)
  if (url.origin !== devOrigin || url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Invalid development origin')
}
await mkdir(root, { recursive: true, mode: 0o700 })
if (await realpath(root) === await realpath(join(homedir(), '.lumen')).catch(() => '')) throw new Error('Mastra service cannot open the legacy data root')
const lock = acquireServiceLock(root)
const identity = lock.identity
let service: Awaited<ReturnType<typeof createHttpService>> | undefined
let network: ReturnType<typeof serve> | undefined
let closing: Promise<void> | undefined

async function close() {
  if (network) network.close()
  await service?.close()
  if (network && 'closeAllConnections' in network) network.closeAllConnections()
  await removeDiscovery(lock)
  lock.release()
}

function shutdown() {
  closing ??= close()
  void closing.catch(() => { process.stderr.write('Service shutdown failed; data root remains locked\n'); process.exitCode = 1 })
}

try {
  if (values.settings) {
    const settings = await openSettingsStore({ dataRoot: root })
    try { if (!settings.isInitialized()) await settings.importLegacy({ path: resolve(values.settings) }) }
    finally { await settings.close() }
  }
  service = await createHttpService({ dataRoot: root, token: identity, exclusiveStartup: true,
    allowedOrigins: ['tauri://localhost', 'http://tauri.localhost', ...(devOrigin ? [devOrigin] : [])],
    research: { openAlexKey: process.env.OPENALEX_API_KEY, tavilyKey: process.env.TAVILY_API_KEY } })
  network = serve({ fetch: service.app.fetch, hostname: '127.0.0.1', port: 0 })
  if (!network.listening) await new Promise<void>((done, fail) => { network!.once('listening', done); network!.once('error', fail) })
  const address = network.address()
  if (!address || typeof address === 'string') throw new Error('No bound service address')
  await publishDiscovery(lock, `http://127.0.0.1:${address.port}`)
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  process.stdout.write(`Mastra service listening on 127.0.0.1:${address.port}\n`)
} catch {
  await close()
  process.stderr.write('Service startup failed\n')
  process.exitCode = 1
}
