/**
 * [INPUT]: 无
 * [OUTPUT]: sanitizeWorkspaceId —— 客户端可控 id 的路径安全消毒
 * [POS]: storage/ 与 runtime 共用;禁 ../ 穿越
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
export function sanitizeWorkspaceId(id: string): string {
  const clean = (id ?? '').replace(/[^\w-]/g, '_').slice(0, 64)
  return clean || 'default'
}
