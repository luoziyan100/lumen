/**
 * [INPUT]: node:fs、core 的 Tool
 * [OUTPUT]: createMemoryTools(read_memory/write_memory)+ readMemoryIndex(开局注入用)
 * [POS]: §5.2 环境工具旁支。学 Claude Code 的第三层记忆(owner 拍板 2026-07-15):
 *        项目级 memory/ 目录,一条事实一个文件 + MEMORY.md 索引;索引由 runtime 开局注入系统提示词。
 *        对用户完全透明(真实文件,可看可改可删);记录事实而非对话本身——防漂移家法的延伸。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import type { Tool, ToolResult } from '../../core/tool.ts'

const NAME_RE = /^[\w][\w.-]*$/ // 单层文件名:字母数字._-;首字符必须是字母数字;禁路径分隔
const CONTENT_MAX = 64_000
const READ_MAX = 30_000
const INDEX_MAX_LINES = 200
const INDEX_MAX_CHARS = 25_000

export const MEMORY_INDEX = 'MEMORY.md'

function bad(msg: string): ToolResult {
  return { llmContent: `error: ${msg}` }
}

export function createMemoryTools(memoryDir: string): Tool[] {
  const resolve = (name: string): string | null => {
    if (!NAME_RE.test(name) || name.includes('..')) return null
    return path.join(memoryDir, name)
  }

  const readMemory: Tool = {
    spec: {
      name: 'read_memory',
      description: '读取一条跨会话记忆的正文(memory/ 目录)。系统提示词里的记忆索引列出了文件名;需要细节时再读,别整本翻。',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: '记忆文件名,如 reading-style.md 或 MEMORY.md' } },
        required: ['name'],
      },
    },
    run: async (args): Promise<ToolResult> => {
      const name = String((args as { name?: unknown }).name ?? '')
      const file = resolve(name)
      if (!file) return bad('非法记忆文件名(仅限字母/数字/._-,不含路径)')
      try {
        return { llmContent: readFileSync(file, 'utf8').slice(0, READ_MAX) }
      } catch {
        return bad(`记忆不存在: ${name}`)
      }
    },
  }

  const writeMemory: Tool = {
    spec: {
      name: 'write_memory',
      description:
        '写入/覆盖一条跨会话记忆(memory/<name>)。何时用:用户的长期偏好、纠正、项目约定——不是对话内容本身。' +
        '纪律:一条事实一个文件(kebab-case.md);写完同步更新 MEMORY.md 索引(每条一行「- [标题](文件名) — 一句钩子」);' +
        '记忆过时就覆盖修正。所有记忆用户随时可见可删。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '文件名,如 reading-style.md;索引固定叫 MEMORY.md' },
          content: { type: 'string', description: '完整文件内容(覆盖写)' },
        },
        required: ['name', 'content'],
      },
    },
    run: async (args): Promise<ToolResult> => {
      const name = String((args as { name?: unknown }).name ?? '')
      const content = String((args as { content?: unknown }).content ?? '')
      const file = resolve(name)
      if (!file) return bad('非法记忆文件名(仅限字母/数字/._-,不含路径)')
      if (content.length > CONTENT_MAX) {
        return bad(`记忆过大(${content.length} > ${CONTENT_MAX} 字符):记忆存事实,长内容请写工作区文件`)
      }
      try {
        mkdirSync(path.dirname(file), { recursive: true })
        writeFileSync(file, content, 'utf8')
        return {
          llmContent: `已写入记忆 ${name}(${content.length} 字符)${name === MEMORY_INDEX ? '' : ';若索引未更新,记得同步 MEMORY.md'}`,
        }
      } catch (e) {
        return bad(e instanceof Error ? e.message : String(e))
      }
    },
  }

  return [readMemory, writeMemory]
}

/** 开局注入用:读 MEMORY.md,截断到 200 行 / 25KB;不存在返回 ''(系统提示词零变化) */
export function readMemoryIndex(memoryDir: string): string {
  try {
    const raw = readFileSync(path.join(memoryDir, MEMORY_INDEX), 'utf8')
    const capped = raw.length > INDEX_MAX_CHARS ? raw.slice(0, INDEX_MAX_CHARS) : raw
    const lines = capped.split('\n')
    return (lines.length > INDEX_MAX_LINES ? lines.slice(0, INDEX_MAX_LINES) : lines).join('\n').trim()
  } catch {
    return ''
  }
}
