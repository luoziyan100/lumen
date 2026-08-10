/**
 * [INPUT]: ToolContext.deps.childRunner + deps.subagents；协议 R1.3
 * [OUTPUT]: spawn_subagent / get_subagent_output / kill_subagent / wait_subagents
 * [POS]: subagent T4 L4 模型工具；turn/parent 服务端注入，禁止模型伪造
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Tool, ToolContext, ToolResult } from '../../core/tool.ts'
import type { ChildRunner } from '../../subagent/runner.ts'
import type { SubagentCoordinator } from '../../subagent/coordinator.ts'
import type { CapabilityMode, IsolationMode } from '../../subagent/types.ts'
import { listBuiltinNames, SUBAGENT_ERROR } from '../../subagent/index.ts'

function coord(ctx: ToolContext): SubagentCoordinator | null {
  const c = ctx.deps.subagents
  return c && typeof c === 'object' ? (c as SubagentCoordinator) : null
}

function runner(ctx: ToolContext): ChildRunner | null {
  const r = ctx.deps.childRunner
  return r && typeof r === 'object' ? (r as ChildRunner) : null
}

function jsonResult(data: unknown, llm?: string): ToolResult {
  const text = llm ?? JSON.stringify(data, null, 2)
  return { llmContent: text, data }
}

function errResult(code: string, message: string): ToolResult {
  return jsonResult(
    { success: false, error_code: code, error: message },
    `error: ${code}: ${message}`,
  )
}

function parseBool(v: unknown, defaultValue: boolean): boolean {
  if (v == null) return defaultValue
  if (typeof v === 'boolean') return v
  if (v === 'true' || v === '1') return true
  if (v === 'false' || v === '0') return false
  return defaultValue
}

function parseCapability(v: unknown): CapabilityMode | null {
  if (v == null || v === '') return null
  const s = String(v)
  if (s === 'read-only' || s === 'read-write' || s === 'execute' || s === 'all') return s
  return null
}

function parseIsolation(v: unknown): IsolationMode | undefined {
  if (v == null || v === '') return undefined
  if (v === 'none' || v === 'worktree') return v
  return undefined
}

const SPAWN_SPEC = {
  name: 'spawn_subagent',
  description:
    'Spawn a typed sub-agent (explore/plan/general-purpose/searcher/reader/verifier). '
    + 'background=true (default) returns id immediately; false waits until done or foreground demote. '
    + 'parent_turn/task injected server-side.',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Self-contained task for the child' },
      description: { type: 'string', description: 'Short label for UI/logs (3–8 words)' },
      subagent_type: {
        type: 'string',
        description: `One of: ${listBuiltinNames().join(', ')}`,
      },
      background: {
        type: 'boolean',
        description: 'true=return id immediately (default); false=foreground wait/demote',
      },
      capability_mode: {
        type: 'string',
        description: 'Optional: read-only | read-write | execute | all (meet with type default)',
      },
      isolation: {
        type: 'string',
        description: 'none (default) or worktree (no cwd allowed with worktree)',
      },
      cwd: {
        type: 'string',
        description: 'Virtual path under task session (none only). Omitted for write types → workers/<id>/',
      },
      scope: { type: 'string', description: 'Optional scope prefix for research workers' },
    },
    required: ['prompt', 'description', 'subagent_type'],
  },
}

const GET_SPEC = {
  name: 'get_subagent_output',
  description: 'Query a sub-agent status and completion output (usage, resume_allowed). Non-blocking.',
  parameters: {
    type: 'object',
    properties: {
      subagent_id: { type: 'string' },
    },
    required: ['subagent_id'],
  },
}

const KILL_SPEC = {
  name: 'kill_subagent',
  description: 'Abort a sub-agent and cascade unfinished descendants.',
  parameters: {
    type: 'object',
    properties: {
      subagent_id: { type: 'string' },
    },
    required: ['subagent_id'],
  },
}

const WAIT_SPEC = {
  name: 'wait_subagents',
  description:
    'Wait until listed sub-agents reach a terminal status, or timeout. '
    + 'Does not kill on timeout unless demote_on_timeout is true (foreground demote).',
  parameters: {
    type: 'object',
    properties: {
      subagent_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ids from spawn_subagent',
      },
      timeout_ms: { type: 'number', description: 'Wait budget in ms (default coordinator foreground budget)' },
      demote_on_timeout: {
        type: 'boolean',
        description: 'If true, on timeout mark demoted and return while children keep running',
      },
    },
    required: ['subagent_ids'],
  },
}

export const spawnSubagentTool: Tool = {
  spec: SPAWN_SPEC,
  async run(args, ctx): Promise<ToolResult> {
    const r = runner(ctx)
    const c = coord(ctx)
    if (!r || !c) {
      return errResult(SUBAGENT_ERROR.SPAWN_BLOCKED, 'subagent runtime not available')
    }
    if (!ctx.turnId) {
      return errResult(SUBAGENT_ERROR.SPAWN_BLOCKED, 'missing turnId (server must inject)')
    }

    const prompt = String(args.prompt ?? '').trim()
    const description = String(args.description ?? '').trim()
    const subagent_type = String(args.subagent_type ?? '').trim()
    if (!prompt || !description || !subagent_type) {
      return errResult(SUBAGENT_ERROR.TYPE_UNKNOWN, 'prompt, description, subagent_type required')
    }
    if (args.resume_from) {
      return errResult(
        SUBAGENT_ERROR.RESUME_NOT_ALLOWED,
        'resume_from not wired in this build (T6); spawn a new subagent',
      )
    }

    const background = parseBool(args.background, true)
    const capability = parseCapability(args.capability_mode)
    if (args.capability_mode != null && args.capability_mode !== '' && capability == null) {
      return errResult(SUBAGENT_ERROR.TYPE_UNKNOWN, `invalid capability_mode: ${args.capability_mode}`)
    }
    const isolation = parseIsolation(args.isolation)
    if (args.isolation != null && args.isolation !== '' && isolation == null) {
      return errResult(SUBAGENT_ERROR.TYPE_UNKNOWN, `invalid isolation: ${args.isolation}`)
    }

    // 嵌套：当前 session 是子 id 时，挂 parent_subagent_id
    const parentSub =
      ctx.sessionId && ctx.sessionId !== ctx.taskId ? ctx.sessionId : null

    const start = await r.start({
      parent_task_id: ctx.taskId,
      parent_turn_id: ctx.turnId,
      parent_subagent_id: parentSub,
      subagent_type,
      description,
      prompt,
      scope: args.scope != null ? String(args.scope) : undefined,
      background,
      capability,
      isolation,
      model_cwd: args.cwd != null && String(args.cwd).trim() !== '' ? String(args.cwd) : null,
      depth: ctx.depth + 1,
    })

    if (!start.success) {
      return errResult(
        start.error_code ?? SUBAGENT_ERROR.SPAWN_BLOCKED,
        start.error ?? 'spawn failed',
      )
    }

    await ctx.emit({
      kind: 'spawn',
      agentRole: ctx.agentRole,
      payload: {
        subagent_id: start.subagent_id,
        subagent_type: start.subagent_type,
        status: start.status,
        background,
      },
    })

    if (!background && start.subagent_id) {
      const wr = await c.wait([start.subagent_id], {
        timeoutMs: c.config.foreground_budget_ms,
        demoteOnTimeout: true,
        signal: undefined,
      })
      if (wr.outcome === 'done' && wr.results[0]) {
        return jsonResult(
          { success: true, ...wr.results[0], awaited: true },
          wr.results[0].output || JSON.stringify(wr.results[0]),
        )
      }
      // demoted / timeout：子继续跑
      const snap = c.getOutput(start.subagent_id)
      return jsonResult(
        {
          success: true,
          subagent_id: start.subagent_id,
          subagent_type: start.subagent_type,
          status: snap?.status ?? 'running',
          demoted: wr.outcome === 'demoted',
          awaited: false,
          message: 'foreground budget exceeded; child continues in background — use get_subagent_output / wait_subagents',
        },
      )
    }

    return jsonResult({
      success: true,
      subagent_id: start.subagent_id,
      subagent_type: start.subagent_type,
      status: start.status,
      demoted: start.demoted,
    })
  },
}

export const getSubagentOutputTool: Tool = {
  spec: GET_SPEC,
  async run(args, ctx): Promise<ToolResult> {
    const c = coord(ctx)
    if (!c) return errResult(SUBAGENT_ERROR.SPAWN_BLOCKED, 'subagent runtime not available')
    const id = String(args.subagent_id ?? '')
    if (!id) return errResult(SUBAGENT_ERROR.NOT_FOUND, 'subagent_id required')
    const out = c.getOutput(id)
    if (!out) return errResult(SUBAGENT_ERROR.NOT_FOUND, `subagent not found: ${id}`)
    // 跨 task 禁止窥探
    const rec = c.get(id)
    if (rec && rec.parent_task_id !== ctx.taskId) {
      return errResult(SUBAGENT_ERROR.NOT_FOUND, `subagent not found: ${id}`)
    }
    return jsonResult(out, out.output || JSON.stringify({
      status: out.status,
      resume_allowed: out.resume_allowed,
      subagent_id: out.subagent_id,
    }))
  },
}

export const killSubagentTool: Tool = {
  spec: KILL_SPEC,
  async run(args, ctx): Promise<ToolResult> {
    const c = coord(ctx)
    if (!c) return errResult(SUBAGENT_ERROR.SPAWN_BLOCKED, 'subagent runtime not available')
    const id = String(args.subagent_id ?? '')
    if (!id) return errResult(SUBAGENT_ERROR.NOT_FOUND, 'subagent_id required')
    const rec = c.get(id)
    if (!rec || rec.parent_task_id !== ctx.taskId) {
      return errResult(SUBAGENT_ERROR.NOT_FOUND, `subagent not found: ${id}`)
    }
    c.kill(id, 'kill_subagent')
    const after = c.get(id)
    return jsonResult({
      success: true,
      subagent_id: id,
      status: after?.status ?? 'aborted',
    })
  },
}

export const waitSubagentsTool: Tool = {
  spec: WAIT_SPEC,
  async run(args, ctx): Promise<ToolResult> {
    const c = coord(ctx)
    if (!c) return errResult(SUBAGENT_ERROR.SPAWN_BLOCKED, 'subagent runtime not available')
    const raw = args.subagent_ids
    const ids = Array.isArray(raw)
      ? raw.map((x) => String(x)).filter(Boolean)
      : typeof raw === 'string' && raw
        ? [raw]
        : []
    if (!ids.length) return errResult(SUBAGENT_ERROR.NOT_FOUND, 'subagent_ids required')

    for (const id of ids) {
      const rec = c.get(id)
      if (!rec || rec.parent_task_id !== ctx.taskId) {
        return errResult(SUBAGENT_ERROR.NOT_FOUND, `subagent not found: ${id}`)
      }
    }

    const timeoutMs =
      typeof args.timeout_ms === 'number' && args.timeout_ms > 0
        ? args.timeout_ms
        : c.config.foreground_budget_ms
    const demoteOnTimeout = parseBool(args.demote_on_timeout, false)

    const wr = await c.wait(ids, { timeoutMs, demoteOnTimeout })
    return jsonResult({
      success: true,
      outcome: wr.outcome,
      pending_ids: wr.pending_ids,
      results: wr.results.map((r) => ({
        subagent_id: r.subagent_id,
        status: r.status,
        output: r.output,
        resume_allowed: r.resume_allowed,
        usage: r.usage,
      })),
    })
  },
}

export function createSubagentTools(): Tool[] {
  return [spawnSubagentTool, getSubagentOutputTool, killSubagentTool, waitSubagentsTool]
}
