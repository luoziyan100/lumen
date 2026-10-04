/**
 * [INPUT]: 显式私有数据根、Darwin/FreeBSD O_EXLOCK 与历史开发锁
 * [OUTPUT]: acquireServiceLock、ServiceLock、processAlive
 * [POS]: 服务启动所有权；固定 inode 永不删除，持有 fd 才可访问存储或发布 discovery
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { assertPrivate } from './files.ts'
import { DeploymentError } from './types.ts'

const O_EXLOCK = 0x20
export interface ServiceLock {
  dataRoot: string
  path: string
  identity: string
  assertHeld(): void
  release(): void
}

export function processAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH' }
}

function checkLegacyLock(root: string) {
  const path = join(root, 'mastra-service.lock')
  let fd
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
  try {
    const stat = fstatSync(fd)
    assertPrivate(stat)
    if (stat.size > 4096) throw new DeploymentError('Legacy startup lock is invalid')
    let previous
    try { previous = JSON.parse(readFileSync(fd, 'utf8')) }
    catch { throw new DeploymentError('Legacy startup lock is invalid; explicit inspection is required') }
    if (!Number.isSafeInteger(previous?.pid) || previous.pid <= 0) throw new DeploymentError('Legacy startup lock has no valid owner')
    if (processAlive(previous.pid)) throw new DeploymentError('Another service still owns the legacy startup lock')
  } finally { closeSync(fd) }
}

export function acquireServiceLock(dataRoot: string): ServiceLock {
  if (!['darwin', 'freebsd'].includes(process.platform)) throw new DeploymentError('Service locking requires Darwin/FreeBSD kernel exclusive locks')
  if (!isAbsolute(dataRoot)) throw new DeploymentError('Service data root must be absolute')
  mkdirSync(dataRoot, { recursive: true, mode: 0o700 })
  assertPrivate(lstatSync(dataRoot), true)
  const path = join(dataRoot, 'mastra-service.owner')
  let fd: number
  try { fd = openSync(path, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK | O_EXLOCK, 0o600) }
  catch { throw new DeploymentError('Another service owns the data root, or its lock path is unsafe') }
  let released = false
  const opened = fstatSync(fd)
  const lock: ServiceLock = {
    dataRoot, path, identity: randomBytes(32).toString('hex'),
    assertHeld() {
      if (released) throw new DeploymentError('Service lock has already been released')
      assertPrivate(opened)
      const current = lstatSync(path)
      assertPrivate(current)
      if (opened.dev !== current.dev || opened.ino !== current.ino) throw new DeploymentError('Service lock path no longer names the held inode')
    },
    release() { if (!released) { released = true; closeSync(fd) } },
  }
  try { lock.assertHeld(); checkLegacyLock(dataRoot); return lock }
  catch (error) { lock.release(); throw error }
}
