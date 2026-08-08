/**
 * [INPUT]: Task.pinned_at / created_at
 * [OUTPUT]: compareTasksForSidebar —— 与 store list ORDER BY 同构
 * [POS]: App/Sidebar 客户端重排;钉档不跟活跃跳
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 钉档优先 → 钉内 pinned_at 新者上 → 未钉 created_at 新者上 */
export function compareTasksForSidebar(
  a: { pinned_at?: string | null; created_at?: string },
  b: { pinned_at?: string | null; created_at?: string },
): number {
  const ap = a.pinned_at?.trim() ? a.pinned_at : null
  const bp = b.pinned_at?.trim() ? b.pinned_at : null
  if (ap && !bp) return -1
  if (!ap && bp) return 1
  if (ap && bp) {
    const byPin = bp.localeCompare(ap)
    if (byPin !== 0) return byPin
  }
  return (b.created_at ?? '').localeCompare(a.created_at ?? '')
}

export function sortTasksForSidebar<T extends { pinned_at?: string | null; created_at?: string }>(tasks: T[]): T[] {
  return tasks.slice().sort(compareTasksForSidebar)
}
