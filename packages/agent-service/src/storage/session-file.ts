/**
 * [INPUT]: node:fs
 * [OUTPUT]: SessionEntry / appendSessionEntry / readSession / sessionPath
 * [POS]: §存储层。LLM 视角的 append-only JSONL trace（Claude Code 风格），inspect 入口
 *
 * 与 task_events 双轨：task_events 是状态机 SoT；这里是给人读的 LLM 视角对话。
 */
import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import * as path from 'node:path'

export type SessionEntry =
  | { type: 'session_start'; task_id: string; timestamp: string; user_text: string; project_id: string }
  | { type: 'user'; task_id: string; timestamp: string; content: string }
  | { type: 'assistant'; task_id: string; timestamp: string; content: string; tool_calls?: unknown[]; agent?: string }
  | { type: 'tool_result'; task_id: string; timestamp: string; tool_call_id: string; tool: string; content: string; agent?: string }
  | { type: 'error'; task_id: string; timestamp: string; error: string }
  | { type: 'session_end'; task_id: string; timestamp: string; status: string; duration_ms: number }

export function sessionPath(dir: string, taskId: string): string {
  return path.join(dir, `${taskId}.jsonl`)
}

export function appendSessionEntry(dir: string, entry: SessionEntry): void {
  mkdirSync(dir, { recursive: true })
  appendFileSync(sessionPath(dir, entry.task_id), JSON.stringify(entry) + '\n', 'utf8')
}

export function readSession(dir: string, taskId: string): SessionEntry[] {
  const file = sessionPath(dir, taskId)
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as SessionEntry)
}
