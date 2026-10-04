/**
 * [INPUT]: 当前任务 LocalFilesystem、可信解释器/只读根/网络配置与 AbortSignal
 * [OUTPUT]: runCode：受限 Node/Python 执行结果、任务内脚本与有限日志
 * [POS]: 原生 run_code 的 OS 适配；不持有模型循环、审批或会话调度
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { spawn, execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { promisify } from 'node:util'
import type { LocalFilesystem } from '@mastra/core/workspace'
import { sandboxedCommand } from './sandbox.ts'
import { startNetworkProxy } from './network.ts'

export interface ExecutionEnvironment {
  filesystem: LocalFilesystem
  readRoots?: readonly string[]
  allowedDomains?: readonly string[]
  pythonPath?: string
}
export interface CodeRequest { language: 'node' | 'python'; code: string; timeoutSeconds?: number; network?: boolean }
export interface ExecutionResult {
  exitCode: number | null; signal: NodeJS.Signals | null; timedOut: boolean; cancelled: boolean
  stdout: string; stderr: string; truncated: boolean; runPath: string; networkDenials: string[]
}

const OUTPUT_BYTES = 400_000
const PREVIEW_CHARS = 6_000
let python: Promise<string> | undefined

function boundedOutput() {
  const chunks: Buffer[] = []
  let bytes = 0, truncated = false
  return {
    append(chunk: Buffer) {
      const length = Math.min(chunk.length, OUTPUT_BYTES - bytes)
      if (length) chunks.push(chunk.subarray(0, length))
      bytes += length
      truncated ||= length < chunk.length
    },
    text: () => Buffer.concat(chunks).toString('utf8'),
    truncated: () => truncated,
  }
}

function execute(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeout: number, abortSignal?: AbortSignal) {
  const stdout = boundedOutput(), stderr = boundedOutput()
  let timedOut = false, cancelled = false
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  const kill = () => {
    if (!child.pid) return
    try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }
  const cancel = () => { cancelled = true; kill() }
  const timer = setTimeout(() => { timedOut = true; kill() }, timeout)
  child.stdout.on('data', chunk => stdout.append(chunk))
  child.stderr.on('data', chunk => stderr.append(chunk))
  child.once('exit', kill)
  abortSignal?.addEventListener('abort', cancel, { once: true })
  if (abortSignal?.aborted) cancel()
  return new Promise<Omit<ExecutionResult, 'runPath' | 'networkDenials'> & { logs: { stdout: string; stderr: string } }>((resolve, reject) => {
    let spawnError: Error | undefined
    child.once('error', error => { spawnError = error })
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer); abortSignal?.removeEventListener('abort', cancel)
      if (spawnError) { reject(spawnError); return }
      const logs = { stdout: stdout.text(), stderr: stderr.text() }
      resolve({ exitCode, signal, timedOut, cancelled, stdout: logs.stdout.slice(0, PREVIEW_CHARS), stderr: logs.stderr.slice(0, PREVIEW_CHARS),
        truncated: stdout.truncated() || stderr.truncated() || logs.stdout.length > PREVIEW_CHARS || logs.stderr.length > PREVIEW_CHARS,
        logs: { stdout: logs.stdout + (stdout.truncated() ? '\n[日志达到 400000 字节上限，后续输出已丢弃]\n' : ''),
          stderr: logs.stderr + (stderr.truncated() ? '\n[日志达到 400000 字节上限，后续输出已丢弃]\n' : '') },
      })
    })
  })
}

async function prepare(environment: ExecutionEnvironment, input: CodeRequest) {
  const filesystem = environment.filesystem
  if (filesystem.readOnly || !filesystem.contained) throw new Error('run_code 需要当前任务的可写且 contained 的 LocalFilesystem')
  await filesystem.init()
  const root = await realpath(filesystem.basePath)
  const runPath = `runs/${randomUUID()}`
  await filesystem.mkdir(runPath, { recursive: true })
  const directory = await realpath(join(root, runPath))
  if (relative(root, directory).startsWith('..')) throw new Error('执行目录越过当前任务边界')
  const script = `${runPath}/code.${input.language === 'node' ? 'mjs' : 'py'}`
  await filesystem.writeFile(script, input.code)
  await filesystem.mkdir(`${runPath}/tmp`, { recursive: true })
  return { root, runPath, script: join(root, script), temp: join(root, runPath, 'tmp') }
}

export async function runCode(environment: ExecutionEnvironment, input: CodeRequest, abortSignal?: AbortSignal): Promise<ExecutionResult> {
  if (process.platform !== 'darwin') throw new Error('run_code 需要 macOS Seatbelt 隔离执行环境')
  abortSignal?.throwIfAborted()
  const seconds = input.timeoutSeconds ?? 60
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 120) throw new Error('执行超时必须为 1–120 秒')
  if (input.network && !environment.allowedDomains?.length) throw new Error('本次执行未配置允许访问的网络域名')
  const paths = await prepare(environment, input)
  const interpreter = input.language === 'node' ? process.execPath : environment.pythonPath ?? await (python ??= promisify(execFile)('/usr/bin/xcrun', ['--find', 'python3']).then(result => result.stdout.trim()))
  const proxy = input.network ? await startNetworkProxy({ allowedDomains: environment.allowedDomains! }) : undefined
  try {
    const args = input.language === 'node' && proxy ? ['--use-env-proxy', paths.script] : [paths.script]
    const sandbox = await sandboxedCommand(interpreter, args, paths.root, environment.readRoots, proxy?.port)
    const env: NodeJS.ProcessEnv = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin`, HOME: paths.root, TMPDIR: paths.temp,
      LANG: 'en_US.UTF-8', PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1', }
    if (proxy) {
      for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) env[name] = `http://127.0.0.1:${proxy.port}`
      env.NODE_USE_ENV_PROXY = '1'
    }
    const { logs, ...result } = await execute(sandbox.command, sandbox.args, paths.root, env, seconds * 1000, abortSignal)
    await environment.filesystem.writeFile(`${paths.runPath}/stdout.log`, logs.stdout)
    await environment.filesystem.writeFile(`${paths.runPath}/stderr.log`, logs.stderr)
    return { ...result, runPath: paths.runPath, networkDenials: proxy?.denials() ?? [] }
  } finally { await proxy?.close() }
}
