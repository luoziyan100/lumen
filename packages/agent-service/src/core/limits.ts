/**
 * [OUTPUT]: Limits —— 步数 / 递归深度 / 墙钟边界（token 预算后续接入）
 * [POS]: agent-core 的预算原语；防止失控循环、无限递归与永远 running 的长跑
 */
export interface Limits {
  maxSteps: number
  maxDepth: number
  /** 墙钟上限（秒），超过则 exhausted；不填不限 */
  maxSeconds?: number
}

export const DEFAULT_LIMITS: Limits = {
  maxSteps: 30,
  maxDepth: 3,
}
