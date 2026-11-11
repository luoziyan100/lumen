/**
 * [INPUT]: 会话作用域(projectId:taskId)与失败图原文
 * [OUTPUT]: mermaidFixAsked / markMermaidFixAsked —— 「请模型修正」按会话 × 图原文去重
 * [POS]: MermaidBlock 修正请求的去重真源；组件 state 挡不住同一张坏图在会话里出现两次或重挂载，
 *        所以记录放在模块级、随应用进程存活，不落库
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const asked = new Map<string, Set<string>>()

/** 这张图在该会话里是否已请求过修正 */
export function mermaidFixAsked(scope: string, source: string): boolean {
  return asked.get(scope)?.has(source.trim()) ?? false
}

/** 记一次请求；已请求过返回 false，调用方据此不再发送 */
export function markMermaidFixAsked(scope: string, source: string): boolean {
  const key = source.trim()
  let sources = asked.get(scope)
  if (!sources) asked.set(scope, (sources = new Set()))
  if (sources.has(key)) return false
  sources.add(key)
  return true
}
