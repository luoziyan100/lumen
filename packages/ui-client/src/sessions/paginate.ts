/**
 * [INPUT]: 已过滤的会话数组 + 页码
 * [OUTPUT]: paginate / SESSIONS_PAGE_SIZE —— 会话页分页切片
 * [POS]: sessions/ 纯函数;SessionsView 消费;页码越界夹紧
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export const SESSIONS_PAGE_SIZE = 20

export interface PageSlice<T> {
  slice: T[]
  page: number
  pageCount: number
}

/** page 从 1;空列表 pageCount=0、page=1、slice=[] */
export function paginate<T>(items: readonly T[], page: number, size = SESSIONS_PAGE_SIZE): PageSlice<T> {
  const pageCount = items.length === 0 ? 0 : Math.ceil(items.length / size)
  const safe = pageCount === 0 ? 1 : Math.min(Math.max(1, page), pageCount)
  const start = (safe - 1) * size
  return { slice: items.slice(start, start + size) as T[], page: safe, pageCount }
}
