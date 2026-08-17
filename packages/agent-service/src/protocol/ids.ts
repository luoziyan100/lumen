/**
 * [INPUT]: 无
 * [OUTPUT]: PROJECT_ID_PREFIX / isUserProjectId
 * [POS]: 用户项目 id 前缀的协议真源;铸 id(project-store)与侧栏分桶(sidebarBuckets)同源引用
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 用户显式 create_project 的 id 前缀。default / 访客桶不得用此前缀。 */
export const PROJECT_ID_PREFIX = 'p-'

export function isUserProjectId(id: string): boolean {
  return id.startsWith(PROJECT_ID_PREFIX)
}
