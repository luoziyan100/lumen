/**
 * [INPUT]: Project.id / Task 按 project_id 分桶
 * [OUTPUT]: isUserProjectId / userProjects / tasksOutsideUserProjects
 * [POS]: 侧栏「项目树 vs 最近」分桶;storage 的 default ≠ 用户项目(零感知)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 用户显式 create_project 的 id;default / 访客桶不进树 */
export function isUserProjectId(id: string): boolean {
  return id.startsWith('p-')
}

export function userProjects<T extends { id: string }>(projects: readonly T[]): T[] {
  return projects.filter((p) => isUserProjectId(p.id))
}

/** 非 p-* 桶里的会话(default / 历史),供「最近」平铺 */
export function tasksOutsideUserProjects<T>(
  tasksByProject: Record<string, readonly T[]>,
): T[] {
  return Object.entries(tasksByProject)
    .filter(([pid]) => !isUserProjectId(pid))
    .flatMap(([, tasks]) => [...tasks])
}
