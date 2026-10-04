/**
 * [INPUT]: 应用提供的可信 Mastra Workspace 与取消信号
 * [OUTPUT]: relativeFile/readWorkspaceBytes/saveWorkspaceText
 * [POS]: 摄取文件边界；保存只创建新文件，不从模型参数或旧服务目录解析权限
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { isAbsolute, posix, win32 } from 'node:path'
import type { Workspace } from '@mastra/core/workspace'

export function relativeFile(path: string): string {
  if (!path || path.includes('\0') || path.includes('\\') || isAbsolute(path) || win32.isAbsolute(path) || path.split('/').includes('..')) throw new Error('文件必须使用工作区内相对路径')
  return posix.normalize(path)
}

async function cancellable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation
  signal.throwIfAborted()
  let abort!: () => void
  const cancelled = new Promise<never>((_, reject) => { abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }) })
  try { return await Promise.race([operation, cancelled]) }
  finally { signal.removeEventListener('abort', abort) }
}

export async function readWorkspaceBytes(workspace: Workspace, path: string, maxBytes: number, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted()
  const source = relativeFile(path), filesystem = workspace.filesystem
  if (!filesystem) throw new Error('可信工作区文件系统不可用')
  const stat = await cancellable(filesystem.stat(source), signal)
  if (stat.type !== 'file') throw new Error('摄取来源必须是文件')
  if (stat.size > maxBytes) throw new Error(`文件超过 ${maxBytes} 字节上限`)
  signal?.throwIfAborted()
  const bytes = await cancellable(filesystem.readFile(source), signal)
  signal?.throwIfAborted()
  if (typeof bytes === 'string') throw new Error('摄取需要二进制文件读取能力')
  if (bytes.length > maxBytes) throw new Error(`文件超过 ${maxBytes} 字节上限`)
  return Buffer.from(bytes)
}

export async function saveWorkspaceText(workspace: Workspace, path: string, content: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  const target = relativeFile(path), filesystem = workspace.filesystem
  if (!filesystem || filesystem.readOnly) throw new Error('当前工作区只读，无法保存抽取正文')
  await filesystem.writeFile(target, content, { overwrite: false })
}
