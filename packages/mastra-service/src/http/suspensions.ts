/**
 * [INPUT]: 已认证且绑定的 Session、原生 suspended run 与用户答案
 * [OUTPUT]: suspensionResponses：官方回复路径上的确定性接收与 409 失效反馈
 * [POS]: 补齐 Controller 静默忽略未知 toolCallId 的边界；实际恢复仍走公开 Session.resumeToolCall
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { MiddlewareHandler } from 'hono'
import { z } from 'zod'
import { suspendedQuestionRuns, type QuestionContext } from '../lifecycle/questions.ts'

const answerSchema = z.object({ toolCallId: z.string().min(1), resumeData: z.union([z.string(), z.array(z.string())]) })
const PATH = /^\/api\/agent-controller\/lumen\/sessions\/([^/]+)\/tool-suspension$/
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/
const UNAVAILABLE = '这个问题已经结束、已取消或无法恢复，答案未提交。请刷新任务后重新发送要求。'
const answering = new WeakMap<QuestionContext['session'], Set<string>>()

class QuestionConflict extends Error {}

async function resumeQuestion(context: QuestionContext, input: z.infer<typeof answerSchema>) {
  const pending = context.session.suspensions.get({ toolCallId: input.toolCallId })
  const claims = answering.get(context.session) ?? new Set<string>()
  if (pending?.toolName !== 'ask_user' || claims.has(input.toolCallId)) throw new QuestionConflict(UNAVAILABLE)
  answering.set(context.session, claims); claims.add(input.toolCallId)
  try {
    const runs = await suspendedQuestionRuns(context)
    const call = runs.find(run => run.runId === pending.runId)?.toolCalls.find(call => call.toolCallId === input.toolCallId)
    if (!call || call.requiresApproval) throw new QuestionConflict('问题仍在保存或已经失效，答案未提交。请刷新后重试。')
    let accepted = false
    const unsubscribe = context.session.subscribe(event => {
      if (event.type === 'tool_end' && event.toolCallId === input.toolCallId) accepted = true
    })
    try { await context.session.resumeToolCall({ ...input, resolveOnToolEnd: true }) }
    catch { throw new QuestionConflict(UNAVAILABLE) }
    finally { unsubscribe() }
    if (!accepted) throw new QuestionConflict(UNAVAILABLE)
  } finally { claims.delete(input.toolCallId) }
}

/** 放在认证和 nativeRoutePolicy 之后；截获这一条官方路径，其余原生端点继续交给 MastraServer。 */
export function suspensionResponses(resolve: (projectId: string, taskId: string) => Promise<QuestionContext>): MiddlewareHandler {
  return async (c, next) => {
    const match = PATH.exec(new URL(c.req.url).pathname)
    if (c.req.method !== 'POST' || !match) return next()
    let identity: string[]
    try { identity = decodeURIComponent(match[1]!).split(':') }
    catch { return c.json({ error: 'Invalid task identity' }, 400) }
    if (identity.length !== 2 || identity.some(part => !ID.test(part))) return c.json({ error: 'Invalid task identity' }, 400)
    const parsed = answerSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Invalid answer' }, 400)
    try {
      await resumeQuestion(await resolve(identity[0]!, identity[1]!), parsed.data)
      return c.json({ ok: true })
    } catch (error) {
      if (error instanceof QuestionConflict) return c.json({ error: error.message, code: 'QUESTION_UNAVAILABLE' }, 409)
      throw error
    }
  }
}
