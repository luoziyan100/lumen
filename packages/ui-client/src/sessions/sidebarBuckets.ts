/**
 * [INPUT]: protocol/ids.ts 的 isUserProjectId;Project.id / Task 按 project_id 分桶
 * [OUTPUT]: 再导出 isUserProjectId;userProjects / tasksOutsideUserProjects
 * [POS]: 侧栏「项目树 vs 最近」分桶;前缀合同在协议层,此处只消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { isUserProjectId } from '../../../agent-service/src/protocol/ids.ts'
export { isUserProjectId }

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
