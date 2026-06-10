/**
 * [INPUT]: core 的 Tool/ToolContext/ToolResult/Workspace
 * [OUTPUT]: ENV_TOOLS —— L1 环境原语：read_file/write_file/edit_file/list_dir/grep/glob
 * [POS]: §5.2 第一层工具。agent 攒状态的"地面"；全部经 ctx.workspace 沙箱
 *
 * 约定：工具不抛错——失败把 error 写进 llmContent，交给模型下一轮自行恢复（与 runAgent 的 recovery 一致）。
 */
import type { Tool, ToolContext, ToolResult, Workspace } from '../../core/tool.ts'

const READ_MAX_CHARS = 30_000
const GREP_MAX_HITS = 200

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function requireWorkspace(ctx: ToolContext): Workspace | null {
  return ctx.workspace ?? null
}

function objectParam(schema: Record<string, unknown>, required: string[]): Record<string, unknown> {
  return { type: 'object', properties: schema, required }
}

export const readFileTool: Tool = {
  spec: {
    name: 'read_file',
    description: '读取工作区（或 library/ 只读论文库）下某个文件的文本内容。',
    parameters: objectParam({ path: { type: 'string', description: '工作区相对路径' } }, ['path']),
  },
  run: async (args, ctx): Promise<ToolResult> => {
    const ws = requireWorkspace(ctx)
    if (!ws) return { llmContent: 'error: workspace 未注入' }
    try {
      const content = await ws.readFile(String(args.path))
      if (content.length > READ_MAX_CHARS) {
        return {
          llmContent: `${content.slice(0, READ_MAX_CHARS)}\n…[已截断，共 ${content.length} 字符；用 grep 定位或分段读取]`,
          data: { truncated: true, totalChars: content.length },
        }
      }
      return { llmContent: content }
    } catch (error) {
      return { llmContent: `error: ${errorMessage(error)}` }
    }
  },
}

export const writeFileTool: Tool = {
  spec: {
    name: 'write_file',
    description: '写入工作区文件（覆盖；自动创建父目录）。只能写工作区，不能写 library/。',
    parameters: objectParam(
      { path: { type: 'string' }, content: { type: 'string' } },
      ['path', 'content'],
    ),
  },
  run: async (args, ctx): Promise<ToolResult> => {
    const ws = requireWorkspace(ctx)
    if (!ws) return { llmContent: 'error: workspace 未注入' }
    try {
      await ws.writeFile(String(args.path), String(args.content ?? ''))
      return { llmContent: `ok: 已写入 ${args.path}` }
    } catch (error) {
      return { llmContent: `error: ${errorMessage(error)}` }
    }
  },
}

export const editFileTool: Tool = {
  spec: {
    name: 'edit_file',
    description: '精确替换工作区文件中的一段文本（old_string 必须在文件中唯一出现）。',
    parameters: objectParam(
      { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } },
      ['path', 'old_string', 'new_string'],
    ),
  },
  run: async (args, ctx): Promise<ToolResult> => {
    const ws = requireWorkspace(ctx)
    if (!ws) return { llmContent: 'error: workspace 未注入' }
    try {
      await ws.editFile(String(args.path), String(args.old_string ?? ''), String(args.new_string ?? ''))
      return { llmContent: `ok: 已编辑 ${args.path}` }
    } catch (error) {
      return { llmContent: `error: ${errorMessage(error)}` }
    }
  },
}

export const listDirTool: Tool = {
  spec: {
    name: 'list_dir',
    description: '列出工作区某目录下的文件与子目录。',
    parameters: objectParam({ path: { type: 'string', description: '默认工作区根' } }, []),
  },
  run: async (args, ctx): Promise<ToolResult> => {
    const ws = requireWorkspace(ctx)
    if (!ws) return { llmContent: 'error: workspace 未注入' }
    try {
      const entries = await ws.listDir(args.path ? String(args.path) : '')
      if (entries.length === 0) return { llmContent: '(空目录)' }
      const text = entries.map((e) => `${e.type === 'dir' ? 'd' : '-'} ${e.name}`).join('\n')
      return { llmContent: text, data: { entries } }
    } catch (error) {
      return { llmContent: `error: ${errorMessage(error)}` }
    }
  },
}

export const grepTool: Tool = {
  spec: {
    name: 'grep',
    description: '在工作区里按正则搜索文本，返回 path:line:内容。',
    parameters: objectParam(
      {
        pattern: { type: 'string' },
        path: { type: 'string', description: '限定搜索子目录，默认整个工作区' },
        flags: { type: 'string', description: '正则 flags，如 i' },
      },
      ['pattern'],
    ),
  },
  run: async (args, ctx): Promise<ToolResult> => {
    const ws = requireWorkspace(ctx)
    if (!ws) return { llmContent: 'error: workspace 未注入' }
    try {
      const hits = await ws.grep(String(args.pattern), {
        path: args.path ? String(args.path) : undefined,
        flags: args.flags ? String(args.flags) : undefined,
      })
      if (hits.length === 0) return { llmContent: '(无匹配)' }
      const shown = hits.slice(0, GREP_MAX_HITS)
      const text = shown.map((h) => `${h.path}:${h.line}: ${h.text}`).join('\n')
      const note = hits.length > GREP_MAX_HITS ? `\n…[共 ${hits.length} 处，仅显示前 ${GREP_MAX_HITS}]` : ''
      return { llmContent: text + note, data: { total: hits.length } }
    } catch (error) {
      return { llmContent: `error: ${errorMessage(error)}` }
    }
  },
}

export const globTool: Tool = {
  spec: {
    name: 'glob',
    description: '按 glob 模式列出工作区里匹配的文件路径（支持 * 与 **）。',
    parameters: objectParam({ pattern: { type: 'string' } }, ['pattern']),
  },
  run: async (args, ctx): Promise<ToolResult> => {
    const ws = requireWorkspace(ctx)
    if (!ws) return { llmContent: 'error: workspace 未注入' }
    try {
      const paths = await ws.glob(String(args.pattern))
      return { llmContent: paths.length ? paths.join('\n') : '(无匹配)', data: { count: paths.length } }
    } catch (error) {
      return { llmContent: `error: ${errorMessage(error)}` }
    }
  },
}

export const ENV_TOOLS: Tool[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  listDirTool,
  grepTool,
  globTool,
]
