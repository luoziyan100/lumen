/**
 * [INPUT]: UploadRef;可选 onOpen(path)
 * [OUTPUT]: MsgFileChips —— 用户气泡内附件 chip 行
 * [POS]: 上传知情(S4)人侧呈现;机读附言不在此展示(见 doc/upload-awareness.md)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { UploadRef } from '../agent-client'
import { PdfIcon } from './icons'

export function MsgFileChips({
  uploads,
  onOpen,
}: {
  uploads: UploadRef[]
  onOpen?: (ref: UploadRef) => void
}) {
  if (!uploads.length) return null
  return (
    <div className="msg-file-row">
      {uploads.map((u) => (
        <button
          key={u.path}
          type="button"
          className="msg-file-chip"
          title={u.path}
          onClick={() => onOpen?.(u)}
        >
          <PdfIcon size={14} />
          <span className="file-chip-name">{u.name}</span>
        </button>
      ))}
    </div>
  )
}
