/**
 * [INPUT]: 解析后的角色配置、内建专家白名单
 * [OUTPUT]: constrainAgent：有效工具/步数/隔离能力与迁移诊断
 * [POS]: 自定义配置只能收窄权限，不能通过 preset、tools 或同名覆盖绕过执行审批
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { SPECIALIST_ROLES, type SpecialistRole } from '../roles.ts'
import type { AgentDefinition } from './types.ts'

const writeTools = new Set(['write_file', 'edit_file', 'copy_project_file', 'copy_task_file'])
const sourceTools = new Set(['list_task_files', 'read_task_file'])

export function constrainAgent(definition: AgentDefinition): { role: SpecialistRole; notes: string[] } {
  const preset = SPECIALIST_ROLES.find(role => role.id === definition.preset)!
  const builtin = SPECIALIST_ROLES.find(role => role.id === definition.name)
  const builtinTools = builtin ? new Set<string>(builtin.tools) : undefined
  const ceiling = new Set<string>(preset.tools.filter(name => !builtinTools || builtinTools.has(name)))
  const canWrite = preset.writable && (builtin?.writable ?? true) && definition.capability !== 'read-only'
  const canExecute = preset.execute && (builtin?.execute ?? true) && ['execute', 'all'].includes(definition.capability)
  const tools = [...new Set(definition.toolNames ?? [...ceiling])].filter(name => ceiling.has(name)
    && (!writeTools.has(name) || canWrite) && (!sourceTools.has(name) || canWrite) && (name !== 'run_code' || canExecute))
  const execute = tools.includes('run_code')
  const writable = execute || tools.some(name => writeTools.has(name) || sourceTools.has(name))
  const maxSteps = Math.min(definition.maxSteps, preset.maxSteps, builtin?.maxSteps ?? Infinity)
  const notes: string[] = []
  const excluded = (definition.toolNames ?? []).filter(name => !tools.includes(name))
  if (excluded.length) notes.push(`工具被当前能力白名单排除：${excluded.join(', ')}`)
  if (definition.maxSteps !== maxSteps) notes.push(`max_steps 收窄为 ${maxSteps}`)
  if (definition.allowNested) notes.push('allow_nested 不再开放；下一层委派由主 Agent 统一安排')
  if (definition.isolation === 'worktree') notes.push('worktree 已改为独立 workers 目录，由主 Agent 审阅后整合产物')
  return { role: { id: definition.name, name: definition.name, description: definition.description, instructions: definition.instructions,
    tools, writable, execute, maxSteps }, notes }
}
