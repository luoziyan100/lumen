/**
 * [INPUT]: 显式开关文件、受限文本读取和原子文件发布
 * [OUTPUT]: readAgentToggles / setAgentDisabled；true 仍表示禁用，false 覆盖 frontmatter
 * [POS]: 持久配置写入边界，不修改已运行的 Agent 或已加载项目快照
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { readText, serializeRoot } from '../../skills/files.ts'
import { normalizeAgentName } from './parse.ts'
import type { AgentToggles } from './types.ts'

export async function readAgentToggles(path: string): Promise<AgentToggles> {
  if (!isAbsolute(path)) throw new Error('角色开关文件必须使用显式绝对路径')
  let raw: string
  try { raw = await readText(path, 64_000) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error }
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('角色开关配置必须是对象')
  const result = Object.create(null) as AgentToggles
  for (const [name, disabled] of Object.entries(parsed)) {
    if (typeof disabled !== 'boolean') continue
    if (normalizeAgentName(name) !== name) throw new Error('角色开关含未标准化的名称')
    result[name] = disabled
  }
  return result
}

export async function setAgentDisabled(path: string, name: string, disabled: boolean): Promise<AgentToggles> {
  const id = normalizeAgentName(name)
  if (typeof disabled !== 'boolean') throw new Error('disabled 必须是布尔值')
  return serializeRoot(path, async () => {
    const toggles = await readAgentToggles(path)
    toggles[id] = disabled
    const root = dirname(path)
    await mkdir(root, { recursive: true, mode: 0o700 })
    if (!(await lstat(root)).isDirectory()) throw new Error('角色开关父目录不能是符号链接')
    const temporary = join(root, `.agents-${randomUUID()}.tmp`)
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(JSON.stringify(toggles, null, 2) + '\n'); await file.sync()
      await rename(temporary, path)
    } finally { await file.close(); await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
    return toggles
  })
}
