/**
 * [INPUT]: 无
 * [OUTPUT]: parseSlashFilter —— composer `/token` 解析
 * [POS]: Skills 斜杠入口的纯函数;UI 组件与单测共用
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 从 composer 文本解析斜杠 token;`/foo` → foo;`/` → '';非整段斜杠 → null */
export function parseSlashFilter(input: string): string | null {
  const m = input.match(/^\/([^\s]*)$/)
  if (!m) return null
  return m[1] ?? ''
}
