/**
 * [INPUT]: 持有中的 ServiceLock 与私有发现文件
 * [OUTPUT]: readDiscovery、publishDiscovery、removeDiscovery、Discovery
 * [POS]: 本机客户端发现边界；token 不进入部署状态，旧实例不能清理新实例的发现信息
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { ServiceLock } from './lock.ts'
import { readPrivateFile, writePrivateFile } from './files.ts'
import { DeploymentError } from './types.ts'

export interface Discovery { version: 1; engine: 'mastra'; pid: number; baseUrl: string; token: string }

function validate(value: unknown): Discovery {
  const data = value as Partial<Discovery> | null
  if (!data || data.version !== 1 || data.engine !== 'mastra' || !Number.isSafeInteger(data.pid) || data.pid! <= 0) throw new DeploymentError('Service discovery identity is invalid')
  if (typeof data.token !== 'string' || !/^[a-f0-9]{64}$/i.test(data.token)) throw new DeploymentError('Service discovery token is invalid')
  let url: URL
  try { url = new URL(data.baseUrl!) } catch { throw new DeploymentError('Service discovery address is invalid') }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || Number(url.port) < 1 || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new DeploymentError('Service discovery must name a loopback HTTP origin')
  return { version: 1, engine: 'mastra', pid: data.pid!, baseUrl: url.origin, token: data.token }
}

export async function readDiscovery(dataRoot: string): Promise<Discovery | null> {
  const raw = await readPrivateFile(join(dataRoot, 'mastra-service.json'))
  if (raw === null) return null
  try { return validate(JSON.parse(raw)) }
  catch { throw new DeploymentError('Private service discovery is malformed') }
}

export async function publishDiscovery(lock: ServiceLock, baseUrl: string): Promise<Discovery> {
  lock.assertHeld()
  const discovery = validate({ version: 1, engine: 'mastra', pid: process.pid, baseUrl, token: lock.identity })
  await writePrivateFile(join(lock.dataRoot, 'mastra-service.json'), JSON.stringify(discovery))
  lock.assertHeld()
  return discovery
}

export async function removeDiscovery(lock: ServiceLock): Promise<void> {
  lock.assertHeld()
  const current = await readDiscovery(lock.dataRoot)
  if (current?.token === lock.identity && current.pid === process.pid) await unlink(join(lock.dataRoot, 'mastra-service.json'))
}
