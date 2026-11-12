/**
 * [INPUT]: 主 Agent 暴露给模型的工具名（研究、技能、记忆、资料库材料、执行、摄取、历史与 Controller 内建）
 * [OUTPUT]: TOOL_CATEGORIES / ALWAYS_ALLOWED_TOOLS / toolCategory
 * [POS]: 工具权限类别唯一真源；Controller 按类别放行 read/edit/execute，未登记工具落入 other 而不会被默认放行
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export type ToolCategory = 'read' | 'edit' | 'execute' | 'other'

export const TOOL_CATEGORIES: Readonly<Record<string, Exclude<ToolCategory, 'other'>>> = {
  read_file: 'read', list_files: 'read', grep: 'read', read_memory: 'read', read_history: 'read',
  list_materials: 'read', read_material: 'read', board_view: 'read', search_papers: 'read', get_citations: 'read',
  fetch_url: 'read', search_web: 'read', extract_pdf: 'read', extract_docx: 'read', look_at_image: 'read',
  list_skills: 'read', run_skill: 'read', read_skill_file: 'read', task_check: 'read',
  write_file: 'edit', edit_file: 'edit', write_memory: 'edit', install_skill: 'edit',
  board_draw: 'edit', board_update: 'edit', board_supersede: 'edit',
  task_write: 'edit', task_update: 'edit', task_complete: 'edit',
  run_code: 'execute',
}

/** Controller 内建交互/任务工具按工具名单独放行，不依赖类别。 */
export const ALWAYS_ALLOWED_TOOLS = ['ask_user', 'task_write', 'task_update', 'task_complete', 'task_check'] as const

export function toolCategory(name: string): ToolCategory {
  // 原生 agent-* 只来自已注册的专家角色；角色白名单和独立目录先于执行权限生效。
  if (name.startsWith('agent-')) return 'execute'
  return TOOL_CATEGORIES[name] ?? 'other'
}
