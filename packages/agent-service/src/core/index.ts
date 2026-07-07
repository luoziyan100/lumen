/**
 * [OUTPUT]: agent-core 公共出口
 * [POS]: 内核对外的唯一入口（M0）
 */
export * from './types.ts'
export { Thread, type ForModelOptions } from './thread.ts'
export type { ModelPort, ModelResponse } from './model-port.ts'
export type {
  Tool,
  ToolContext,
  ToolResult,
  SpawnFn,
  SpawnInput,
  Workspace,
  DirEntry,
  GrepHit,
} from './tool.ts'
export { type Limits, DEFAULT_LIMITS } from './limits.ts'
export { runAgent, type RunAgentInput, type RunAgentResult, type RunStatus } from './loop.ts'
export { createSpawnFn, spawnTool, type RoleDef, type SpawnRuntime } from './spawn.ts'
export { withGuard, DEFAULT_TOOL_TIMEOUT_MS, type GuardOptions, type ToolTelemetry } from './guard.ts'
