/**
 * [INPUT]: 无
 * [OUTPUT]: parseSlashFilter / slashMenuBox —— `/token` 解析 + 斜杠浮层视口盒
 * [POS]: Skills 斜杠入口的纯函数;UI 组件与单测共用
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 从 composer 文本解析斜杠 token;`/foo` → foo;`/` → '';非整段斜杠 → null */
export function parseSlashFilter(input: string): string | null {
  const m = input.match(/^\/([^\s]*)$/)
  if (!m) return null
  return m[1] ?? ''
}

/** 斜杠菜单相对输入卡的视口盒(portal 到 body,避开 BorderBeam overflow:hidden) */
export type SlashMenuBox = { left: number; width: number; bottom: number }

export function slashMenuBox(
  rect: { left: number; top: number; width: number },
  viewportHeight: number,
  inset = 12,
  gap = 8,
): SlashMenuBox {
  return {
    left: rect.left + inset,
    width: Math.max(0, rect.width - inset * 2),
    bottom: viewportHeight - rect.top + gap,
  }
}
