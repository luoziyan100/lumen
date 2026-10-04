/**
 * [INPUT]: 临时数据根和 deployment 的命令调用
 * [OUTPUT]: childProcess、launchctlFixture；真实子进程生命周期和合成 job 查询
 * [POS]: 仅隔离 macOS 系统调度边界，文件、锁和 HTTP 仍真实执行
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { executeCommand } from '../../src/deployment/launchd.ts'
import type { CommandRunner, DeploymentConfig } from '../../src/deployment/types.ts'

export async function childProcess(root: string, mode = 'lock', healthDelay = 0): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./service-child.ts', import.meta.url)), root, mode, String(healthDelay)], { stdio: ['ignore', 'pipe', 'pipe'] })
  await new Promise<void>((done, fail) => {
    let output = ''
    let errors = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); fail(new Error('Fixture child did not become ready')) }, 15_000)
    child.stderr!.on('data', chunk => { errors += chunk })
    child.once('error', error => { clearTimeout(timer); fail(error) })
    child.once('exit', code => { clearTimeout(timer); if (!output.includes('"ready":true')) fail(new Error(`Fixture child exited ${code}: ${errors}`)) })
    child.stdout!.on('data', chunk => {
      output += chunk
      if (output.includes('"ready":true')) { clearTimeout(timer); done() }
    })
  })
  return child
}

export async function terminate(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>(done => child.once('exit', () => done()))
  child.kill(signal)
  await exited
}

export function launchctlFixture(config: DeploymentConfig, healthDelay = 0) {
  const calls: string[][] = []
  let child: ChildProcess | undefined
  let attached = false
  const run: CommandRunner = async (program, args) => {
    if (program !== '/bin/launchctl') return await executeCommand(program, args)
    calls.push(args)
    if (args[0] === 'print') {
      if (args[1] !== config.target) throw new Error('Fixture received a foreign label')
      if (!attached) return { code: 113, stdout: '', stderr: 'Could not find service' }
      const running = child && child.exitCode === null && child.signalCode === null
      return { code: 0, stderr: '', stdout: `${config.target} = {\n\tpath = ${config.plistPath}\n\tprogram = ${config.nodePath}\n\tstate = ${running ? 'running' : 'waiting'}\n${running ? `\tpid = ${child!.pid}\n` : ''}\tlast exit code = 1\n}` }
    }
    if (args[0] === 'bootstrap') {
      if (args[1] !== config.domain || args[2] !== config.plistPath || attached) throw new Error('Invalid fixture bootstrap')
      attached = true
      child = await childProcess(config.dataRoot, 'server', healthDelay)
      return { code: 0, stdout: '', stderr: '' }
    }
    if (args[0] === 'bootout') {
      if (args[1] !== config.target || !attached) throw new Error('Invalid fixture bootout')
      attached = false
      if (child) await terminate(child)
      return { code: 0, stdout: '', stderr: '' }
    }
    throw new Error('Unexpected launchctl operation')
  }
  return { run, calls, child: () => child, close: async () => { if (child) await terminate(child, 'SIGKILL') } }
}
