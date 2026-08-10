/**
 * [INPUT]: coordinator + resolution + core/runAgent
 * [OUTPUT]: ChildRunner —— 登记 spawn、物化 workspace、跑 runAgent、usage 上报 complete
 * [POS]: subagent T3 L3；与主 runtime 共用内核，独立 turn/session/Abort
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { Thread } from '../core/thread.ts'
import { runAgent } from '../core/loop.ts'
import { createSpawnFn, type RoleDef } from '../core/spawn.ts'
import type { ModelPort } from '../core/model-port.ts'
import type { Limits } from '../core/limits.ts'
import type { AgentEvent } from '../core/types.ts'
import type { Tool, ToolContext, Workspace } from '../core/tool.ts'
import type { SubagentCoordinator } from './coordinator.ts'
import {
  buildChildTools,
  resolveAgentDefinition,
  type AgentDefinition,
} from './resolution.ts'
import { isWriteCapableToolset } from './tool-kind.ts'
import type {
  CapabilityMode,
  IsolationMode,
  SpawnImmediateResult,
  SubagentStatus,
} from './types.ts'
import { SUBAGENT_ERROR } from './types.ts'

export interface ChildRunnerDeps {
  coordinator: SubagentCoordinator
  model: ModelPort
  /** 父侧全量工具宇宙，经 buildChildTools 裁剪 */
  allTools: Tool[]
  /**
   * 物化 child workspace。
   * parentTaskId = 用户 task；cwdRoot = 虚拟条带（如 workers/<id>/），null = 与 task 同根。
   */
  makeWorkspace: (parentTaskId: string, cwdRoot: string | null) => Workspace | Promise<Workspace>
  /** 事件桥：写入 parent task 事件流（agentRole = subagent_type） */
  emit: (parentTaskId: string, event: AgentEvent) => void | Promise<void>
  /** 嵌套 spawn 用（allowNested 时）；默认空 */
  roles?: Record<string, RoleDef>
  maxDepth?: number
  /** parent capability 天花板 */
  parentCapability?: CapabilityMode
}

export interface StartChildInput {
  parent_task_id: string
  parent_turn_id: string
  parent_subagent_id?: string | null
  subagent_type: string
  description: string
  /** 用户/父 agent 下发的任务正文 */
  prompt: string
  scope?: string
  background?: boolean
  capability?: CapabilityMode | null
  isolation?: IsolationMode
  model_cwd?: string | null
  depth?: number
  /** 覆盖 definition 解析（测试/自定义） */
  definition?: AgentDefinition
  model?: ModelPort
}

export interface ChildRunHandle {
  subagent_id: string
  /** 后台跑完后的 promise；bg 时不等待也可 */
  done: Promise<void>
}

function mapRunStatus(status: string): Extract<SubagentStatus, 'done' | 'aborted' | 'exhausted' | 'error'> {
  if (status === 'done') return 'done'
  if (status === 'aborted') return 'aborted'
  if (status === 'exhausted') return 'exhausted'
  return 'error'
}

export class ChildRunner {
  private readonly deps: ChildRunnerDeps
  private readonly inflight = new Map<string, Promise<void>>()

  constructor(deps: ChildRunnerDeps) {
    this.deps = deps
  }

  /** 是否仍有 live 子任务 */
  hasInflight(id: string): boolean {
    return this.inflight.has(id)
  }

  /**
   * 登记 + 启动 child。
   * background=true（默认）：立即返回 queued/running；done promise 后台收尾。
   * background=false：仍立即返回 id，调用方可 wait(id) 阻塞至终态或 demote。
   */
  async start(input: StartChildInput): Promise<SpawnImmediateResult & { handle?: ChildRunHandle }> {
    const def = input.definition ?? resolveAgentDefinition(input.subagent_type)
    if (!def) {
      return {
        success: false,
        error_code: SUBAGENT_ERROR.TYPE_UNKNOWN,
        error: `unknown subagent_type "${input.subagent_type}"`,
      }
    }

    const { tools, effectiveCapability } = buildChildTools(
      this.deps.allTools,
      def,
      input.capability ?? null,
      this.deps.parentCapability ?? 'all',
    )
    const writeCapable = isWriteCapableToolset(tools)
    void effectiveCapability

    const reg = this.deps.coordinator.registerSpawn({
      parent_task_id: input.parent_task_id,
      parent_turn_id: input.parent_turn_id,
      parent_subagent_id: input.parent_subagent_id ?? null,
      subagent_type: def.name,
      description: input.description,
      depth: input.depth ?? 1,
      isolation: input.isolation ?? def.isolationDefault,
      model_cwd: input.model_cwd,
      write_capable: writeCapable,
      surface_completion: true,
    })
    if (!reg.ok || !reg.record) {
      return {
        success: false,
        error_code: reg.error_code,
        error: reg.error,
      }
    }

    const rec = reg.record
    const running = this.deps.coordinator.markRunning(rec.id)
    if (!running) {
      return {
        success: false,
        error_code: SUBAGENT_ERROR.SPAWN_BLOCKED,
        error: 'failed to mark running',
      }
    }

    const controller = new AbortController()
    this.deps.coordinator.attachLive(rec.id, controller)

    const bg = input.background !== false
    if (!bg) {
      this.deps.coordinator.armForegroundBudget(rec.id)
    }

    const done = this.runLoop({
      id: rec.id,
      def,
      tools,
      prompt: input.prompt,
      scope: input.scope,
      model: input.model ?? this.deps.model,
      signal: controller.signal,
      depth: input.depth ?? 1,
    })
    this.inflight.set(rec.id, done)
    void done.finally(() => this.inflight.delete(rec.id))

    const immediate = this.deps.coordinator.toImmediateResult(running)
    return {
      ...immediate,
      handle: { subagent_id: rec.id, done },
    }
  }

