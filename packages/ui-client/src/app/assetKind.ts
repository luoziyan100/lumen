/**
 * [INPUT]: 工作区相对路径
 * [OUTPUT]: assetKindFromPath —— 无 assets 列表命中时按扩展名推断阅读器 kind
 * [POS]: 用户气泡附件 chip 打开阅读器的兜底;与 service 落盘分类对齐
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export function assetKindFromPath(path: string): 'pdf' | 'doc' | 'html' | 'image' | 'file' {
  const ext = (path.split('.').pop() ?? '').toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'html' || ext === 'htm') return 'html'
  if (['md', 'markdown', 'txt', 'tex', 'csv', 'json', 'yml', 'yaml'].includes(ext)) return 'doc'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image'
  return 'file'
}
