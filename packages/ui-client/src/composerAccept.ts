/**
 * [INPUT]: 无
 * [OUTPUT]: COMPOSER_ACCEPT / filterComposerFiles —— 与 @ 选文件同源的扩展名白名单
 * [POS]: composer 附件入口(点选 / 拖放)共用过滤,避免两处 accept 漂移
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 与 ComposerCard hidden input 的 accept 保持一字不差 */
export const COMPOSER_ACCEPT =
  '.pdf,.md,.txt,.tex,.csv,.json,.html,.png,.jpg,.jpeg,.webp,.gif,.docx,.pptx,.epub'

const EXT = new Set(
  COMPOSER_ACCEPT.split(',')
    .map((s) => s.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean),
)

/** 拖放 / 选文件共用:只收白名单扩展名 */
export function filterComposerFiles(files: FileList | File[] | null | undefined): File[] {
  if (!files) return []
  return Array.from(files).filter((f) => {
    const name = f.name
    const i = name.lastIndexOf('.')
    if (i < 0 || i === name.length - 1) return false
    return EXT.has(name.slice(i + 1).toLowerCase())
  })
}

/** drag 事件是否可能带文件(用于 preventDefault,避免浏览器直接打开) */
export function dragHasFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false
  return Array.from(dt.types).includes('Files')
}
