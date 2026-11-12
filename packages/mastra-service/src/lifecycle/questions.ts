/**
 * [INPUT]: Agent 公开的 suspended run 查询、Session 挂起登记与原生 workflow 存储
 * [OUTPUT]: restoreSuspendedQuestions / restoreSuspendedApprovals / cancelSuspendedQuestions：恢复问题与待审批卡展示，持久化明确取消
 * [POS]: 问答与审批跨进程边界；只恢复已落盘的 ask_user 与待审批调用的展示，不自动运行模型、不替用户批准或重放工具
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
  const threadId = context.session.thread.getId(), resourceId = context.session.identity.getResourceId()
  if (!threadId) return 0
  let restored = 0
  for (const { run, call } of candidates) {
    const payload = call.suspendPayload
    if (!payload || typeof payload !== 'object' || !('question' in payload) || typeof payload.question !== 'string') continue
    if (candidates.filter(candidate => candidate.call.toolCallId === call.toolCallId).length !== 1) continue
    const toolCallId = call.toolCallId!
    if (context.session.suspensions.has({ toolCallId })) continue
    context.session.suspensions.register({ toolCallId, runId: run.runId, toolName: 'ask_user', threadId, resourceId })
    context.session.emit({ type: 'tool_suspended', toolCallId, toolName: 'ask_user', args: payload, suspendPayload: payload, resourceId, runId: run.runId })
    restored++
  }
  return restored
}

/**
 * 重启后把持久快照里待审批的工具调用重新登记到显示状态，否则界面没有审批卡，挂起永远无人处理。
 * 只发显示事件；用户的批准/拒绝走官方 tool-approval 路由，它对未挂在本进程的审批调用 respondToPersistedToolApproval。
 * 与 restoreSuspendedQuestions 同样只在新 Session 首次绑定时调用。
 */
export async function restoreSuspendedApprovals({ session, agent }: QuestionContext): Promise<number> {
  const threadId = session.thread.getId()
  if (!threadId) return 0
  const { runs } = await agent.listSuspendedRuns({ threadId, resourceId: session.identity.getResourceId() })
  const calls = runs.flatMap(run => run.toolCalls).filter(call => call.requiresApproval && call.toolCallId && call.toolName)
  let restored = 0
  for (const call of calls) {
    if (calls.filter(other => other.toolCallId === call.toolCallId).length !== 1) continue
    if (session.approval.isArmed({ toolCallId: call.toolCallId! })) continue
    session.emit({ type: 'tool_approval_required', toolCallId: call.toolCallId!, toolName: call.toolName!, args: call.args })
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
