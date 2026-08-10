/**
 * [INPUT]: coordinator + resolution + core/runAgent + worktree
 * [OUTPUT]: ChildRunner —— 登记 spawn、物化 workspace/worktree、跑 runAgent、usage 上报
 * [POS]: subagent T3/T5 L3；与主 runtime 共用内核，独立 turn/session/Abort
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import { Thread } from '../core/thread.ts'
import { runAgent } from '../core/loop.ts'
import { createSpawnFn, type RoleDef } from '../core/spawn.ts'
import type { ModelPort } from '../core/model-port.ts'
import type { Limits } from '../core/limits.ts'
import type { AgentEvent } from '../core/types.ts'
import type { Tool, ToolContext, Workspace } from '../core/tool.ts'
import { FsWorkspace } from '../workspace/fs-workspace.ts'
import type { TaskEvent } from '../storage/task-store.ts'
import type { SubagentCoordinator } from './coordinator.ts'
import {
  buildChildTools,
  resolveAgentDefinition,
  type AgentDefinition,
} from './resolution.ts'
import type { DiscoveredAgent } from './discovery.ts'
import { resolveFromRegistry } from './registry.ts'
import { isWriteCapableToolset } from './tool-kind.ts'
import { rebuildChildThread } from './child-resume.ts'
import {
  expandUserPath,
  materializeWorktree,
  resolveGitRoot as findGitRoot,
} from './worktree.ts'
import type {
  CapabilityMode,
  IsolationMode,
  SpawnImmediateResult,
  SubagentStatus,
} from './types.ts'
import { DEFAULT_SUBAGENT_CONFIG, SUBAGENT_ERROR } from './types.ts'

export interface ChildRunnerDeps {
  coordinator: SubagentCoordinator
  model: ModelPort
  /** 父侧全量工具宇宙，经 buildChildTools 裁剪 */
  allTools: Tool[]
  /**
   * 物化 child workspace（isolation=none）。
   * parentTaskId = 用户 task；cwdRoot = 虚拟条带（如 workers/<id>/），null = 与 task 同根。
   */
  makeWorkspace: (parentTaskId: string, cwdRoot: string | null) => Workspace | Promise<Workspace>
  /** 事件桥：写入 parent task 事件流（agentRole = subagent_type） */
  emit: (parentTaskId: string, event: AgentEvent) => void | Promise<void>
  /** resume 重建线程：读 parent task 事件 */
  listEvents?: (parentTaskId: string) => TaskEvent[]
  /** 嵌套 spawn 用（allowNested 时）；默认空 */
  roles?: Record<string, RoleDef>
  maxDepth?: number
  /** parent capability 天花板 */
  parentCapability?: CapabilityMode
  /**
   * isolation=worktree 时解析 git 仓库根。
   * 返回 null → spawn 显式失败（禁止 fallback none）。
   */
  resolveGitRoot?: (parentTaskId: string) => string | null | Promise<string | null>
  /** worktree 父目录；默认 config.worktree_root */
  worktreeRoot?: string
  /** T8：合并后的 agent registry；缺省仅 builtin */
  agentRegistry?: Map<string, DiscoveredAgent>
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
  /** T6：从已有子 session 续跑 */
  resume_from?: string
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
    let def: AgentDefinition | null = input.definition ?? null
    if (!def) {
      if (this.deps.agentRegistry) {
        // 有 registry 时禁止回落 builtin：disabled 必须硬拒绝
        def = resolveFromRegistry(this.deps.agentRegistry, input.subagent_type)
      } else {
        def = resolveAgentDefinition(input.subagent_type)
      }
    }
    if (!def) {
      return {
        success: false,
        error_code: SUBAGENT_ERROR.TYPE_UNKNOWN,
        error: `unknown or disabled subagent_type "${input.subagent_type}"`,
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

    const isResume = Boolean(input.resume_from)
    let priorSummary: string | null = null
    let originalPrompt: string | null = null

    let reg
    if (isResume) {
      const src = this.deps.coordinator.get(input.resume_from!)
      priorSummary = src?.completion_summary ?? src?.last_error ?? null
      reg = this.deps.coordinator.prepareResume({
        resume_from: input.resume_from!,
        parent_task_id: input.parent_task_id,
        parent_turn_id: input.parent_turn_id,
        subagent_type: def.name,
      })
    } else {
      const isolation: IsolationMode = input.isolation ?? def.isolationDefault
      reg = this.deps.coordinator.registerSpawn({
        parent_task_id: input.parent_task_id,
        parent_turn_id: input.parent_turn_id,
        parent_subagent_id: input.parent_subagent_id ?? null,
        subagent_type: def.name,
        description: input.description,
        depth: input.depth ?? 1,
        isolation,
        model_cwd: input.model_cwd,
        write_capable: writeCapable,
        surface_completion: true,
      })
    }
    if (!reg.ok || !reg.record) {
      return {
        success: false,
        error_code: reg.error_code,
        error: reg.error,
      }
    }

    const rec = reg.record
    originalPrompt = input.scope
      ? `Scope: ${input.scope}\n\n${input.prompt}`
      : input.prompt

    // T5: 新 spawn 的 worktree 物化；resume 继承路径，缺失则显式失败
    if (rec.isolation === 'worktree') {
      if (isResume) {
        if (!rec.worktree_path || !existsSync(rec.worktree_path)) {
          this.deps.coordinator.complete(rec.id, 'failed', {
            last_error: 'worktree path missing on resume (refusing fallback to none)',
            completion_summary: 'worktree path missing on resume',
          })
          return {
            success: false,
            error_code: SUBAGENT_ERROR.WORKTREE_FAILED,
            error: 'worktree path missing on resume (refusing fallback to none)',
          }
        }
      } else {
        const wt = await this.materializeForChild(rec.id, input.parent_task_id)
        if (!wt.ok) {
          this.deps.coordinator.complete(rec.id, 'failed', {
            last_error: wt.error,
            completion_summary: wt.error,
          })
          return {
            success: false,
            error_code: wt.error_code,
            error: wt.error,
          }
        }
      }
    }

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
      resume: isResume
        ? {
          resumePrompt: originalPrompt,
          priorSummary,
          // 历史锚：priorSummary 或事件回放；不重复塞同一 resume 正文
          originalPrompt: null,
        }
        : null,
    })
    this.inflight.set(rec.id, done)
    void done.finally(() => this.inflight.delete(rec.id))

    const immediate = this.deps.coordinator.toImmediateResult(running)
    return {
      ...immediate,
      handle: { subagent_id: rec.id, done },
    }
  }

  private async materializeForChild(
    subagentId: string,
    parentTaskId: string,
  ): Promise<{ ok: true; path: string } | { ok: false; error_code: string; error: string }> {
    let gitRoot: string | null = null
    if (this.deps.resolveGitRoot) {
      gitRoot = await this.deps.resolveGitRoot(parentTaskId)
    }
    if (gitRoot) gitRoot = findGitRoot(gitRoot) ?? gitRoot
    if (!gitRoot || !findGitRoot(gitRoot)) {
      return {
        ok: false,
        error_code: SUBAGENT_ERROR.WORKTREE_FAILED,
        error: 'no git repository for worktree isolation (refusing fallback to none)',
      }
    }

    const rootBase = expandUserPath(
      this.deps.worktreeRoot
        ?? this.deps.coordinator.config.worktree_root
        ?? DEFAULT_SUBAGENT_CONFIG.worktree_root,
    )
    const worktreePath = path.join(rootBase, subagentId)
    const result = materializeWorktree({ repoRoot: gitRoot, worktreePath })
    if (!result.ok) {
      return { ok: false, error_code: result.error_code, error: result.error }
    }

    // 落盘 worktree_path；cwd_root 对 worktree 无意义（根即 worktree）
    this.deps.coordinator.setWorkspacePaths(subagentId, {
      worktree_path: result.path,
      cwd_root: null,
      snapshot_ref: result.ref,
    })
    return { ok: true, path: result.path }
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
    resume: null | {
      resumePrompt: string
      priorSummary: string | null
      originalPrompt: string | null
    }
  }): Promise<void> {
    const { id, def, tools, prompt, scope, model, signal, depth, resume } = args
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
      // worktree：Workspace 根 = 物化目录；none：会话根或 workers 条带
      const fresh = this.deps.coordinator.get(id) ?? rec
      let workspace: Workspace
      if (fresh.isolation === 'worktree' && fresh.worktree_path) {
        workspace = new FsWorkspace({ root: fresh.worktree_path })
      } else {
        workspace = await this.deps.makeWorkspace(fresh.parent_task_id, fresh.cwd_root)
      }
      const maxDepth = this.deps.maxDepth ?? this.deps.coordinator.config.max_depth
      const spawn = createSpawnFn({
        model,
        roles: this.deps.roles ?? {},
        maxDepth,
      })
      const childTurnId = fresh.active_turn_id ?? `turn-${globalThis.crypto.randomUUID()}`
      const ctx: ToolContext = {
        taskId: fresh.parent_task_id,
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

      let thread: Thread
      if (resume) {
        const events = this.deps.listEvents?.(fresh.parent_task_id) ?? []
        thread = rebuildChildThread(events, {
          systemPrompt: def.systemPrompt,
          subagentId: id,
          originalPrompt: resume.originalPrompt,
          resumePrompt: resume.resumePrompt,
          priorSummary: resume.priorSummary,
        })
      } else {
        const body = scope ? `Scope: ${scope}\n\n${prompt}` : prompt
        thread = new Thread([
          { role: 'system', content: def.systemPrompt },
          { role: 'user', content: body },
        ])
      }

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
        cwd_root: fresh.cwd_root,
        worktree_path: fresh.worktree_path,
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
