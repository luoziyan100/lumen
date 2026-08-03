/**
 * [INPUT]: core Tool / ToolContext.workspace
 * [OUTPUT]: createPlanTools —— update_plan(结构化计划回灌线程 + drafts/plan.md)
 * [POS]: §5.2 环境工具旁支;与 ProcessRow 分离——计划是目标进度,不是工具流水账
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Tool, ToolResult } from '../../core/tool.ts'

export const PLAN_PATH = 'drafts/plan.md'

export type PlanStepStatus = 'pending' | 'in_progress' | 'done'

export interface PlanStep {
  id: string
  label: string
  status: PlanStepStatus
}

export interface TaskPlan {
  title: string
  steps: PlanStep[]
}

const STATUSES = new Set<PlanStepStatus>(['pending', 'in_progress', 'done'])
const TITLE_MAX = 120
const LABEL_MAX = 200
const STEPS_MAX = 24

function bad(msg: string): ToolResult {
  return { llmContent: `error: ${msg}` }
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(1, max - 1))}…`
}

/** 规范化模型入参;非法则抛错文案 */
export function normalizePlan(raw: unknown): TaskPlan | string {
  if (!raw || typeof raw !== 'object') return '参数必须是对象'
  const o = raw as { title?: unknown; steps?: unknown }
  const title = clip(String(o.title ?? ''), TITLE_MAX)
  if (!title) return 'title 不能为空'
  if (!Array.isArray(o.steps) || o.steps.length === 0) return 'steps 至少一步'
  if (o.steps.length > STEPS_MAX) return `steps 过多(≤${STEPS_MAX})`
  const steps: PlanStep[] = []
  const seen = new Set<string>()
  for (let i = 0; i < o.steps.length; i++) {
    const s = o.steps[i]
    if (!s || typeof s !== 'object') return `steps[${i}] 非法`
    const row = s as { id?: unknown; label?: unknown; status?: unknown }
    let id = String(row.id ?? '').trim() || `s${i + 1}`
    if (seen.has(id)) id = `${id}_${i + 1}`
    seen.add(id)
    const label = clip(String(row.label ?? ''), LABEL_MAX)
    if (!label) return `steps[${i}].label 不能为空`
    const statusRaw = String(row.status ?? 'pending') as PlanStepStatus
    if (!STATUSES.has(statusRaw)) return `steps[${i}].status 须为 pending|in_progress|done`
    steps.push({ id, label, status: statusRaw })
  }
  return { title, steps }
}

export function planToMarkdown(plan: TaskPlan): string {
  const lines = [`# ${plan.title}`, '', `进度: ${doneCount(plan)}/${plan.steps.length}`, '']
  for (const s of plan.steps) {
    const mark = s.status === 'done' ? 'x' : ' '
    const tag = s.status === 'in_progress' ? ' *(进行中)*' : ''
    lines.push(`- [${mark}] ${s.label}${tag}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function doneCount(plan: TaskPlan): number {
  return plan.steps.filter((s) => s.status === 'done').length
}

export function createPlanTools(): Tool[] {
  const updatePlan: Tool = {
    spec: {
      name: 'update_plan',
      description:
        '创建或覆盖当前会话的结构化任务计划(复杂多步工作用)。' +
        '首次给出完整 steps;每完成一步立刻再调用并更新 status。' +
        '简单一两步问答不要用。结果会回灌线程并写入 drafts/plan.md。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '计划标题,如「实现计划」' },
          steps: {
            type: 'array',
            description: '有序步骤',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: '稳定 id,如 s1' },
                label: { type: 'string', description: '步骤说明' },
                status: {
                  type: 'string',
                  description: 'pending | in_progress | done',
                  enum: ['pending', 'in_progress', 'done'],
                },
              },
              required: ['label', 'status'],
            },
          },
        },
        required: ['title', 'steps'],
      },
    },
    run: async (args, ctx): Promise<ToolResult> => {
      const normalized = normalizePlan(args)
      if (typeof normalized === 'string') return bad(normalized)
      const md = planToMarkdown(normalized)
      const done = doneCount(normalized)
      const n = normalized.steps.length
      if (ctx.workspace) {
        try {
          await ctx.workspace.writeFile(PLAN_PATH, md)
        } catch (e) {
          return bad(`写入 ${PLAN_PATH} 失败: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      const pathNote = ctx.workspace ? `;已写入 ${PLAN_PATH}` : ''
      return {
        llmContent:
          `计划已更新「${normalized.title}」${done}/${n}${pathNote}\n` +
          JSON.stringify(normalized),
        data: { plan: normalized, path: ctx.workspace ? PLAN_PATH : null },
      }
    },
  }
  return [updatePlan]
}
