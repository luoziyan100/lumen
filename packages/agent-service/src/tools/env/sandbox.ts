/**
 * [INPUT]: 无(纯函数,读 process.platform / os.homedir)
 * [OUTPUT]: sandboxedCommand / seatbeltProfile —— 把 (cmd,args) 包进 OS 级限权
 * [POS]: run_code 的 L2 层(briefs/run-code-sandbox):macOS 用 sandbox-exec/Seatbelt;
 *        其余平台原样返回(仅 L1 进程纪律),sandboxed=false 会在工具输出里如实标注。
 *
 * 为什么是 allow-default + 精准 deny(而非 deny-default):
 *   实测 Homebrew node 在 deny-default 下启动即 SIGABRT——它要摸大量 dyld/mach/ipc 资源,
 *   逐条 allow 既脆又会随 node 版本漂。本地单用户的威胁模型是"防模型伤到用户自己"
 *   (删文件、外泄隐私、写持久化),不是云端的租户逃逸;精准封死三条危险路径即达标:
 *   - 网络:全禁(联网取数走受审的检索/抓取工具,不给裸 socket)
 *   - 写:默认禁,仅放行工作区 + 系统临时目录
 *   - 读:封死敏感目录(~/.ssh、~/.aws、~/.gnupg、~/.lumen 的 token、Keychains、shell 配置)
 *   实测三条逃逸均得 EPERM,工作区读写正常。
 */
import { homedir } from 'node:os'

export interface SandboxedCommand {
  cmd: string
  args: string[]
  sandboxed: boolean
}

const q = (s: string): string => s.replace(/"/g, '\\"')

export function seatbeltProfile(workspaceRoot: string, home = homedir()): string {
  const ws = q(workspaceRoot)
  const h = q(home)
  const secret = [
    `${h}/.ssh`, `${h}/.aws`, `${h}/.gnupg`, `${h}/.config/gcloud`,
    `${h}/.lumen`, `${h}/Library/Keychains`, `${h}/Library/Application Support`,
    `${h}/.zsh_history`, `${h}/.bash_history`, `${h}/.netrc`,
  ]
  return `(version 1)
(allow default)
(deny network*)
(deny file-write*)
(allow file-write*
  (subpath "${ws}")
  (subpath "/private/var/folders") (subpath "/private/tmp")
  (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr") (literal "/dev/tty"))
(deny file-read*
${secret.map((p) => `  (subpath "${q(p)}")`).join('\n')}
  (literal "${h}/.zshrc") (literal "${h}/.bashrc") (literal "${h}/.profile") (literal "${h}/.zshenv"))
`
}

export function sandboxedCommand(cmd: string, args: string[], workspaceRoot: string): SandboxedCommand {
  if (process.platform !== 'darwin') return { cmd, args, sandboxed: false }
  return {
    cmd: '/usr/bin/sandbox-exec',
    args: ['-p', seatbeltProfile(workspaceRoot), cmd, ...args],
    sandboxed: true,
  }
}
