/**
 * [INPUT]: Markdown 相对链接、当前阅读文件的受控范围
 * [OUTPUT]: workspaceLink：工作区内规范路径和可选 PDF 页码；writableDocument：可绑定为当前稿的任务文本
 * [POS]: 展示链接到产品文件 API 的边界；拒绝宿主绝对路径和越界路径
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { FileScope } from './client.ts'

export interface FileTarget { path: string; scope: FileScope; page?: number }

export function writableDocument(target: FileTarget | null | undefined): string | null {
  if (target?.scope !== 'task' || /^(library|cache|workers|shared|source|memory)(\/|$)/.test(target.path)) return null
  if (!/\.(md|markdown|txt|csv|jsonl?|xml|ya?ml|tex|py|tsx?|jsx?|mjs|cjs|sh|css|rs|go|java)$/i.test(target.path)) return null
  return workspaceLink(target.path)?.path === target.path ? target.path : null
}

export function workspaceLink(href: string, current?: FileTarget): FileTarget | null {
  if (!href || href.startsWith('#') || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href)) return null
  let decoded: string
  try { decoded = decodeURIComponent(href.split('#')[0]!) } catch { return null }
  if (!decoded || /[\\\u0000-\u001f?]/.test(decoded) || decoded.startsWith('/')) return null
  const segments = current ? current.path.split('/').slice(0, -1) : []
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (!segments.length) return null; segments.pop() }
    else segments.push(part)
  }
  if (!segments.length) return null
  const fragment = href.split('#')[1] ?? '', match = /^page=([1-9]\d{0,5})$/.exec(fragment)
  return { path: segments.join('/'), scope: current?.scope ?? 'task', ...(match ? { page: Number(match[1]) } : {}) }
}
