/**
 * [INPUT]: os/homedir、fs、child_process(launchctl)
 * [OUTPUT]: renderLaunchAgentPlist / installLaunchAgent / uninstallLaunchAgent / launchAgentStatus
 * [POS]: 用户级 LaunchAgent 契约;CLI 与测试共用纯渲染 + 本机 install
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

export const LAUNCH_AGENT_LABEL = 'com.lumen.agent-service'
export const LAUNCH_AGENT_FILENAME = `${LAUNCH_AGENT_LABEL}.plist`

export interface LaunchAgentPaths {
  node: string
  serviceDir: string
  serviceEntry: string
  lumenHome: string
  logDir: string
  stdoutLog: string
  stderrLog: string
  plistPath: string
}

export interface LaunchAgentStatus {
  plistInstalled: boolean
  portfileAlive: boolean
  port?: number
  pid?: number
  label: string
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function findNodeBinary(env: NodeJS.ProcessEnv = process.env): string {
  if (env.LUMEN_NODE?.trim()) return env.LUMEN_NODE.trim()
  for (const c of ['/opt/homebrew/bin/node', '/usr/local/bin/node']) {
    if (existsSync(c)) return c
  }
  return 'node'
}

/** 默认:本包 packages/agent-service;可用 LUMEN_SERVICE_DIR 覆盖 */
export function defaultServiceDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.LUMEN_SERVICE_DIR) return path.resolve(env.LUMEN_SERVICE_DIR)
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

export function resolveLaunchAgentPaths(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): LaunchAgentPaths {
  const serviceDir = defaultServiceDir(env)
  const lumenHome = env.LUMEN_HOME ? path.resolve(env.LUMEN_HOME) : path.join(home, '.lumen')
  const logDir = path.join(lumenHome, 'logs')
  return {
    node: findNodeBinary(env),
    serviceDir,
    serviceEntry: path.join(serviceDir, 'src', 'service.ts'),
    lumenHome,
    logDir,
    stdoutLog: path.join(logDir, 'agent-service.out.log'),
    stderrLog: path.join(logDir, 'agent-service.err.log'),
    plistPath: path.join(home, 'Library', 'LaunchAgents', LAUNCH_AGENT_FILENAME),
  }
}

/** 纯函数:生成 LaunchAgent plist XML */
export function renderLaunchAgentPlist(paths: LaunchAgentPaths, port = 8787): string {
  const n = xmlEscape(paths.node)
  const entry = xmlEscape(paths.serviceEntry)
  const cwd = xmlEscape(paths.serviceDir)
  const home = xmlEscape(paths.lumenHome)
  const out = xmlEscape(paths.stdoutLog)
  const err = xmlEscape(paths.stderrLog)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${n}</string>
    <string>--experimental-strip-types</string>
    <string>${entry}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${cwd}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>LUMEN_HOME</key>
    <string>${home}</string>
    <key>LUMEN_PORT</key>
    <string>${port}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${out}</string>
  <key>StandardErrorPath</key>
  <string>${err}</string>
</dict>
</plist>
`
}

function guiDomain(): string {
  try {
    const uid = spawnSync('id', ['-u'], { encoding: 'utf8' }).stdout.trim()
    return `gui/${uid || process.getuid?.()}`
  } catch {
    return `gui/${process.getuid?.() ?? 501}`
  }
}

function launchctl(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const r = spawnSync('launchctl', args, { encoding: 'utf8' })
  return {
    ok: r.status === 0,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  }
}

export function isLaunchAgentPlistInstalled(home = homedir()): boolean {
  return existsSync(path.join(home, 'Library', 'LaunchAgents', LAUNCH_AGENT_FILENAME))
}

function readPortfile(lumenHome: string): { port?: number; pid?: number } | null {
  const f = path.join(lumenHome, 'agent-service.json')
  if (!existsSync(f)) return null
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as { port?: number; pid?: number }
  } catch {
    return null
  }
}

function tcpAlive(port: number): boolean {
  try {
    const r = spawnSync('node', ['-e', `
      const n=require('net');
      const s=n.connect({host:'127.0.0.1',port:${port}});
      s.on('connect',()=>{s.end();process.exit(0)});
      s.on('error',()=>process.exit(1));
      setTimeout(()=>process.exit(1),400);
    `], { encoding: 'utf8' })
    return r.status === 0
  } catch {
    return false
  }
}

export function launchAgentStatus(env: NodeJS.ProcessEnv = process.env, home = homedir()): LaunchAgentStatus {
  const paths = resolveLaunchAgentPaths(env, home)
  const pf = readPortfile(paths.lumenHome)
  const port = pf?.port
  const alive = typeof port === 'number' && port > 0 ? tcpAlive(port) : false
  return {
    plistInstalled: isLaunchAgentPlistInstalled(home),
    portfileAlive: alive,
    port: alive ? port : undefined,
    pid: alive ? pf?.pid : undefined,
    label: LAUNCH_AGENT_LABEL,
  }
}

export function installLaunchAgent(env: NodeJS.ProcessEnv = process.env, home = homedir()): LaunchAgentPaths {
  const paths = resolveLaunchAgentPaths(env, home)
  if (!existsSync(paths.serviceEntry)) {
    throw new Error(`找不到 service 入口: ${paths.serviceEntry}`)
  }
  if (!existsSync(paths.node) && paths.node !== 'node') {
    throw new Error(`找不到 node: ${paths.node}`)
  }
  mkdirSync(paths.logDir, { recursive: true })
  mkdirSync(path.dirname(paths.plistPath), { recursive: true })

  const xml = renderLaunchAgentPlist(paths)
  writeFileSync(paths.plistPath, xml, 'utf8')

  const domain = guiDomain()
  const target = `${domain}/${LAUNCH_AGENT_LABEL}`
  // 先卸旧的再装(幂等)
  launchctl(['bootout', target])
  const boot = launchctl(['bootstrap', domain, paths.plistPath])
  if (!boot.ok) {
    // 已加载时 bootstrap 可能失败;尝试 kickstart
    const kick = launchctl(['kickstart', '-k', target])
    if (!kick.ok) {
      throw new Error(`launchctl bootstrap 失败: ${boot.stderr || boot.stdout || kick.stderr}`)
    }
  } else {
    launchctl(['enable', target])
    launchctl(['kickstart', '-k', target])
  }
  return paths
}

export function uninstallLaunchAgent(home = homedir()): void {
  const domain = guiDomain()
  const target = `${domain}/${LAUNCH_AGENT_LABEL}`
  launchctl(['bootout', target])
  const plist = path.join(home, 'Library', 'LaunchAgents', LAUNCH_AGENT_FILENAME)
  if (existsSync(plist)) unlinkSync(plist)
}
