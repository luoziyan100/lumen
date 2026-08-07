/**
 * [INPUT]: 无
 * [OUTPUT]: filterComposerFiles / dragHasFiles —— 附件宽准入(admission ≠ representation)
 * [POS]: composer 点选/拖放与共享区上传共用;扩展名不挡门,落盘分类在 agent-service saveUpload
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/**
 * 宽准入:有非空文件名即收。不按扩展名拒绝(学 OpenSquilla:
 * policy decides representation, not admission)。
 * 未知类型由服务端进 uploads/ 作 opaque 工作区材料,不 inline 进模型。
 */
export function filterComposerFiles(files: FileList | File[] | null | undefined): File[] {
  if (!files) return []
  return Array.from(files).filter((f) => f.name.trim().length > 0)
}

/** drag 事件是否可能带文件(用于 preventDefault,避免浏览器直接打开) */
export function dragHasFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false
  return Array.from(dt.types).includes('Files')
}
