/**
 * [INPUT]: 无(纯函数)
 * [OUTPUT]: VisionMode / resolveVision / VISION_FAMILY_PATTERNS
 * [POS]: 模型视觉能力声明。白名单 fail-closed(与 net-allowlist 同款);未声明 = 走桩
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 档案三态:缺省 auto(读白名单);on/off 为用户覆盖 */
export type VisionMode = 'auto' | 'on' | 'off'

export interface VisionProfile {
  vision?: VisionMode
}

/**
 * 已知视觉家族。未列入 = auto 下走桩。补条目只加这里。
 * 2026-08: DeepSeek 仅 `deepseek-vl*` / `*vision*`;flash/pro/chat 纯文本。
 */
export const VISION_FAMILY_PATTERNS: readonly RegExp[] = [
  /^gpt-4o/i,
  /^gpt-5/i,
  /claude-3(?:[.-]5|[.-]7)/i,
  /claude-(?:sonnet|opus|haiku)-[4-9]/i,
  /gemini/i,
  /qwen[-./]?\d*-?vl/i,
  /deepseek-vl/i,
  /deepseek[-.\w]*vision/i,
]

/** 模型名是否命中已知视觉家族(auto 启发式) */
export function inferVisionFromModelId(modelId: string): boolean {
  const id = modelId.trim()
  if (!id) return false
  for (const re of VISION_FAMILY_PATTERNS) {
    if (re.test(id)) return true
  }
  return false
}

/** on→true;off→false;auto→白名单命中才 true */
export function resolveVision(profile: VisionProfile, modelId: string): boolean {
  const mode = profile.vision ?? 'auto'
  if (mode === 'on') return true
  if (mode === 'off') return false
  return inferVisionFromModelId(modelId)
}
