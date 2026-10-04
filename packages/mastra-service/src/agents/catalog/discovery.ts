/**
 * [INPUT]: 显式角色根与受限文本读取，parseAgentMarkdown
 * [OUTPUT]: discoverAgentFiles：带来源的定义与文件级诊断
 * [POS]: 每层最多扫描 256 个定义，不跟随根内符号链接，不执行配置中的代码
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { lstat, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { containedPath, readText } from '../../skills/files.ts'
import { parseAgentMarkdown } from './parse.ts'
import type { AgentDefinition, AgentDiagnostic, AgentLayer } from './types.ts'

export async function discoverAgentFiles(root: string | null | undefined, layer: AgentLayer) {
  const entries: Array<{ definition: AgentDefinition; layer: AgentLayer; sourcePath: string }> = []
  const diagnostics: AgentDiagnostic[] = []
  if (!root) return { entries, diagnostics }
  if (!isAbsolute(root)) throw new Error('角色目录必须使用显式绝对路径')
  let base: string
  try {
    if (!(await lstat(root)).isDirectory()) throw new Error('角色根须为目录，不能是符号链接')
    base = await realpath(root)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') diagnostics.push({ sourcePath: root, message: String((error as Error).message) })
    return { entries, diagnostics }
  }
  const names = (await readdir(base, { withFileTypes: true })).filter(entry => !entry.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name))
  if (names.length > 256) {
    diagnostics.push({ sourcePath: root, message: '角色目录超过 256 项上限，此层未加载' })
    return { entries, diagnostics }
  }
  for (const entry of names) {
    const relative = entry.isDirectory() ? join(entry.name, 'AGENT.md') : entry.name
    if (!entry.isDirectory() && !/\.md$/i.test(entry.name)) continue
    const sourcePath = join(base, relative)
    try {
      const info = await lstat(sourcePath)
      if (!info.isFile() || entry.isSymbolicLink()) throw new Error('角色配置须为普通文件，不能是符号链接')
      const file = await containedPath(base, relative)
      const fileBase = entry.isDirectory() ? basename(dirname(file)) : basename(file).replace(/\.md$/i, '')
      entries.push({ definition: parseAgentMarkdown(await readText(file, 320_000), fileBase), layer, sourcePath })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') diagnostics.push({ sourcePath, message: String((error as Error).message) })
    }
  }
  return { entries, diagnostics }
}
