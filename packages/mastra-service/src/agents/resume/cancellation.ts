/**
 * [INPUT]: 已授权父Memory线程、待取消专家工具名/精确invocation与原生workflow状态存储
 * [OUTPUT]: cancelPriorDelegations：清除旧委派可执行挂起指针并保留已完成工具事实
 * [POS]: 用户明确停止/继续的边界；防止SDK按同名工具误恢复已中断run；其它审批引用的共享快照不取消，不运行工具
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { MastraMemory } from '@mastra/core/memory'
import type { MastraStorage } from '@mastra/core/storage'

interface Suspension { toolCallId?: string; toolName?: string; parentToolName?: string; runId?: string; delegatedRunId?: string }

export async function cancelPriorDelegations(memory: MastraMemory, storage: Pick<MastraStorage, 'getStore'>, parent: string, toolNames: Set<string>, invocation?: string) {
  const runIds = new Set<string>(), retainedRunIds = new Set<string>()
  const retain = (entry: Suspension) => { if (entry.runId) retainedRunIds.add(entry.runId); if (entry.delegatedRunId) retainedRunIds.add(entry.delegatedRunId) }
  for (let page = 0;; page++) {
    const result = await memory.recall({ threadId: parent, resourceId: parent, page, perPage: 100, orderBy: { field: 'createdAt', direction: 'ASC' } })
    const changed = []
    for (const original of result.messages) {
      const message = structuredClone(original), metadata = message.content.metadata
      const cancelled = new Set<string>()
      const matches = (entry: Suspension) => toolNames.has(entry.parentToolName ?? entry.toolName ?? '') && (!invocation || `${entry.runId}:${entry.toolCallId}` === invocation)
      const remember = (entry: Suspension) => { if (entry.toolCallId) cancelled.add(entry.toolCallId); if (entry.runId) runIds.add(entry.runId); if (entry.delegatedRunId) runIds.add(entry.delegatedRunId) }
      for (const key of ['pendingToolApprovals', 'suspendedTools'] as const) {
        const entries = metadata?.[key] as Record<string, Suspension> | undefined
        if (!entries) continue
        for (const [id, entry] of Object.entries(entries)) if (matches(entry)) { remember(entry); cancelled.add(id); delete entries[id] } else retain(entry)
        if (!Object.keys(entries).length) delete metadata![key]
      }
      const parts = message.content.parts.filter(part => {
        if (part.type !== 'data-tool-call-suspended' && part.type !== 'data-tool-call-approval') return true
        const entry = part.data as Suspension
        if (!matches(entry)) { retain(entry); return true }
        remember(entry); return false
      })
      if (!cancelled.size && parts.length === message.content.parts.length) continue
      message.content.parts = parts.map(part => part.type === 'tool-invocation' && cancelled.has(part.toolInvocation.toolCallId) && part.toolInvocation.state !== 'result'
        ? { ...part, toolInvocation: { ...part.toolInvocation, state: 'output-error' as const, errorText: '用户已停止或显式改为新一轮继续；旧挂起调用不再自动恢复，已发生副作用需核对原产物。' } } : part)
      changed.push(message)
    }
    if (changed.length) await memory.saveMessages({ messages: changed })
    if (!result.hasMore) break
  }
  if (!runIds.size) return
  const workflows = await storage.getStore('workflows')
  if (!workflows) return
  const { runs } = await workflows.listWorkflowRuns({ resourceId: parent, status: 'suspended', perPage: false })
  for (const run of runs) if (runIds.has(run.runId) && !retainedRunIds.has(run.runId)) await workflows.updateWorkflowState({ workflowName: run.workflowName, runId: run.runId, opts: { status: 'canceled', expectedStatus: 'suspended' } })
}
