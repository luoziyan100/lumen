/**
 * [INPUT]: todo-tools
 * [OUTPUT]: 再导出 createPlanTools / PLAN_PATH 等(兼容旧 import 路径)
 * [POS]: 已迁至 todo-tools.ts;本文件仅薄再导出,见 doc/todo.md
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
export {
  createTodoTools,
  createPlanTools,
  normalizeTodos,
  legacyPlanToTodos,
  todoToMarkdown,
  completedCount,
  TODO_PATH,
  PLAN_PATH,
  type TodoStatus,
  type TodoItem,
  type TodoList,
} from './todo-tools.ts'

/** @deprecated 旧名;请用 normalizeTodos / TodoList */
export { normalizeTodos as normalizePlan, todoToMarkdown as planToMarkdown, completedCount as doneCount } from './todo-tools.ts'
