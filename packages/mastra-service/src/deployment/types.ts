/**
 * [INPUT]: 显式 Node/工程/数据根配置与系统命令结果
 * [OUTPUT]: DeploymentOptions、DeploymentConfig、CommandRunner、DeploymentStatus
 * [POS]: deployment 的类型边界；执行适配器可替换，所有权判定与真实文件保持不变
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export interface DeploymentOptions {
  nodePath: string
  projectRoot: string
  dataRoot: string
  label?: string
  launchAgentsDir?: string
}

export interface DeploymentConfig {
  label: string
  nodePath: string
  projectRoot: string
  dataRoot: string
  entryPath: string
  plistPath: string
  logDir: string
  stdoutPath: string
  stderrPath: string
  domain: string
  target: string
}

export interface CommandResult { code: number; stdout: string; stderr: string }
export type CommandRunner = (program: string, args: string[]) => Promise<CommandResult>

export interface DeploymentStatus {
  label: string
  plistPath: string
  dataRoot: string
  installed: boolean
  state: 'absent' | 'starting' | 'ready' | 'unhealthy' | 'conflict'
  pid?: number
  reason?: string
}

export class DeploymentError extends Error {
  constructor(message: string) { super(message); this.name = 'DeploymentError' }
}
