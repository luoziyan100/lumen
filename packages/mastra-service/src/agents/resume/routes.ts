/**
 * [INPUT]: 认证后任务授权、原生父Session、专家历史索引与共享预算读取
 * [OUTPUT]: specialistRoutes：专家目录、显式继续和当前任务预算API
 * [POS]: 只提交新的明确委派请求；不恢复旧工具快照、不绕过原生审批
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Session } from '@mastra/core/agent-controller'
import type { SpecialistHistory } from './index.ts'
import type { FamilyBudget } from '../budget/index.ts'

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/)
const identity = z.object({ projectId: id, taskId: id })
const continuation = identity.extend({ specialistId: id, prompt: z.string().trim().min(1).max(12000) }).strict()

export function specialistRoutes(options: {
  history: SpecialistHistory; budget: FamilyBudget
  session: (projectId: string, taskId: string) => Promise<Session>
  withExecution: <T>(work: () => Promise<T>) => Promise<T>
}) {
  const app = new Hono()
  app.get('/specialists', async c => {
    const parsed = identity.safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: 'Invalid task identity' }, 400)
    const { projectId, taskId } = parsed.data
    await options.session(projectId, taskId)
    const specialists = await options.history.list(`${projectId}:${taskId}`)
    return c.json({ specialists: specialists.map(record => ({ ...record, canContinue: record.status !== 'running' && record.threads.length > 0 })) })
  })
  app.get('/budget', async c => {
    const parsed = identity.safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: 'Invalid task identity' }, 400)
    const { projectId, taskId } = parsed.data
    await options.session(projectId, taskId)
    return c.json(await options.budget.read(`${projectId}:${taskId}`))
  })
  app.post('/specialists/continue', async c => {
    const parsed = continuation.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Invalid specialist continuation' }, 400)
    return options.withExecution(async () => {
      const { projectId, taskId, specialistId, prompt } = parsed.data, parent = `${projectId}:${taskId}`
      const session = await options.session(projectId, taskId)
      const state = session.displayState.get()
      if (state.isRunning || state.pendingApproval || state.pendingSuspensions.size) return c.json({ error: '请先完成或停止当前研究，再继续专家' }, 409)
      let previous
      const nonce = randomUUID()
      try { previous = await options.history.prepare(parent, specialistId, nonce) }
      catch (error) { return c.json({ error: (error as Error).message }, 409) }
      if (!previous.threads.length) return c.json({ error: '专家尚无持久上下文，不能假装继续' }, 409)
      let waiting!: () => void
      const approval = new Promise<boolean>(resolve => { waiting = () => resolve(true) })
      const unsubscribe = session.subscribe(event => { if (event.type === 'tool_approval_required' || event.type === 'tool_suspended') waiting() })
      const running = session.sendMessage({ content: `继续此前的 ${previous.role} 专家，必须调用同一 agent-${previous.role}；本轮已由系统指定原专家身份和目录。保留原上下文，历史工具仅作为事实，不自动重放。新的任务：\n${prompt}` }).finally(() => options.history.release(parent, nonce))
      let awaitingApproval: boolean
      try { awaitingApproval = await Promise.race([running.then(() => false), approval]) } finally { unsubscribe() }
      const record = (await options.history.list(parent)).find(item => item.id === specialistId)!
      const after = session.displayState.get()
      if (awaitingApproval || after.pendingApproval || after.pendingSuspensions.size) return c.json({ continued: record.continuations > previous.continuations, pendingApproval: true, record }, 202)
      if (record.continuations <= previous.continuations) return c.json({ error: '模型没有执行指定专家的继续请求；未将新专家冒充继续，请查看本轮反馈', continued: false, record }, 409)
      return c.json({ continued: true, record })
    })
  })
  return app
}
