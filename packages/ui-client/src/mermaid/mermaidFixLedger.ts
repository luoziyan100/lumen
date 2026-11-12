/**
 * [INPUT]: 会话作用域(topicId:taskId)与失败图原文
 * [OUTPUT]: MermaidFix 通道类型；mermaidFixAsked / markMermaidFixAsked / subscribeMermaidFix —— 「请模型修正」按会话 × 图原文去重
 * [POS]: MermaidBlock 修正请求的去重真源；组件 state 挡不住同一张坏图在会话里出现两次或重挂载，
 *        所以记录放在模块级、随应用进程存活，不落库。可订阅：一处请求后同图各处立即显示已请求。
 *        只保留最近 32 个会话的记录(写入时更新顺序，读取不改顺序，保证渲染期纯读)
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

/** 失败图修正通道：asked 查询该图是否已请求，ask 发送(由提供方去重)，subscribe 在记录变化时通知 */
export type MermaidFix = {
  asked: (source: string) => boolean
  ask: (source: string, error: string) => void
  subscribe: (onChange: () => void) => () => void
}

const SCOPE_LIMIT = 32
const asked = new Map<string, Set<string>>()
const listeners = new Set<() => void>()

export function subscribeMermaidFix(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => { listeners.delete(onChange) }
}

/** 这张图在该会话里是否已请求过修正(纯读，可在渲染期调用) */
export function mermaidFixAsked(scope: string, source: string): boolean {
  return asked.get(scope)?.has(source.trim()) ?? false
}

/** 记一次请求；已请求过返回 false，调用方据此不再发送 */
export function markMermaidFixAsked(scope: string, source: string): boolean {
  const key = source.trim()
  const sources = asked.get(scope) ?? new Set<string>()
  if (sources.has(key)) return false
  sources.add(key)
  asked.delete(scope)
  asked.set(scope, sources)
  while (asked.size > SCOPE_LIMIT) asked.delete(asked.keys().next().value!)
  for (const listener of listeners) listener()
  return true
}
