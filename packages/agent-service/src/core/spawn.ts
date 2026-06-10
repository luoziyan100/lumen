/**
 * [INPUT]: loop.ts 的 runAgent、Thread、ModelPort、Tool/ToolContext、Limits
 * [OUTPUT]: createSpawnFn（递归原语）+ spawnTool（暴露给主 agent 的工具）
 * [POS]: agent-core 的 sub-agent 机制。worker = runAgent 的递归调用——同一个内核，两处复用
 *
 * 父 agent 只拿到 worker 的压缩返回，看不到 worker 线程（真正的上下文隔离）。
 * worker 内部跑的是同一个正确循环，因此 tool_result 回灌的铁律在子层自动成立。
 */
import { Thread } from './thread.ts'
import { runAgent } from './loop.ts'
import type { ModelPort } from './model-port.ts'
import type { Limits } from './limits.ts'
import type { SpawnFn, Tool, ToolContext } from './tool.ts'

export interface RoleDef {
  systemPrompt: string
  tools: Tool[]
  limits: Limits
  /** 不填则用 runtime.model */
  model?: ModelPort
}

export interface SpawnRuntime {
  model: ModelPort
  roles: Record<string, RoleDef>
  maxDepth?: number
  /** 把 worker 的 final reply 压缩成父 agent 可见的返回；不填则原样 */
  compact?: (reply: string) => string
}

const SPAWN_SPEC = {
  name: 'spawn',
  description: 'Spawn 一个 worker 完成具体任务。Worker 看不到主对话，scope 和 prompt 必须自完整。',
  parameters: {
    type: 'object',
    properties: {
      role: { type: 'string' },
      scope: { type: 'string' },
      prompt: { type: 'string' },
    },
    required: ['role', 'scope', 'prompt'],
  },
}

export function createSpawnFn(runtime: SpawnRuntime): SpawnFn {
  const maxDepth = runtime.maxDepth ?? 3
  const compact = runtime.compact ?? ((reply: string) => reply)

  const spawn: SpawnFn = async (childInput, callerCtx, signal) => {
    const role = runtime.roles[childInput.role]
    if (!role) return { llmContent: `error: unknown role "${childInput.role}"` }
    if (callerCtx.depth + 1 > maxDepth) {
      return { llmContent: `error: spawn rejected, max recursion depth ${maxDepth} reached` }
    }

    const childThread = new Thread([
      { role: 'system', content: role.systemPrompt },
      { role: 'user', content: `Scope: ${childInput.scope}\n\n${childInput.prompt}` },
    ])
    const childCtx: ToolContext = {
      ...callerCtx,
      agentRole: childInput.role,
      depth: callerCtx.depth + 1,
      // spawn 不变，递归复用同一函数
    }

    const result = await runAgent({
      thread: childThread,
      model: role.model ?? runtime.model,
      tools: role.tools,
      limits: role.limits,
      ctx: childCtx,
      signal,
    })

    await callerCtx.emit({
      kind: 'spawn',
      agentRole: callerCtx.agentRole,
      payload: { role: childInput.role, status: result.status },
    })
    return { llmContent: compact(result.reply), data: { status: result.status, workerThread: result.thread } }
  }

  return spawn
}

export const spawnTool: Tool = {
  spec: SPAWN_SPEC,
  run: (args, ctx, signal) =>
    ctx.spawn(
      { role: String(args.role), scope: String(args.scope ?? ''), prompt: String(args.prompt ?? '') },
      ctx,
      signal,
    ),
}
