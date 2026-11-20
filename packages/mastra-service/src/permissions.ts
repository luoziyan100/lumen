/**
 * [INPUT]: the tool names the main agent exposes to the model (research, skills, memory, library materials, board, sediment, readings, execution, ingestion, history and the Controller built-ins)
 * [OUTPUT]: TOOL_CATEGORIES / ALWAYS_ALLOWED_TOOLS / toolCategory
 * [POS]: the single source of tool permission categories; the Controller allows read/edit/execute per category, unlisted tools fall into `other` and are never allowed by default
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
export type ToolCategory = 'read' | 'edit' | 'execute' | 'other'

export const TOOL_CATEGORIES: Readonly<Record<string, Exclude<ToolCategory, 'other'>>> = {
  read_file: 'read', list_files: 'read', grep: 'read', read_memory: 'read', read_history: 'read',
  list_materials: 'read', read_material: 'read', board_view: 'read', board_look: 'read', reading_view: 'read', search_papers: 'read', get_citations: 'read',
  fetch_url: 'read', search_web: 'read', extract_pdf: 'read', extract_docx: 'read', look_at_image: 'read',
  list_skills: 'read', run_skill: 'read', read_skill_file: 'read', task_check: 'read',
  write_file: 'edit', edit_file: 'edit', write_memory: 'edit', install_skill: 'edit',
  board_draw: 'edit', board_update: 'edit', board_erase: 'edit',
  sediment_invite: 'edit', sediment_quote: 'edit', reading_write: 'edit', reading_insert: 'edit',
  task_write: 'edit', task_update: 'edit', task_complete: 'edit',
  run_code: 'execute',
}

/** Controller built-in interaction/task tools are allowed by name, not by category. */
export const ALWAYS_ALLOWED_TOOLS = ['ask_user', 'task_write', 'task_update', 'task_complete', 'task_check'] as const

export function toolCategory(name: string): ToolCategory {
  // Native agent-* tools come only from registered specialist roles; the role whitelist and its separate catalog apply before execution permissions.
  if (name.startsWith('agent-')) return 'execute'
  return TOOL_CATEGORIES[name] ?? 'other'
}
