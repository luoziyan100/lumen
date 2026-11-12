/**
 * [INPUT]: 显式绝对 Node/工程/数据根与可选 launchd label
 * [OUTPUT]: deploymentConfig、renderPlist、renderPreviousPlists、secretsPath、DEFAULT_LABEL、isLegacyDataRoot
 * [POS]: 部署配置的单一来源；plist 不继承 shell PATH、旧数据目录，也不写入任何凭证——
 *        研究 key 由 Node --env-file-if-exists 从数据根 0600 的 .env 读取，文件缺失时照常启动
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { lstat, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { DeploymentError, type DeploymentConfig, type DeploymentOptions } from './types.ts'

export const DEFAULT_LABEL = 'com.lumen.studio'
// ---- 旧形态的正式根与 label：新形态的服务和部署一律不打开、不覆盖 ----
const LEGACY_DATA_ROOTS = ['.lumen', '.lumen-mastra']
const LEGACY_LABELS = new Set(['com.lumen.mastra'])

/** 路径（存在时按真实路径）是否是旧形态的数据根；新形态的表不能建进旧根。 */
export async function isLegacyDataRoot(path: string): Promise<boolean> {
  const real = async (value: string) => realpath(value).catch(() => resolve(value))
  const target = await real(path)
  for (const name of LEGACY_DATA_ROOTS) if (target === await real(join(homedir(), name))) return true
  return false
}

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
  if (LEGACY_LABELS.has(label)) throw new DeploymentError('The legacy com.lumen.mastra service is not managed by this deployment')
  const [nodePath, projectRoot, dataRoot] = await Promise.all([canonical(options.nodePath), canonical(options.projectRoot), canonical(options.dataRoot)])
  if (await isLegacyDataRoot(dataRoot)) throw new DeploymentError('Studio deployment requires an independent data root, not a legacy one')
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

/** 研究凭证文件(TAVILY_API_KEY / OPENALEX_API_KEY)，只放数据根，不进 plist */
export function secretsPath(config: DeploymentConfig): string {
  return join(config.dataRoot, '.env')
}

export function renderPlist(config: DeploymentConfig): string {
  return plistWith(config, [config.nodePath, '--experimental-strip-types', `--env-file-if-exists=${secretsPath(config)}`, config.entryPath, '--data-root', config.dataRoot])
}

/**
 * 本部署历史版本生成的 plist 白名单：命中即同一所有权，install 原地升级而不视为冲突。
 * 合同：改动 renderPlist 的任何输出(参数、顺序、键)时，必须把改动前的渲染追加到这里，
 * 否则已装机器会被判为「同 label 不同配置」而拒绝升级。tests/deployment/launchd.test.ts 的形状快照强制这一点。
 */
export function renderPreviousPlists(config: DeploymentConfig): string[] {
  return [plistWith(config, [config.nodePath, '--experimental-strip-types', config.entryPath, '--data-root', config.dataRoot])]
}

function plistWith(config: DeploymentConfig, args: string[]): string {
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