  private async runLoop(args: {
    id: string
    def: AgentDefinition
    tools: Tool[]
    prompt: string
    scope?: string
    model: ModelPort
    signal: AbortSignal
    depth: number
  }): Promise<void> {
    const { id, def, tools, prompt, scope, model, signal, depth } = args
    const rec = this.deps.coordinator.get(id)
    if (!rec) return

    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    let toolCalls = 0
    let turns = 0

    const emit = async (event: AgentEvent): Promise<void> => {
      // 累计 usage / tool_calls
      if (event.kind === 'model_step') {
        turns += 1
        const u = (event.payload as { usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number; prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } })?.usage
        if (u) {
          const pt = u.prompt_tokens ?? u.promptTokens ?? 0
          const ct = u.completion_tokens ?? u.completionTokens ?? 0
          const tt = u.total_tokens ?? u.totalTokens ?? pt + ct
          usage = {
            prompt_tokens: usage.prompt_tokens + pt,
            completion_tokens: usage.completion_tokens + ct,
            total_tokens: usage.total_tokens + tt,
          }
        }
        const tcs = (event.payload as { toolCalls?: unknown[] })?.toolCalls
        if (Array.isArray(tcs)) toolCalls += tcs.length
      }
      if (event.kind === 'tool_call') toolCalls += 1
      await this.deps.emit(rec.parent_task_id, {
        ...event,
        agentRole: def.name,
        payload: {
          ...(typeof event.payload === 'object' && event.payload ? event.payload : {}),
          subagent_id: id,
        },
      })
    }

    try {
      const workspace = await this.deps.makeWorkspace(rec.parent_task_id, rec.cwd_root)
      const maxDepth = this.deps.maxDepth ?? this.deps.coordinator.config.max_depth
      const spawn = createSpawnFn({
        model,
        roles: this.deps.roles ?? {},
        maxDepth,
      })
      const childTurnId = rec.active_turn_id ?? `turn-${globalThis.crypto.randomUUID()}`
      const ctx: ToolContext = {
        taskId: rec.parent_task_id,
        sessionId: id,
        turnId: childTurnId,
        agentRole: def.name,
        depth,
        spawn,
        emit,
        workspace,
        deps: {
          model,
          subagents: this.deps.coordinator,
          childRunner: this,
        },
      }
      const limits: Limits = {
        maxSteps: def.maxSteps,
        maxDepth,
      }
      const body = scope
        ? `Scope: ${scope}\n\n${prompt}`
        : prompt
      const thread = new Thread([
        { role: 'system', content: def.systemPrompt },
        { role: 'user', content: body },
      ])

      const result = await runAgent({
        thread,
        model,
        tools,
        limits,
        ctx,
        signal,
      })

      const status = mapRunStatus(result.status)
      this.deps.coordinator.complete(id, status, {
        completion_summary: result.reply || (status === 'exhausted' ? 'budget exhausted' : status),
        last_error: status === 'error' ? result.reply : status === 'aborted' ? 'aborted' : null,
        tool_calls: toolCalls,
        turns,
        usage,
        cwd_root: rec.cwd_root,
        worktree_path: rec.worktree_path,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (signal.aborted) {
        this.deps.coordinator.complete(id, 'aborted', {
          completion_summary: 'aborted',
          last_error: message,
          tool_calls: toolCalls,
          turns,
          usage,
        })
      } else {
        this.deps.coordinator.complete(id, 'error', {
          completion_summary: message,
          last_error: message,
          tool_calls: toolCalls,
          turns,
          usage,
        })
      }
    }
  }
}
