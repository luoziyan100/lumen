/**
 * [INPUT]: 现存会话身份、官方 Controller SSE、持久消息、原生 displayState 与专家用量派生值
 * [OUTPUT]: SessionFeed 与 messageRole/messageText；原生消息展示、补取和取消订阅，运行错误保留到下一轮开始，连接错误随恢复清除；消息合并在顺序稳定时走追加路径
 * [POS]: 原生数据的展示缓存，只恢复已存在身份；不创建研究或重新实现执行状态机；旧端点重连有界，耗尽通知宿主重新发现
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { agentControllerMessageText, isKnownAgentControllerEvent, type AgentControllerEvent, type MastraDBMessage } from '@mastra/client-js'
import { LumenApi, type ChildTokenUsage, type DisplayState, type Identity } from './client.ts'

export interface SessionView { messages: MastraDBMessage[]; display: DisplayState | null; connected: boolean; error: string | null; connectionError: string | null; model: string; lastStoredMessageId: string | null }

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

export function messageRole(message: MastraDBMessage): 'user' | 'assistant' | null {
  if (message.role === 'user' || message.role === 'assistant') return message.role
  const type = record(message.content.metadata?.signal)?.type
  return message.role === 'signal' && (type === 'user' || type === 'user-message') ? 'user' : null
}

function signalText(contents: unknown): string {
  if (typeof contents === 'string') return contents
  if (!Array.isArray(contents)) return ''
  return contents.map(part => { const value = record(part); return value?.type === 'text' && typeof value.text === 'string' ? value.text : '' }).join('')
}

export function messageText(message: MastraDBMessage): string {
  const text = agentControllerMessageText(message)
  if (text || messageRole(message) !== 'user') return text
  const parts = message.content.parts.flatMap(part => 'data' in part ? [signalText(record(part.data)?.contents)] : []).join('')
  return parts || signalText(record(message.content.metadata?.signal)?.contents)
}

export function mergeMessages(current: MastraDBMessage[], incoming: MastraDBMessage[]): MastraDBMessage[] {
  if (!incoming.length) return current
  if (incoming.length === 1) {
    const message = incoming[0]!
    let index = -1
    for (let i = current.length - 1; i >= 0; i--) if (current[i]!.id === message.id) { index = i; break }
    if (index >= 0 && +new Date(current[index]!.createdAt) === +new Date(message.createdAt)) {
      if (current[index] === message) return current
      const next = current.slice(); next[index] = message; return next
    }
    if (index < 0 && (!current.length || +new Date(message.createdAt) >= +new Date(current.at(-1)!.createdAt))) return [...current, message]
  }
  const messages = new Map(current.map(message => [message.id, message]))
  for (const message of incoming) messages.set(message.id, message)
  return [...messages.values()].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
}

function withDisplay(view: SessionView, display: DisplayState): SessionView {
  const previous = view.display?.childTokenUsage
  if (display.childTokenUsage === undefined || previous && previous.totalTokens > (display.childTokenUsage?.totalTokens ?? 0)) display = { ...display, childTokenUsage: previous }
  const current = display.currentMessage
  const message = current ? { ...current, createdAt: new Date(current.createdAt) } : null
  return { ...view, display, messages: message ? mergeMessages(view.messages, [message]) : view.messages }
}

function applyEvent(view: SessionView, event: AgentControllerEvent): SessionView {
  if (!isKnownAgentControllerEvent(event)) return view
  if (event.type === 'display_state_changed') return withDisplay(view, event.displayState)
  if (event.type === 'message_start' || event.type === 'message_update' || event.type === 'message_end') return { ...view, messages: mergeMessages(view.messages, [event.message]) }
  if (event.type === 'model_changed') return { ...view, model: event.modelId }
  if (event.type === 'agent_start') return { ...view, error: null }
  if (event.type === 'error') return { ...view, error: typeof event.error === 'string' ? event.error : event.error.message }
  return view
}

export class SessionFeed {
  readonly api: LumenApi
  readonly identity: Identity
  readonly session: ReturnType<LumenApi['session']>
  private listeners = new Set<() => void>()
  private view: SessionView = { messages: [], display: null, connected: false, error: null, connectionError: null, model: '', lastStoredMessageId: null }
  private alive = true
  private disconnect?: () => void
  private pending: AgentControllerEvent[] | null = null
  private revision = 0
  private generation = 0
  private connecting = false
  private transportAlive = false
  private refreshQueued = false
  private readonly unavailable?: () => void
  constructor(api: LumenApi, identity: Identity, unavailable?: () => void) { this.unavailable = unavailable; this.api = api; this.identity = Object.freeze({ ...identity }); this.session = api.session(this.identity) }
  getSnapshot = () => this.view
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  setChildUsage(childTokenUsage: ChildTokenUsage) {
    const display = this.view.display
    if (!display || JSON.stringify(display.childTokenUsage) === JSON.stringify(childTokenUsage)) return
    if (display.childTokenUsage && display.childTokenUsage.totalTokens > (childTokenUsage?.totalTokens ?? 0)) return
    this.publish({ display: { ...display, childTokenUsage } })
  }
  private publish(updates: Partial<SessionView>) {
    if (!this.alive) return
    this.view = { ...this.view, ...updates }
    for (const listener of this.listeners) listener()
  }
  private event = (event: AgentControllerEvent) => {
    if (!this.alive) return
    // 用户实时信号与持久正文形态不同；终态后补取框架保存的完整历史。
    if (event.type === 'agent_end') this.queueRefresh()
    if (this.pending) { this.pending.push(event); return }
    const next = applyEvent(this.view, event)
    if (next !== this.view) this.publish(next)
  }
  private queueRefresh() {
    if (this.refreshQueued || !this.alive) return
    this.refreshQueued = true
    queueMicrotask(() => {
      this.refreshQueued = false
      if (this.alive) void this.refresh().catch(() => {})
    })
  }
  private flush(view: SessionView) {
    const events = this.pending; this.pending = null
    this.publish((events ?? []).reduce(applyEvent, view))
  }
  private async history(revision: number) {
    const messages: MastraDBMessage[] = []
    for (let page = 0; this.alive && revision === this.revision; page++) {
      const result = await this.session.listMessages(`${this.identity.projectId}:${this.identity.taskId}`, {
        page, perPage: 200, orderBy: { field: 'createdAt', direction: 'ASC' },
      })
      messages.push(...result.messages)
      if (!result.hasMore) break
      if (!result.messages.length) throw new Error('会话历史分页返回空页，无法完成恢复')
    }
    return messages
  }
  async start() {
    if (!this.alive || this.connecting) return
    this.connecting = true
    const generation = ++this.generation
    this.revision++
    this.transportAlive = false
    this.publish({ connected: false })
    this.disconnect?.()
    this.disconnect = undefined
    try {
      // 恢复的是已有选择；旧数据根留下的本地 ID 不能隐式创建新会话。
      await this.api.request(`/lumen/projects/${encodeURIComponent(this.identity.projectId)}/sessions/${encodeURIComponent(this.identity.taskId)}`)
      if (!this.alive || generation !== this.generation) return
      await this.api.open(this.identity)
      if (!this.alive || generation !== this.generation) return
      this.pending = []
      this.transportAlive = true
      const current = () => this.alive && generation === this.generation
      const subscription = await this.session.subscribe({ onEvent: event => { if (current()) this.event(event) }, reconnect: { maxRetries: 2 },
        onReconnect: () => { if (current()) { this.transportAlive = true; this.publish({ connected: false }); this.queueRefresh() } },
        onError: error => { if (current()) { this.transportAlive = false; this.fail(error) } },
      })
      if (!current()) { subscription.unsubscribe(); return }
      this.disconnect = subscription.unsubscribe
      await this.refresh()
    } catch (error) { if (this.alive && generation === this.generation) this.fail(error) }
    finally { this.connecting = false }
  }
  async refresh() {
    if (!this.alive) return
    const revision = ++this.revision
    this.pending ??= []
    try {
      const [snapshot, history, state] = await Promise.all([this.api.snapshot(this.identity), this.history(revision), this.session.state()])
      if (!this.alive || revision !== this.revision) return
      const view = { ...this.view, messages: mergeMessages(this.view.messages, history), lastStoredMessageId: history.at(-1)?.id ?? null, model: state.modelId, connected: this.transportAlive, connectionError: null }
      this.flush(withDisplay(view, snapshot.displayState))
    } catch (error) {
      if (!this.alive || revision !== this.revision) return
      this.flush(this.view)
      this.fail(error)
      throw error
    }
  }
  fail(error: unknown) {
    if (!this.alive) return
    this.publish({ connectionError: error instanceof Error ? error.message : String(error), connected: false })
    this.unavailable?.()
  }
  async send(content: string) { await this.session.sendMessage(content); this.queueRefresh() }
  close() { this.alive = false; this.revision++; this.generation++; this.transportAlive = false; this.pending = null; this.disconnect?.(); this.disconnect = undefined; this.listeners.clear() }
}
