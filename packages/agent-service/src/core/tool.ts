/**
 * [INPUT]: types.ts 的 AgentEvent / ToolSpec
 * [OUTPUT]: Tool 契约 + ToolContext + SpawnFn
 * [POS]: agent-core 的工具边界；工具执行结果 llmContent 必由内核回灌进线程
 */
import type { AgentEvent, ToolSpec } from './types.ts'

export interface ToolResult {
  /** 回灌进线程的内容（铁律）。错误也走这里——交给模型下一轮自行恢复 */
  llmContent: string
  /** 给观测 / 上层用，不进线程 */
  data?: unknown
}

export interface SpawnInput {
  role: string
  scope: string
  prompt: string
}

export type SpawnFn = (
  input: SpawnInput,
  callerCtx: ToolContext,
  signal?: AbortSignal,
) => Promise<ToolResult>

// ---- Workspace 端口：内核只认接口，具体 FsWorkspace 实现在 workspace 包 ----
export interface DirEntry {
  name: string
  type: 'file' | 'dir'
}

export interface GrepHit {
  path: string
  line: number
  text: string
  /** 命中处在文件中的字符偏移；PDF 等少换行文本里 line 无意义，靠它配合 read_file 的 offset 跟进 */
  charOffset?: number
}

export interface Workspace {
  readFile(path: string): Promise<string>
  readBytes(path: string): Promise<Uint8Array>
  writeFile(path: string, content: string): Promise<void>
  writeBytes(path: string, bytes: Uint8Array): Promise<void>
  editFile(path: string, oldString: string, newString: string): Promise<void>
  listDir(path?: string): Promise<DirEntry[]>
  grep(pattern: string, options?: { path?: string; flags?: string }): Promise<GrepHit[]>
  glob(pattern: string): Promise<string[]>
  /** 解析虚拟路径为宿主绝对路径(过同一套逃逸校验)。需要真实路径的工具(如 run_code 的 cwd/脚本)用;可选实现 */
  resolvePath?(path: string, opts?: { write?: boolean }): Promise<string>
}

export interface ToolContext {
  taskId: string
  agentRole: string
  depth: number
  spawn: SpawnFn
  emit: (event: AgentEvent) => void | Promise<void>
  /** 沙箱工作区句柄。M2 起注入；不依赖它的工具可忽略 */
  workspace?: Workspace
  deps: Record<string, unknown>
}

export interface Tool {
  spec: ToolSpec
  run(
    args: Record<string, unknown>,
    ctx: ToolContext,
    signal?: AbortSignal,
  ): Promise<ToolResult>
}
