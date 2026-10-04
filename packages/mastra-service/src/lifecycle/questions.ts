/**
 * [INPUT]: Agent 公开的 suspended run 查询、Session 挂起登记与原生 workflow 存储
 * [OUTPUT]: restoreSuspendedQuestions / cancelSuspendedQuestions：恢复问题展示，持久化明确取消
 * [POS]: 问答跨进程边界；只恢复已获准并落盘的 ask_user，不自动运行模型或重放工具
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { Agent, AgentRun } from '@mastra/core/agent'
import type { Session } from '@mastra/core/agent-controller'
import type { WorkflowsStorage } from '@mastra/core/storage'

export interface QuestionContext { session: Session; agent: Agent }

export async function suspendedQuestionRuns({ session, agent }: QuestionContext): Promise<AgentRun[]> {
  const threadId = session.thread.getId()
  if (!threadId) return []
  const { runs } = await agent.listSuspendedRuns({ threadId, resourceId: session.identity.getResourceId() })
  return runs.filter(run => run.toolCalls.some(call => call.toolName === 'ask_user'))
}

/** 仅在新 Session 首次绑定时调用；HTTP 回复时不能再次恢复，以免复活本进程已经取消的问题。 */
export async function restoreSuspendedQuestions(context: QuestionContext): Promise<number> {
  const candidates = (await suspendedQuestionRuns(context)).flatMap(run => run.toolCalls.map(call => ({ run, call })))
    .filter(({ call }) => call.toolName === 'ask_user' && !call.requiresApproval && call.toolCallId)
  let restored = 0
  for (const { run, call } of candidates) {
    const payload = call.suspendPayload
    if (!payload || typeof payload !== 'object' || !('question' in payload) || typeof payload.question !== 'string') continue
    if (candidates.filter(candidate => candidate.call.toolCallId === call.toolCallId).length !== 1) continue
    const toolCallId = call.toolCallId!
    if (context.session.suspensions.has({ toolCallId })) continue
    context.session.suspensions.register({ toolCallId, runId: run.runId, toolName: 'ask_user' })
    context.session.emit({ type: 'tool_suspended', toolCallId, toolName: 'ask_user', args: payload, suspendPayload: payload })
    restored++
  }
  return restored
}

/** 仅用于用户明确停止；进程正常 close 不调用它，保留等待答案的原生快照。 */
export async function cancelSuspendedQuestions(context: QuestionContext, storage: WorkflowsStorage): Promise<number> {
  const pending = new Set((await suspendedQuestionRuns(context)).map(run => run.runId))
  const cancelled = new Set<string>()
  const { runs } = await storage.listWorkflowRuns({ resourceId: context.session.identity.getResourceId(), status: 'suspended', perPage: false })
  // -------- 同一 Agent run 有外层执行与内层循环快照，按公开 runId 同时结算 --------
  for (const record of runs) {
    if (!pending.has(record.runId)) continue
    const changed = await storage.updateWorkflowState({ workflowName: record.workflowName, runId: record.runId,
      opts: { status: 'canceled', expectedStatus: 'suspended' },
    })
    if (changed) cancelled.add(record.runId)
  }
  return cancelled.size
}
