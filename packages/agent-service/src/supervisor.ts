/**
 * [INPUT]: node:child_process / fs，service.ts 入口
 * [OUTPUT]: spawnService —— 把 agent-service 作为独立子进程拉起，等 portfile，返回 {port, stop}
 * [POS]: §4 服务生命周期。Tauri 原生外壳的 Rust 侧将镜像这套逻辑（spawn sidecar → 读 portfile）
 *
 * 这是"agent 是独立进程、关窗口照跑"的可无头验证内核：进程级生命周期与 Tauri 无关。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import * as path from 'node:path'

export interface ServiceProcess {
  port: number
  token?: string
  pid: number
  stop(): void
}

export interface SpawnServiceOptions {
  home: string
  entry: string // service.ts 的绝对路径
  port?: number // 默认 0（临时端口，真实端口从 portfile 读）
  env?: Record<string, string>
  timeoutMs?: number
  stdio?: 'ignore' | 'inherit'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForPortfile(
  file: string,
  child: ChildProcess,
  timeoutMs: number,
): Promise<{ port: number; token?: string }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`agent-service 进程提前退出 (code ${child.exitCode})`)
    if (existsSync(file)) {
      try {
        const info = JSON.parse(readFileSync(file, 'utf8')) as { port?: number; token?: string }
        if (typeof info.port === 'number' && info.port > 0) return { port: info.port, token: info.token }
      } catch {
        // 文件写到一半，下个 tick 再读
      }
    }
    await delay(100)
  }
  throw new Error('等待 agent-service portfile 超时')
}

export async function spawnService(options: SpawnServiceOptions): Promise<ServiceProcess> {
  const portfile = path.join(options.home, 'agent-service.json')
  if (existsSync(portfile)) rmSync(portfile)

  const child = spawn(process.execPath, ['--experimental-strip-types', options.entry], {
    env: {
      ...process.env,
      LUMEN_HOME: options.home,
      LUMEN_PORT: String(options.port ?? 0),
      ...options.env,
    },
    stdio: options.stdio ?? 'ignore',
  })

  try {
    const { port, token } = await waitForPortfile(portfile, child, options.timeoutMs ?? 10_000)
    return { port, token, pid: child.pid ?? -1, stop: () => child.kill() }
  } catch (error) {
    child.kill()
    throw error
  }
}
