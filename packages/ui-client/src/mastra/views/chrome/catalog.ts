/**
 * [INPUT]: 已鉴权的 LumenApi 分页目录接口
 * [OUTPUT]: loadCatalog：跨项目完整会话目录，latestSessions：确定的更新时间排序
 * [POS]: 导航的数据聚合边界；最多四个项目并发，取消后不继续请求下一页
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { LumenApi, Page, Project, SessionInfo } from '../../data/client'

async function pages<T>(api: LumenApi, path: string, active: () => boolean): Promise<T[]> {
  const items: T[] = []
  for (let page = 0; active(); page++) {
    const result = await api.request<Page<T>>(`${path}&perPage=100&page=${page}`)
    items.push(...result.items)
    if (!result.hasMore) return items
    if (!result.items.length) throw new Error('目录分页没有前进，请刷新后重试')
  }
  return items
}
export function latestSessions(sessions: SessionInfo[]) {
  return [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.taskId.localeCompare(b.taskId))
}
export async function loadCatalog(api: LumenApi, archivedProjects: boolean, archivedSessions: boolean, active = () => true) {
  const projects = await pages<Project>(api, `/lumen/projects?archived=${archivedProjects}`, active)
  const sessions: SessionInfo[] = []
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(4, projects.length) }, async () => {
    while (active() && cursor < projects.length) {
      const project = projects[cursor++]
      sessions.push(...await pages<SessionInfo>(api, `/lumen/projects/${encodeURIComponent(project.id)}/sessions?archived=${archivedSessions}`, active))
    }
  }))
  return { projects, sessions: latestSessions(sessions) }
}
