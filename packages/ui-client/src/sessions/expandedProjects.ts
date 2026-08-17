/**
 * [INPUT]: localStorage
 * [OUTPUT]: loadExpandedProjectIds / saveExpandedProjectIds / toggleExpandedProjectId
 * [POS]: 侧栏项目行折叠态的客户端真源(brief M1:最近展开记 localStorage)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export const EXPANDED_PROJECTS_KEY = 'lumen:sbExpandedProjects'

export function loadExpandedProjectIds(seed?: string | null): Set<string> {
  const ids = new Set<string>()
  try {
    const raw = localStorage.getItem(EXPANDED_PROJECTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        for (const x of parsed) {
          if (typeof x === 'string' && x.startsWith('p-')) ids.add(x)
        }
      }
    }
  } catch {
    // quota / private / 坏 JSON
  }
  if (seed && seed.startsWith('p-')) ids.add(seed)
  return ids
}

export function saveExpandedProjectIds(ids: Set<string>): void {
  try {
    localStorage.setItem(EXPANDED_PROJECTS_KEY, JSON.stringify([...ids]))
  } catch { /* quota / private mode */ }
}

export function toggleExpandedProjectId(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}
