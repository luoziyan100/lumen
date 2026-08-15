/**
 * [INPUT]: 会话 id / 列表级 hoveredTaskId / 该行菜单是否打开
 * [OUTPUT]: isSessionMarqueeActive —— 同时最多一条走马灯热态
 * [POS]: Sidebar 与 MarqueeTitle 共用;热态不放在标题内部 pointer 上
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 菜单打开优先;否则仅当前悬停行热。他行悬停必须熄灭本行。 */
export function isSessionMarqueeActive(
  taskId: string,
  hoveredTaskId: string | null,
  menuOpen: boolean,
): boolean {
  return menuOpen || hoveredTaskId === taskId
}
