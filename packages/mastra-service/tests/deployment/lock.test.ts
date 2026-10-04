/**
 * [INPUT]: 临时私有目录、真实子进程和 POSIX 信号
 * [OUTPUT]: 稳定内核锁、崩溃恢复与 discovery 生命周期行为证明
 * [POS]: 启动所有权边界测试；不依赖真实 launchd 或用户数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, symlink, writeFile, link, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { acquireServiceLock } from '../../src/deployment/lock.ts'
import { publishDiscovery, readDiscovery, removeDiscovery } from '../../src/deployment/discovery.ts'
import { childProcess, terminate } from './fixture.ts'

test('kernel ownership survives competing open and recovers after SIGKILL without changing inode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mastra-lock-'))
  const child = await childProcess(root)
  try {
    const before = await stat(join(root, 'mastra-service.owner'))
    assert.throws(() => acquireServiceLock(root), /Another service owns/)
    await terminate(child, 'SIGKILL')
    const lock = acquireServiceLock(root)
    const after = await stat(lock.path)
    assert.equal(after.ino, before.ino)
    assert.equal(after.mode & 0o777, 0o600)
    assert.throws(() => acquireServiceLock(root), /Another service owns/)
    lock.release()
    lock.release()
    assert.throws(() => lock.assertHeld(), /released/)
    const next = acquireServiceLock(root)
    assert.equal((await stat(next.path)).ino, before.ino)
    next.release()
  } finally { await terminate(child, 'SIGKILL'); await rm(root, { recursive: true, force: true }) }
})

test('legacy live or malformed lock and unsafe inode are rejected without modification', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mastra-lock-'))
  try {
    const legacy = join(root, 'mastra-service.lock')
    await writeFile(legacy, JSON.stringify({ pid: process.pid, identity: 'old' }), { mode: 0o600 })
    assert.throws(() => acquireServiceLock(root), /legacy startup lock/)
    assert.equal(JSON.parse(await readFile(legacy, 'utf8')).pid, process.pid)
    await writeFile(legacy, '')
    assert.throws(() => acquireServiceLock(root), /invalid/)
    await rm(legacy)
    const owner = join(root, 'mastra-service.owner')
    await rm(owner)
    const external = join(root, 'unrelated')
    await writeFile(external, 'preserve', { mode: 0o600 })
    await symlink(external, owner)
    assert.throws(() => acquireServiceLock(root), /unsafe/)
    await rm(owner)
    await link(external, owner)
    assert.throws(() => acquireServiceLock(root), /link or special/)
    assert.equal(await readFile(external, 'utf8'), 'preserve')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('discovery publication replaces crash residue privately and only the held identity can remove it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mastra-discovery-'))
  const lock = acquireServiceLock(root)
  try {
    const path = join(root, 'mastra-service.json')
    await writeFile(path, '{crash residue', { mode: 0o600 })
    const value = await publishDiscovery(lock, 'http://127.0.0.1:31337')
    assert.equal((await readDiscovery(root))?.token, lock.identity)
    assert.equal((await stat(path)).mode & 0o777, 0o600)
    await assert.rejects(() => publishDiscovery(lock, 'https://attacker.invalid'), /loopback/)
    await writeFile(path, JSON.stringify({ ...value, token: 'f'.repeat(64) }), { mode: 0o600 })
    await removeDiscovery(lock)
    assert.equal((await readDiscovery(root))?.token, 'f'.repeat(64))
    await publishDiscovery(lock, value.baseUrl)
    await chmod(path, 0o644)
    await assert.rejects(() => readDiscovery(root), /private/)
    await chmod(path, 0o600)
    await removeDiscovery(lock)
    assert.equal(await readDiscovery(root), null)
  } finally { lock.release(); await rm(root, { recursive: true, force: true }) }
})
