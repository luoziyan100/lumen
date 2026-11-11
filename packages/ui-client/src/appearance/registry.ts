/**
 * [INPUT]: skins/ 下的浅色与暗色皮肤定义
 * [OUTPUT]: 十二套内置整窗皮肤的注册表、列表与未知皮肤回退(回退到默认「清透」)
 * [POS]: 外观模块的皮肤汇总入口；配色真源在 skins/，「清透」取值来自 yan-design-system 主题值表
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { SkinDefinition } from './types.ts'
import { SKIN_CLEAR, SKIN_GLACIER, SKIN_PAPER, SKIN_SEA_SALT } from './skins/light.ts'
import { SKIN_CELADON, SKIN_CLAY, SKIN_COSMIC_LATTE, SKIN_MIST, SKIN_PLUM, SKIN_SKY, SKIN_TIDE, SKIN_WINE } from './skins/dark.ts'

export { SKIN_CLEAR, SKIN_GLACIER, SKIN_PAPER, SKIN_SEA_SALT, SKIN_CELADON, SKIN_CLAY, SKIN_COSMIC_LATTE, SKIN_MIST, SKIN_PLUM, SKIN_SKY, SKIN_TIDE, SKIN_WINE }

export const SKIN_DEFAULT = SKIN_CLEAR

const ALL: SkinDefinition[] = [
  SKIN_CLEAR,
  SKIN_GLACIER,
  SKIN_PAPER,
  SKIN_SEA_SALT,
  SKIN_CELADON,
  SKIN_COSMIC_LATTE,
  SKIN_MIST,
  SKIN_SKY,
  SKIN_CLAY,
  SKIN_PLUM,
  SKIN_TIDE,
  SKIN_WINE,
]

export const SKIN_REGISTRY: Record<string, SkinDefinition> = Object.fromEntries(
  ALL.map((s) => [s.id, s]),
)

export function listSkins(): SkinDefinition[] {
  return ALL.slice()
}

export function getSkin(id: string): SkinDefinition {
  return SKIN_REGISTRY[id] ?? SKIN_DEFAULT
}

export function coerceSkinId(id: string | undefined | null): string {
  if (id && SKIN_REGISTRY[id]) return id
  return SKIN_DEFAULT.id
}
