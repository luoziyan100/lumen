/**
 * [INPUT]: 显式绝对 Node/工程/数据根与可选 launchd label
 * [OUTPUT]: deploymentConfig、renderPlist、DEFAULT_LABEL
 * [POS]: 部署配置的单一来源；plist 不继承 shell PATH、旧数据目录或模型凭证
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { lstat, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { DeploymentError, type DeploymentConfig, type DeploymentOptions } from './types.ts'

export const DEFAULT_LABEL = 'com.lumen.mastra'

async function canonical(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new DeploymentError('Node, project and data paths must be absolute')
  try { return await realpath(path) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const parent = dirname(path)
    if (parent === path) throw error
    return join(await canonical(parent), path.slice(parent.length + (parent === '/' ? 0 : 1)))
  }
}

export async function deploymentConfig(options: DeploymentOptions): Promise<DeploymentConfig> {
  const label = options.label ?? DEFAULT_LABEL
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]{2,127}$/.test(label)) throw new DeploymentError('LaunchAgent label is invalid')
  const [nodePath, projectRoot, dataRoot] = await Promise.all([canonical(options.nodePath), canonical(options.projectRoot), canonical(options.dataRoot)])
  if (dataRoot === await canonical(join(homedir(), '.lumen'))) throw new DeploymentError('Mastra deployment requires an independent data root')
  const launchAgentsDir = options.launchAgentsDir ?? join(homedir(), 'Library', 'LaunchAgents')
  if (!isAbsolute(launchAgentsDir)) throw new DeploymentError('LaunchAgents directory must be absolute')
  const uid = process.getuid?.()
  if (uid === undefined) throw new DeploymentError('LaunchAgent deployment requires a Unix user identity')
  const entryPath = join(projectRoot, 'packages', 'mastra-service', 'src', 'start.ts')
  if (!(await lstat(entryPath)).isFile()) throw new DeploymentError('Mastra service entry is missing')
  const logDir = join(dataRoot, 'logs')
  const domain = `gui/${uid}`
  return { label, nodePath, projectRoot, dataRoot, entryPath, logDir, domain, target: `${domain}/${label}`,
    plistPath: join(resolve(launchAgentsDir), `${label}.plist`), stdoutPath: join(logDir, 'service.stdout.log'), stderrPath: join(logDir, 'service.stderr.log') }
}

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

export function renderPlist(config: DeploymentConfig): string {
  const args = [config.nodePath, '--experimental-strip-types', config.entryPath, '--data-root', config.dataRoot]
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(config.label)}</string>
  <key>ProgramArguments</key><array>${args.map(arg => `<string>${xml(arg)}</string>`).join('')}</array>
  <key>WorkingDirectory</key><string>${xml(config.projectRoot)}</string>
  <key>EnvironmentVariables</key><dict><key>NODE_ENV</key><string>production</string><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>ExitTimeOut</key><integer>45</integer>
  <key>Umask</key><integer>63</integer>
  <key>StandardOutPath</key><string>${xml(config.stdoutPath)}</string>
  <key>StandardErrorPath</key><string>${xml(config.stderrPath)}</string>
</dict></plist>
`
}
