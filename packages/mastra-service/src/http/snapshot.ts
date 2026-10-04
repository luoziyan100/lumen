/**
 * [INPUT]: 原生 Controller DisplayState、WireDisplayState 及专家累计用量派生值
 * [OUTPUT]: displaySnapshot：官方 SSE 形状加独立 childTokenUsage，不改变原生主统计
 * [POS]: UI 初次连接与断线恢复边界；不自行维护状态或回放事件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { AgentControllerDisplayState, WireDisplayState, TokenUsage } from '@mastra/core/agent-controller'

export function displaySnapshot(state: Readonly<AgentControllerDisplayState>, childTokenUsage: TokenUsage | null = null): WireDisplayState & { childTokenUsage: TokenUsage | null } {
  const snapshot = structuredClone(state)
  return {
    ...snapshot,
    childTokenUsage,
    activeTools: Object.fromEntries(snapshot.activeTools),
    toolInputBuffers: Object.fromEntries(snapshot.toolInputBuffers),
    pendingSuspensions: Object.fromEntries(snapshot.pendingSuspensions),
    activeSubagents: Object.fromEntries(snapshot.activeSubagents),
    modifiedFiles: Object.fromEntries(snapshot.modifiedFiles),
  }
}
