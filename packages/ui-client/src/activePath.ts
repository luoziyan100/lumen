/**
 * [INPUT]: 工作区相对路径字符串
 * [OUTPUT]: isBindableActivePath / sanitizeActivePathClient —— 客户端当前稿白名单(与 service 同语义)
 * [POS]: 产物闭环(doc/artifact-loop.md);仅 UI 决定是否绑 chip。服务端 sanitizeActivePath 再闸一次
 * [PROTOCOL]: 变更时更新此头部,并与 agent-service upload-awareness 白名单对齐
 */

// 可绑「当前稿」= 默认可 edit 的文本稿。html/htm 只进阅读器预览(只开不绑),
// 避免一点开可视化就钉 activePath(HDD:打开≠要改)。
const BINDABLE_TEXT_EXT = new Set([
  'md', 'markdown', 'txt', 'csv', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'tex',
  'py', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'sh', 'css', 'rs', 'go', 'java',
])

export function normalizeWorkspaceRelPath(raw: string): string | null {
  let p = raw.trim().replace(/\\/g, '/')
  if (!p || p.includes('\0')) return null
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null
  const parts = p.split('/').filter((s) => s.length > 0 && s !== '.')
  if (parts.some((s) => s === '..')) return null
  p = parts.join('/')
  return p || null
}

export function isBindableActivePath(path: string): boolean {
  const p = normalizeWorkspaceRelPath(path)
  if (!p) return false
  if (p === 'shared' || p.startsWith('shared/')) return false
  if (p === 'cache' || p.startsWith('cache/')) return false
  if (p === 'library' || p.startsWith('library/')) return false
  const base = p.split('/').pop() ?? p
  const ext = (base.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
  if (!ext || !BINDABLE_TEXT_EXT.has(ext)) return false
  return true
}

export function sanitizeActivePathClient(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const p = normalizeWorkspaceRelPath(raw)
  if (!p || !isBindableActivePath(p)) return null
  return p
}

/** 从 tool_call.args 取 path(旧 tool_result 无结构化 path 时回退) */
export function pathFromToolArgs(args: unknown): string | null {
  if (!args || typeof args !== 'object') return null
  const o = args as Record<string, unknown>
  const raw = o.path ?? o.file_name ?? o.filename ?? o.file
  if (typeof raw !== 'string') return null
  return normalizeWorkspaceRelPath(raw)
}
