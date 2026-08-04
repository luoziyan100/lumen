/**
 * [INPUT]: 用户气泡纯文本
 * [OUTPUT]: shouldCollapseUserText;USER_FOLD_MAX_* —— 折叠阈值合同
 * [POS]: 被 CollapsibleUserText 与测试共用;阈值 9 行 / 750 字
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 行数或字数任一超限即折叠 */
export const USER_FOLD_MAX_LINES = 9
export const USER_FOLD_MAX_CHARS = 750

export function shouldCollapseUserText(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (t.length > USER_FOLD_MAX_CHARS) return true
  return t.split(/\n/).length > USER_FOLD_MAX_LINES
}
