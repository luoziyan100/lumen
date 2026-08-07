/**
 * [INPUT]: Task.goal / Task.title
 * [OUTPUT]: displayTaskTitle —— 侧栏/搜索展示名(title 优先)
 * [POS]: UI 与 Sidebar/Search 共用;与 service task-title.displayTaskTitle 同构
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
export function displayTaskTitle(task: { title?: string | null; goal: string }): string {
  const t = task.title?.trim()
  return t || task.goal
}
