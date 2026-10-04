/**
 * [INPUT]: 已授权 LocalFilesystem 根与用户选择的相对文件路径
 * [OUTPUT]: nativeFileLocation：规范化且仍在授权根内的文件位置
 * [POS]: 桌面系统打开的服务端边界；不接受任意宿主绝对路径，不负责启动应用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export async function nativeFileLocation(basePath: string, input: string) {
  if (!input || isAbsolute(input) || input.includes('\0')) throw new Error('请选择工作区内的文件')
  const root = await realpath(basePath), path = await realpath(resolve(root, input))
  const local = relative(root, path)
  if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local) || !(await stat(path)).isFile()) throw new Error('文件不在可访问的工作区内')
  return { root, path }
}
