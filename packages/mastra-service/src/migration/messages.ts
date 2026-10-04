/**
 * [INPUT]: 旧 task_events 主线程事件、身份映射与原文件清单
 * [OUTPUT]: 确定性原生 Memory 消息、阻塞/归档项与来源标记
 * [POS]: 一次性历史转换；跨事件按调用身份配对，旧运行时催促仅保留来源，不混入子代理内部消息
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto'
import type { MastraDBMessage, MastraMessagePart, MastraToolInvocationPart } from '@mastra/core/agent/message-list'
import type { LegacyEvent, LegacyTask, MigrationIssue, SessionMapping, SourceFile } from './types.ts'

const ignored = new Set(['status_change', 'context_init', 'spawn', 'reply', 'error', 'budget_extension', 'compaction',
  'context_usage', 'turn_start', 'turn_end', 'subagent_started', 'subagent_completed', 'subagent_interrupted',
  'subagent_demoted', 'subagent_completion_reminder', 'subagent_completion_reminder_consumed', 'aux_model'])
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown): string => typeof value === 'string' ? value : ''
const cleanSegment = (value: string): string => value.replace(/[^\w-]/g, '_').slice(0, 64) || 'default'

function source(event: LegacyEvent, payload: Record<string, unknown>) {
  const fields = ['operationId', 'parentOperationId', 'providerCallId', 'resultSource', 'resultStatus', 'turnId', 'usage', 'path', 'data']
  return { eventId: event.id, seq: event.seq, kind: event.kind, createdAt: event.created_at,
    ...Object.fromEntries(fields.filter(key => payload[key] !== undefined).map(key => [key, payload[key]])) }
}

function makeMessage(mapping: SessionMapping, event: LegacyEvent, role: 'user' | 'assistant', parts: MastraMessagePart[], payload: Record<string, unknown>): MastraDBMessage {
  const id = createHash('sha256').update(`lumen-legacy-v1\0${mapping.threadId}\0${event.id}`).digest('hex')
  return { id: `legacy-${id}`, role, threadId: mapping.threadId, resourceId: mapping.threadId,
    createdAt: new Date(event.created_at), content: { format: 2, parts, metadata: { legacy: source(event, payload) } } }
}

function attachmentPath(mapping: SessionMapping, path: string): string | undefined {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) return undefined
  const project = `workspaces/${cleanSegment(mapping.sourceProjectId)}`
  return path.startsWith('shared/') ? `${project}/${path}` : `${mapping.workspace}/${path}`
}

function userMessage(mapping: SessionMapping, event: LegacyEvent, payload: Record<string, unknown>, files: Set<string>, issues: MigrationIssue[]) {
  const message = makeMessage(mapping, event, 'user', [{ type: 'text', text: text(payload.content) }], payload)
  if (Array.isArray(payload.images)) for (const [index, input] of payload.images.entries()) {
    const image = record(input), mediaType = text(image.mediaType), base64 = text(image.base64)
    if (!mediaType.startsWith('image/') || !base64) {
      issues.push({ severity: 'error', code: 'invalid_image', taskId: mapping.sourceId, eventId: event.id, message: 'Historical image data is incomplete' })
      continue
    }
    message.content.experimental_attachments ??= []
    message.content.experimental_attachments.push({ name: `legacy-image-${index}`, contentType: mediaType, url: `data:${mediaType};base64,${base64}` })
  }
  if (Array.isArray(payload.uploads)) {
    message.content.metadata!.legacyUploads = payload.uploads
    for (const raw of payload.uploads) {
      const upload = record(raw)
      for (const key of ['path', 'extractPath']) {
        if (key === 'extractPath' && upload[key] === undefined) continue
        const path = attachmentPath(mapping, text(upload[key]))
        if (!path || !files.has(path)) issues.push({ severity: 'error', code: 'missing_attachment', path: text(upload[key]),
          taskId: mapping.sourceId, eventId: event.id, message: 'Historical attachment reference cannot be resolved inside source root' })
      }
    }
  }
  if (payload.activePath !== undefined) message.content.metadata!.legacyActivePath = payload.activePath
  return message
}

interface PendingCall { part: MastraToolInvocationPart; message: MastraDBMessage; eventId: string; hostId?: string }

export function convertMessages(task: LegacyTask, mapping: SessionMapping, events: LegacyEvent[], files: SourceFile[]) {
  const messages: MastraDBMessage[] = [], issues: MigrationIssue[] = [], archived: Record<string, number> = {}
  const available = new Set(files.filter(file => file.kind === 'file').map(file => file.path))
  const pending = new Map<string, PendingCall>()
  let sawUser = false

  function issue(code: string, eventId: string, message: string) {
    issues.push({ severity: 'error', code, taskId: task.id, eventId, message })
  }
  function flush() {
    for (const call of pending.values()) issue('missing_tool_result', call.eventId, 'Tool invocation has no recorded result; outcome remains unknown')
    pending.clear()
  }
  function archive(kind: string) { archived[kind] = (archived[kind] ?? 0) + 1 }

  for (const event of events) {
    if (event.agent_role && event.agent_role !== 'main') { archive(`worker:${event.kind}`); continue }
    let payload: Record<string, unknown>
    try {
      const raw: unknown = JSON.parse(event.payload_json)
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Expected event object')
      payload = record(raw)
    }
    catch { issue('invalid_payload', event.id, 'Event payload is invalid JSON'); archive(event.kind); continue }
    if (Number.isNaN(new Date(event.created_at).valueOf())) { issue('invalid_timestamp', event.id, 'Event timestamp is invalid'); continue }
    if (event.kind === 'user') {
      sawUser = true
      if (typeof payload.content !== 'string') { issue('invalid_user_content', event.id, 'Historical user content is not text'); continue }
      messages.push(userMessage(mapping, event, payload, available, issues))
    } else if (event.kind === 'model_step') {
      if ((payload.content !== undefined && typeof payload.content !== 'string') ||
          (payload.reasoningContent !== undefined && typeof payload.reasoningContent !== 'string') ||
          (payload.toolCalls !== undefined && !Array.isArray(payload.toolCalls))) {
        issue('invalid_model_step', event.id, 'Historical model response does not match the known content shape'); continue
      }
      const parts: MastraMessagePart[] = []
      if (payload.reasoningContent) parts.push({ type: 'reasoning', reasoning: text(payload.reasoningContent), details: [{ type: 'text', text: text(payload.reasoningContent) }] })
      if (typeof payload.content === 'string') parts.push({ type: 'text', text: payload.content })
      const message = makeMessage(mapping, event, 'assistant', parts, payload)
      if (Array.isArray(payload.toolCalls)) for (const raw of payload.toolCalls) {
        const call = record(raw), id = text(call.id), name = text(call.name)
        if (!id || !name || pending.has(id) || !call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments)) {
          issue('invalid_tool_call', event.id, 'Tool invocation identity or arguments are invalid'); continue
        }
        const part: MastraToolInvocationPart = { type: 'tool-invocation', toolInvocation: {
          state: 'call', toolCallId: id, toolName: name, args: record(call.arguments),
        } }
        parts.push(part); pending.set(id, { part, message, eventId: event.id })
      }
      messages.push(message)
    } else if (event.kind === 'tool_call') {
      const call = pending.get(text(payload.providerCallId) || text(payload.id))
      if (!call) issue('orphan_tool_call', event.id, 'Tool execution has no corresponding model invocation')
      else {
        call.hostId = text(payload.operationId)
        const calls = (call.message.content.metadata!.legacyToolCalls ??= []) as unknown[]
        calls.push(source(event, payload))
      }
    } else if (event.kind === 'tool_result') {
      const hostId = text(payload.operationId)
      const entry = hostId ? [...pending].find(([, call]) => call.hostId === hostId) : undefined
      const id = entry?.[0] ?? (text(payload.providerCallId) || text(payload.id))
      const call = pending.get(id)
      if (!call || (hostId && call.hostId && hostId !== call.hostId) || (payload.name && payload.name !== call.part.toolInvocation.toolName) || typeof payload.llmContent !== 'string') {
        issue('orphan_tool_result', event.id, 'Tool result has no matching invocation or model-readable content'); continue
      }
      call.part.toolInvocation.state = 'result'
      call.part.toolInvocation.result = payload.llmContent
      if (['failed', 'cancelled', 'unknown'].includes(text(payload.resultStatus))) call.part.toolInvocation.isError = true
      const provenance = call.message.content.metadata!
      const results = (provenance.legacyToolResults ??= []) as unknown[]
      results.push(source(event, payload)); pending.delete(id)
    } else if (event.kind === 'empty_action' && typeof payload.nudge === 'string') {
      archive(event.kind)
      const previous = messages.at(-1)
      if (previous) {
        const reminders = (previous.content.metadata!.legacyHarnessEvents ??= []) as unknown[]
        reminders.push({ ...source(event, payload), nudge: payload.nudge })
      }
    } else {
      archive(event.kind)
      if (!ignored.has(event.kind)) issues.push({ severity: 'warning', code: 'archived_event', taskId: task.id, eventId: event.id, message: `Event kind ${event.kind} preserved only in original archive` })
    }
  }
  flush()
  if (!sawUser && task.goal) {
    const event = { id: `goal:${task.id}`, task_id: task.id, seq: -1, kind: 'task_goal', created_at: task.created_at, payload_json: '' }
    messages.unshift(makeMessage(mapping, event, 'user', [{ type: 'text', text: task.goal }], {}))
  }
  if (Object.keys(archived).some(kind => kind.startsWith('worker:'))) issues.push({ severity: 'warning', code: 'worker_history_archived',
    taskId: task.id, message: 'Subagent internal history is preserved in archive and is not mixed into the parent thread' })
  if (archived.empty_action) issues.push({ severity: 'warning', code: 'harness_events_archived', taskId: task.id,
    message: 'Legacy operational nudges remain in raw archive and message provenance; they are not replayed as system instructions' })
  let previous = -Infinity
  for (const message of messages) {
    const original = message.createdAt.valueOf()
    message.createdAt = new Date(Math.max(original, previous + 1))
    previous = message.createdAt.valueOf()
  }
  return { messages, issues, archived }
}
