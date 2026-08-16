/**
 * [INPUT]: 脏 mermaid 源 + 前端 parse 错误摘要; ModelPort
 * [OUTPUT]: extractMermaidBody / hashMermaidSource / buildRepairMessages /
 *           MermaidRepairGate / isLlmRepairEnabled —— Phase B sidecar 纯核
 * [POS]: 不进主研究循环、不改 task_events。官方 parse 仍在前端同源 mermaid。
 *        合同: doc/mermaid-pipeline.md §3.5 / §4.3
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md 与 mermaid-pipeline.md
 */
import type { Message } from '../core/types.ts'

export const REPAIR_TIMEOUT_MS = 45_000

export const REPAIR_SYSTEM = [
  '你只修正 Mermaid 语法，保持节点关系与图意。',
  '不要重写围栏外的研究结论或整篇回复。',
  '只输出一个 ```mermaid 代码块，不要前言后语。',
].join('\n')

const KIND_HEAD =
  /^(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|stateDiagram(?:-v2)?|pie|gantt|xychart(?:-beta)?)\b/im

export function isLlmRepairEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LUMEN_MERMAID_LLM_REPAIR !== '0'
}

/** 与 UI hashSource 同构的 FNV-1a 32-bit,限次键用 */
export function hashMermaidSource(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/** 只抽第一个 mermaid 围栏;无围栏则认 kind 行开头的整段 */
export function extractMermaidBody(text: string): string | null {
  const raw = text.replace(/\r\n/g, '\n').trim()
  if (!raw) return null
  const fenced = raw.match(/```mermaid[^\n]*\n([\s\S]*?)```/i)
  if (fenced?.[1] != null) {
    const body = fenced[1].trim()
    return body || null
  }
  if (KIND_HEAD.test(raw)) return raw
  return null
}

export function buildRepairMessages(source: string, error: string): Message[] {
  return [
    { role: 'system', content: REPAIR_SYSTEM },
    {
      role: 'user',
      content:
        `解析错误:\n${error.trim() || '（无摘要）'}\n\n源码:\n\`\`\`mermaid\n${source.trim()}\n\`\`\``,
    },
  ]
}

/** 同 task + 同原文 hash 只允许一次模型调用(成功失败都占额度) */
export class MermaidRepairGate {
  private readonly attempted = new Set<string>()

  key(taskId: string, source: string): string {
    return `${taskId}:${hashMermaidSource(source)}`
  }

  /** @returns true=可以打模型(已占坑); false=已用过 */
  consume(taskId: string, source: string): boolean {
    const k = this.key(taskId, source)
    if (this.attempted.has(k)) return false
    this.attempted.add(k)
    return true
  }
}

export const mermaidRepairMetrics = {
  attempt: 0,
  ok: 0,
  bump(key: 'attempt' | 'ok', n = 1): void {
    this[key] += n
  },
  reset(): void {
    this.attempt = 0
    this.ok = 0
  },
}
