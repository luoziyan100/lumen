/**
 * [INPUT]: 原生Mastra持久/流式消息parts、当前DisplayState与轮次摘要投影
 * [OUTPUT]: processTimeline 与 createConversationProjection：思考、工具叙事、正文和轮次导航的有序投影；流式更新复用稳定历史
 * [POS]: 纯呈现投影，不保存第二份消息；只采用服务公开reasoning，工具按callId去重，中文文案沿原VERB；计时只采用本轮真实用户消息时间
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { MastraDBMessage } from '@mastra/client-js'
import type { DisplayState } from '../../../data/client'
import { messageRole } from '../../../data/feed'
import { turnItems } from '../transcript/content'
export interface Step { id: string; name: string; label: string; chip?: string; status: 'running' | 'completed' | 'failed' | 'stopped'; error?: string }
export type Row = { kind: 'message'; id: string; message: MastraDBMessage } | { kind: 'thought'; id: string; text: string; running: boolean; startedAt: Date | null } | { kind: 'process'; id: string; steps: Step[]; running: boolean; startedAt: Date | null }
const labels: Record<string, string> = {
  search_papers: '检索文献', openalex_search: '检索文献', web_search: '网页搜索', search_web: '网页搜索',
  extract_pdf: '读取 PDF', fetch_url: '抓取网页', read_url: '抓取网页', web_fetch: '抓取网页',
  write_file: '写入文件', edit_file: '编辑文件', read_file: '读取文件', read_project_file: '读取项目资料',
  list_files: '浏览工作区', list_dir: '列目录', grep: '检索内文', glob: '查找文件',
  run_code: '运行代码', execute_command: '执行命令', todo_write: '更新进度', update_plan: '更新进度', ask_user: '询问用户',
  spawn_subagent: '子代理', wait_subagents: '等待子代理', get_subagent_output: '读子代理结果', kill_subagent: '中止子代理',
  look_at_image: '查看图像', run_skill: '运行技能', read_memory: '读取记忆', write_memory: '写入记忆',
  spawn_agent: '委派专家', delegate_to_agent: '委派专家', search: '搜索资料',
}
export function toolLabel(name: string): string {
  if (!name.startsWith('agent-')) return labels[name] ?? '执行工具'
  const role = name.slice(6), roles: Record<string, string> = { reader: '阅读', verifier: '核验', researcher: '研究', writer: '写作', analyst: '分析' }
  return `委派专家 · ${roles[role] ?? role.slice(0, 20)}`
}
export function turnStartedAt(messages: MastraDBMessage[]): Date | null {
  const message = [...messages].reverse().find(item => messageRole(item) === 'user')
  if (!message) return null
  const date = new Date(message.createdAt)
  return Number.isFinite(date.getTime()) ? date : null
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {} }
export function processTimeline(messages: MastraDBMessage[], display: DisplayState | null): Row[] {
  const rows: Row[] = [], finished = new Set<string>()
  const activeTurn = [...messages].reverse().find(message => messageRole(message) === 'user')?.id ?? 'history'
  let turn = 'history', startedAt: Date | null = null, process: Extract<Row, { kind: 'process' }> | undefined, thought: Extract<Row, { kind: 'thought' }> | undefined
  for (const message of messages) {
    const role = messageRole(message)
    if (role === 'user') { turn = message.id; startedAt = turnStartedAt([message]); process = undefined; thought = undefined; rows.push({ kind: 'message', id: message.id, message }); continue }
    if (role !== 'assistant' && role !== 'tool') continue
    let textIndex = 0
    const hasTools = message.content.parts.some(part => part.type === 'tool-invocation')
    const hasText = message.content.parts.some(part => part.type === 'text' && part.text.trim())
    if (hasTools) finished.delete(`${turn}:process`)
    else if (hasText && (!display?.isRunning || turn !== activeTurn)) finished.add(`${turn}:process`)
    for (const part of message.content.parts) {
      if (part.type === 'reasoning') {
        const value = record(part)
        const text = typeof value.reasoning === 'string' ? value.reasoning : Array.isArray(value.details) ? value.details.flatMap(detail => { const item = record(detail); return item.type === 'text' && typeof item.text === 'string' ? [item.text] : [] }).join('') : ''
        if (!text.trim()) continue
        if (!thought) { thought = { kind: 'thought', id: `${turn}:thought`, text: '', running: false, startedAt }; rows.push(thought) }
        thought.text += `${thought.text ? '\n\n' : ''}${text}`
        thought.running = display?.isRunning === true && display.currentMessage?.id === message.id && !message.content.parts.some(item => item.type === 'text' && item.text.trim() || item.type === 'tool-invocation')
      } else if (part.type === 'tool-invocation') {
        if (!process) { process = { kind: 'process', id: `${turn}:process`, steps: [], running: false, startedAt }; rows.push(process) }
        const call = part.toolInvocation, args = record(call.args), result = record('result' in call ? call.result : undefined)
        const live = display?.activeTools[call.toolCallId], failed = live?.status === 'error' || result.isError === true || !!result.error
        const complete = 'result' in call || live?.status === 'completed'
        const active = turn === activeTurn && display?.isRunning === true && !complete && !failed
        const path = typeof args.path === 'string' ? args.path : typeof args.query === 'string' ? args.query : undefined
        const step: Step = { id: call.toolCallId, name: call.toolName, label: toolLabel(call.toolName), chip: path?.split('/').pop(), status: failed ? 'failed' : complete ? 'completed' : active ? 'running' : 'stopped', error: failed ? (typeof result.error === 'string' ? result.error.slice(0, 180) : '执行失败') : undefined }
        const existing = process.steps.findIndex(item => item.id === step.id)
        if (existing < 0) process.steps.push(step); else process.steps[existing] = step
        process.running = process.steps.some(item => item.status === 'running')
      } else if (part.type === 'text' && part.text.trim() && role === 'assistant') {
        if (hasTools) {
          if (!thought) { thought = { kind: 'thought', id: `${turn}:thought`, text: '', running: false, startedAt }; rows.push(thought) }
          thought.text += `${thought.text ? '\n\n' : ''}${part.text}`
          continue
        }
        const previous = rows[rows.length - 1]
        if (previous?.kind === 'message' && previous.message.id === message.id) previous.message.content.parts.push(part)
        else rows.push({ kind: 'message', id: `${message.id}:text:${textIndex++}`, message: { ...message, content: { ...message.content, parts: [part] } } })
      }
    }
  }
  if (display?.isRunning) {
    for (const [id, tool] of Object.entries(display.activeTools)) {
      if (tool.status !== 'running' && tool.status !== 'streaming_input') continue
      if (rows.some(row => row.kind === 'process' && row.steps.some(step => step.id === id))) continue
      if (!process) { process = { kind: 'process', id: `${activeTurn}:process`, steps: [], running: true, startedAt: turnStartedAt(messages) }; rows.push(process) }
      const args = record(tool.args)
      process.steps.push({ id, name: tool.name, label: toolLabel(tool.name), chip: typeof args.path === 'string' ? args.path.split('/').pop() : undefined, status: 'running' })
      process.running = true
      finished.delete(process.id)
    }
  }
  return rows.filter(row => row.kind !== 'process' || !finished.has(row.id) || row.steps.some(step => step.status === 'failed' || step.status === 'stopped'))
}

// ===== 稳定历史复用；原生消息始终是唯一真源 =====
export function createConversationProjection() {
  let history: MastraDBMessage[] = [], historyRows: Row[] = [], historyTurns: ReturnType<typeof turnItems> = []
  let active: MastraDBMessage[] = [], activeRows: Row[] = [], activeTurns: ReturnType<typeof turnItems> = []
  let previousDisplay: DisplayState | null | undefined
  return (messages: MastraDBMessage[], display: DisplayState | null) => {
    let start = -1
    for (let index = messages.length - 1; index >= 0; index--) if (messageRole(messages[index]!) === 'user') { start = index; break }
    start = Math.max(0, start)
    if (history.length !== start || !history.every((message, index) => message === messages[index])) {
      history = messages.slice(0, start)
      historyRows = processTimeline(history, null); historyTurns = turnItems(history)
    }
    const next = messages.slice(start)
    if (display !== previousDisplay || next.length !== active.length || next.some((message, index) => message !== active[index])) {
      active = next; previousDisplay = display
      activeRows = processTimeline(active, display); activeTurns = turnItems(active)
    }
    return { timeline: [...historyRows, ...activeRows], turns: [...historyTurns, ...activeTurns] }
  }
}
