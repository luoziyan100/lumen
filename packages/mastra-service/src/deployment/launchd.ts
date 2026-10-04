/**
 * [INPUT]: 显式 DeploymentOptions、launchctl 命令适配器、认证健康接口
 * [OUTPUT]: createLaunchdDeployment、executeCommand、parseJob
 * [POS]: 本机部署编排；所有权不明即停，只有目标 job 可被 bootout，不按 discovery PID 杀进程
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { execFile } from 'node:child_process'
import { lstat, mkdir, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { deploymentConfig, renderPlist } from './config.ts'
import { readDiscovery, type Discovery } from './discovery.ts'
import { privateDirectory, preparePrivateLog, readPrivateFile, writePrivateFile } from './files.ts'
import { acquireServiceLock, processAlive } from './lock.ts'
import { DeploymentError, type CommandResult, type CommandRunner, type DeploymentConfig, type DeploymentOptions, type DeploymentStatus } from './types.ts'

const LAUNCHCTL = '/bin/launchctl'
interface Job { state: 'absent' | 'running' | 'waiting' | 'unknown'; pid?: number; path?: string; program?: string }
interface Dependencies { run?: CommandRunner; fetch?: typeof fetch; timeoutMs?: number; pollMs?: number }

export const executeCommand: CommandRunner = (program, args) => new Promise((done, fail) => {
  execFile(program, args, { timeout: 30_000, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
    if (error && typeof error.code !== 'number') { fail(new DeploymentError('Deployment command could not be executed')); return }
    done({ code: typeof error?.code === 'number' ? error.code : 0, stdout, stderr })
  })
})

export function parseJob(result: CommandResult): Job {
  if (result.code !== 0) {
    if (/could not find service|service not found/i.test(result.stderr + result.stdout)) return { state: 'absent' }
    throw new DeploymentError('Unable to inspect the requested launchd job')
  }
  const field = (name: string) => result.stdout.match(new RegExp(`^\\s*${name} = (.+)$`, 'm'))?.[1]?.trim()
  const state = field('state')
  const pid = Number(field('pid'))
  return { state: state === 'running' ? 'running' : state ? 'waiting' : 'unknown',
    ...(Number.isSafeInteger(pid) && pid > 0 ? { pid } : {}), path: field('path'), program: field('program') }
}

async function healthy(discovery: Discovery, fetcher: typeof fetch): Promise<boolean> {
  try {
    const response = await fetcher(`${discovery.baseUrl}/lumen/health`, { headers: { Authorization: `Bearer ${discovery.token}` }, redirect: 'error', signal: AbortSignal.timeout(1500) })
    if (!response.ok) return false
    const data = await response.json() as { engine?: string; ready?: boolean }
    return data.engine === 'mastra' && data.ready === true
  } catch { return false }
}

async function prepare(config: DeploymentConfig, run: CommandRunner) {
  const version = await run(config.nodePath, ['--version'])
  if (version.code !== 0 || !/^v24\.\d+\.\d+\s*$/.test(version.stdout)) throw new DeploymentError('Deployment requires an absolute Node.js 24 executable')
  await privateDirectory(config.dataRoot)
  await privateDirectory(config.logDir)
  await Promise.all([preparePrivateLog(config.stdoutPath), preparePrivateLog(config.stderrPath)])
  const directory = dirname(config.plistPath)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const stat = await lstat(directory)
  if (!stat.isDirectory() || stat.uid !== process.getuid?.()) throw new DeploymentError('LaunchAgents directory must be owned by this user and cannot be a symlink')
}

export async function createLaunchdDeployment(options: DeploymentOptions, dependencies: Dependencies = {}) {
  if (process.platform !== 'darwin') throw new DeploymentError('LaunchAgent deployment is only available on macOS')
  const config = await deploymentConfig(options)
  const run = dependencies.run ?? executeCommand
  const fetcher = dependencies.fetch ?? fetch
  const expected = renderPlist(config)
  const timeoutMs = dependencies.timeoutMs ?? 60_000
  const pollMs = dependencies.pollMs ?? 200
  const job = async () => parseJob(await run(LAUNCHCTL, ['print', config.target]))

  async function status(): Promise<DeploymentStatus> {
    const base = { label: config.label, plistPath: config.plistPath, dataRoot: config.dataRoot, installed: false }
    try {
      const plist = await readPrivateFile(config.plistPath)
      base.installed = plist !== null
      if (plist !== null && plist !== expected) return { ...base, state: 'conflict', reason: 'Existing plist belongs to another deployment configuration' }
      const current = await job()
      if (current.state !== 'absent' && (current.path !== config.plistPath || current.program !== config.nodePath)) return { ...base, state: 'conflict', reason: 'Loaded job ownership does not match the explicit configuration' }
      const discovery = await readDiscovery(config.dataRoot)
      if (discovery && processAlive(discovery.pid) && discovery.pid !== current.pid) return { ...base, state: 'conflict', reason: 'Data root is held by another live process' }
      if (current.state === 'absent') return { ...base, state: 'absent' }
      if (current.state === 'unknown') return { ...base, state: 'unhealthy', reason: 'Unrecognized launchctl job state' }
      if (current.state !== 'running' || !current.pid || !discovery || discovery.pid !== current.pid) return { ...base, state: 'starting', pid: current.pid }
      if (!await healthy(discovery, fetcher)) return { ...base, state: 'unhealthy', pid: current.pid, reason: 'Authenticated Mastra health check failed' }
      const [confirmedJob, confirmedDiscovery] = await Promise.all([job(), readDiscovery(config.dataRoot)])
      const same = confirmedJob.state === 'running' && confirmedJob.pid === current.pid && confirmedDiscovery?.pid === discovery.pid && confirmedDiscovery.token === discovery.token
      return { ...base, state: same ? 'ready' : 'starting', pid: current.pid }
    } catch (error) {
      return { ...base, state: 'conflict', reason: error instanceof DeploymentError ? error.message : 'Deployment metadata could not be safely inspected' }
    }
  }

  async function command(args: string[]) {
    const result = await run(LAUNCHCTL, args)
    if (result.code !== 0) throw new DeploymentError(`launchctl ${args[0]} failed for the explicit job`)
  }

  async function waitFor(state: 'ready' | 'absent'): Promise<DeploymentStatus> {
    const deadline = Date.now() + timeoutMs
    do {
      const current = await status()
      if (current.state === 'conflict') throw new DeploymentError(current.reason ?? 'Deployment ownership conflict')
      if (current.state === state) return current
      await delay(pollMs)
    } while (Date.now() < deadline)
    throw new DeploymentError(`Timed out waiting for Mastra service to become ${state}; inspect its private logs`)
  }

  async function stop(current: DeploymentStatus) {
    await command(['bootout', config.target])
    const deadline = Date.now() + timeoutMs
    do {
      const remaining = await job()
      if (remaining.state === 'absent' && (!current.pid || !processAlive(current.pid))) return
      await delay(pollMs)
    } while (Date.now() < deadline)
    throw new DeploymentError('Timed out waiting for the owned launchd process to exit')
  }

  async function install(options: { restart?: boolean } = {}) {
    const current = await status()
    if (current.state === 'conflict') throw new DeploymentError(current.reason!)
    if (current.state === 'ready' && !options.restart) return current
    await prepare(config, run)
    if (current.state !== 'absent') await stop(current)
    const exclusive = acquireServiceLock(config.dataRoot)
    exclusive.release()
    await writePrivateFile(config.plistPath, expected)
    await command(['bootstrap', config.domain, config.plistPath])
    return await waitFor('ready')
  }

  async function uninstall() {
    const current = await status()
    if (current.state === 'conflict') throw new DeploymentError(current.reason!)
    if (current.state !== 'absent') await stop(current)
    const plist = await readPrivateFile(config.plistPath)
    if (plist !== null && plist !== expected) throw new DeploymentError('Plist ownership changed during uninstall')
    if (plist !== null) await unlink(config.plistPath)
    return await status()
  }

  return { config, status, install, uninstall }
}
