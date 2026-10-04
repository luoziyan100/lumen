/**
 * [INPUT]: 当前任务真实目录、可信只读根、解释器路径和可选代理端口
 * [OUTPUT]: sandboxedCommand：默认断网且任务隔离的 macOS 子进程命令
 * [POS]: execution 的 OS 权限边界；模型无法增加目录或直连网络权限
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { realpath } from 'node:fs/promises'
import { dirname } from 'node:path'

const quote = (path: string) => JSON.stringify(path)

export async function sandboxedCommand(command: string, args: string[], workspace: string, readRoots: readonly string[] = [], proxyPort?: number) {
  if (process.platform !== 'darwin') throw new Error('run_code 需要 macOS Seatbelt；当前系统没有可用的隔离执行环境')
  const root = await realpath(workspace)
  const roots = new Set(['/System', '/usr', '/bin', '/sbin', '/Library/Apple', '/Library/Developer', '/opt/homebrew', dirname(await realpath(command)), root])
  for (const path of readRoots) roots.add(await realpath(path))
  const network = proxyPort === undefined ? '' : `(allow network-outbound (remote tcp "localhost:${proxyPort}"))`
  const profile = `(version 1)
(allow default)
(deny network*)
${network}
(deny file-read*)
(allow file-read-metadata)
(allow file-read* (literal "/")
  ${[...roots].map(path => `(subpath ${quote(path)})`).join('\n  ')}
  (literal "/dev/urandom") (literal "/dev/random") (literal "/dev/null"))
(deny file-write*)
(allow file-write* (subpath ${quote(root)})
  (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr"))`
  return { command: '/usr/bin/sandbox-exec', args: ['-p', profile, command, ...args] }
}
