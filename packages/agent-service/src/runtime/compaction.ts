/**
 * [INPUT]: TaskStore;context-budget 纯函数;EventHub.notify
 * [OUTPUT]: CompactionHub —— maybeCompact / appendCompaction / emitContextUsage
 * [POS]: runtime/ 上下文预算落地。回合前水位检查 + 确定性压缩事件 + 终态水位。
 *        从 agent-runtime 切出以满足单文件 ≤800;压缩算法仍在 storage/context-budget.ts。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { readdirSync } from 'node:fs'
import {
  DEFAULT_COMPACTION,
  estimateWatermark,
  planCompaction,
  type CompactionPayload,
} from '../storage/context-budget.ts'
import type { Task, TaskEvent, TaskStore } from '../storage/task-store.ts'

export interface CompactionBudget {
  window?: () => number
  triggerRatio?: number
  keepRecentTokens?: number
  userVerbatimTokens?: number
  persistToolResultChars?: number
}

export class CompactionHub {
  private readonly store: TaskStore
  private readonly workspacesDir: string
  private readonly budget: CompactionBudget | undefined
  private readonly systemPrompt: (projectId?: string) => string
  private readonly notify: (taskId: string, event: TaskEvent) => void
  private readonly rehydrateReminders: (taskId: string) => void

  constructor(
    store: TaskStore,
    workspacesDir: string,
    budget: CompactionBudget | undefined,
    systemPrompt: (projectId?: string) => string,
    notify: (taskId: string, event: TaskEvent) => void,
    rehydrateReminders: (taskId: string) => void,
  ) {
    this.store = store
    this.workspacesDir = workspacesDir
    this.budget = budget
    this.systemPrompt = systemPrompt
    this.notify = notify
    this.rehydrateReminders = rehydrateReminders
  }

  /** 回合前水位检查:超阈值 → 追加确定性压缩事件并返回最新事件列表;否则 null */
  maybeCompact(task: Task, events: TaskEvent[]): TaskEvent[] | null {
    const window = this.budget?.window?.() ?? 0
    if (!window) return null
    const ratio = this.budget?.triggerRatio ?? 0.85
    const wm = estimateWatermark(events, this.systemPrompt(task.project_id).length)
    if (wm.estimatedTotal < window * ratio) return null
    return this.appendCompaction(task, events, wm.estimatedTotal)
  }

  /** 落一条 compaction 事件(切点+清单+用户原话,全部确定性生成、零模型参与) */
  appendCompaction(task: Task, events: TaskEvent[], estTokensBefore: number): TaskEvent[] | null {
    const plan = planCompaction(events, {
      keepRecentTokens: this.budget?.keepRecentTokens ?? DEFAULT_COMPACTION.keepRecentTokens,
      userVerbatimTokens: this.budget?.userVerbatimTokens ?? DEFAULT_COMPACTION.userVerbatimTokens,
    })
    if (!plan) return null
    const payload: CompactionPayload = {
      cutFromSeq: plan.cutFromSeq,
      manifest: workspaceManifest(this.workspacesDir, task.project_id, task.id),
      verbatimUsers: plan.verbatimUsers,
      archivedEvents: plan.archivedEvents,
      estTokensBefore,
    }
    const stored = this.store.appendEvent(task.id, 'compaction', payload, 'main')
    this.notify(task.id, stored)
    this.rehydrateReminders(task.id)
    return this.store.listEvents(task.id)
  }

  /** 每回合结束落一条水位事件(真实 promptTokens 锚点 + 估算/窗口/比例) */
  emitContextUsage(taskId: string): void {
    const window = this.budget?.window?.()
    if (!window) return
    const wm = estimateWatermark(this.store.listEvents(taskId))
    const stored = this.store.appendEvent(taskId, 'context_usage', {
      promptTokens: wm.promptTokens,
      estimatedTotal: wm.estimatedTotal,
      window,
      ratio: Math.min(1, wm.estimatedTotal / window),
    }, 'main')
    this.notify(taskId, stored)
  }
}

/** 工作区清单(代码生成):会话目录 + 项目根的文件相对路径,上限 60 行 */
function workspaceManifest(workspacesDir: string, projectId: string, taskId: string): string {
  const lines: string[] = []
  const scan = (root: string, prefix: string): void => {
    if (lines.length >= 60) return
    try {
      for (const f of readdirSync(root, { withFileTypes: true })) {
        if (lines.length >= 60) return
        if (f.name.startsWith('.')) continue
        if (f.isDirectory()) {
          if (!['cache', 'sessions', 'node_modules'].includes(f.name)) scan(root + '/' + f.name, prefix + f.name + '/')
        } else {
          lines.push('- ' + prefix + f.name)
        }
      }
    } catch { /* 目录不存在,跳过 */ }
  }
  scan(workspacesDir + '/' + projectId + '/sessions/' + taskId, '')
  scan(workspacesDir + '/' + projectId, '')
  return lines.join('\n')
}
