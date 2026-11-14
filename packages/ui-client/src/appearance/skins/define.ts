/**
 * [INPUT]: 皮肤原语白名单/别名与 yan-design-system 主题值表
 * [OUTPUT]: t(本地补丁类型收窄)、fromDesignSystem(设计系统主题 → 皮肤补丁)
 * [POS]: 皮肤定义的共用构造；具体皮肤在 light.ts / dark.ts
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { THEMES } from 'yan-design-system/themes'
import { APPEARANCE_TOKEN_SET, TOKEN_ALIASES, type AppearanceTokenName, type SkinDefinition } from '../types.ts'

export function t(partial: Partial<Record<AppearanceTokenName, string>>): SkinDefinition['tokens'] {
  return partial
}

/** 设计系统主题 → 皮肤补丁：只取白名单原语，别名留给解析器保持 var() 级联 */
export function fromDesignSystem(name: string, extra: Partial<Record<AppearanceTokenName, string>>): SkinDefinition['tokens'] {
  const theme = THEMES[name]
  if (!theme) throw new Error(`yan-design-system has no theme ${name}`)
  const out: Partial<Record<AppearanceTokenName, string>> = {}
  for (const [key, value] of Object.entries(theme)) {
    if (APPEARANCE_TOKEN_SET.has(key) && !TOKEN_ALIASES[key]) out[key as AppearanceTokenName] = value
  }
  return { ...out, ...extra }
}
