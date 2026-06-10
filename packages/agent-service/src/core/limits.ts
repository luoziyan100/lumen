/**
 * [OUTPUT]: Limits —— 步数 / 递归深度边界（token、墙钟后续接入）
 * [POS]: agent-core 的预算原语；防止失控循环与无限递归
 */
export interface Limits {
  maxSteps: number
  maxDepth: number
}

export const DEFAULT_LIMITS: Limits = {
  maxSteps: 30,
  maxDepth: 3,
}
