/**
 * [INPUT]: 用户选定的 File 与删除回调、原生 Blob URL
 * [OUTPUT]: Attachments：待发附件列表、图片缩略图和模态预览
 * [POS]: 只展示本地附件，URL 生命周期随 File；图片不进入可执行 HTML
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { CloseIcon } from '../../../components/icons'
import { MASTRA_COPY as C } from '../../../copy/mastraCopy'

function Attachment({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState(''), [expanded, setExpanded] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!/^image\/(png|jpe?g|gif|webp|svg\+xml|avif|bmp)$/i.test(file.type)) return
    const next = URL.createObjectURL(file); setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  useEffect(() => { if (expanded) dialog.current?.showModal() }, [expanded])
  return <div className="mw-attachment">
    {url ? <button type="button" className="mw-attachment-image" aria-label={`${C.previewImage} ${file.name}`} onClick={() => setExpanded(true)}><img src={url} alt={file.name} /></button> : null}
    <span title={file.name}>{file.name}</span>
    <Button type="button" variant="ghost" aria-label={`${C.remove} ${file.name}`} onClick={onRemove}><CloseIcon size={14} /></Button>
    {expanded && <dialog ref={dialog} className="mw-image-preview" aria-label={C.previewImage} onClose={() => setExpanded(false)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}>
      <Button type="button" variant="ghost" aria-label={C.close} onClick={() => dialog.current?.close()}><CloseIcon /></Button><img src={url} alt={file.name} /><p>{file.name}</p>
    </dialog>}
  </div>
}

export function Attachments({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  return <div className="mw-attachments">{files.map((file, index) => <Attachment key={`${file.name}-${file.lastModified}-${index}`} file={file} onRemove={() => onRemove(index)} />)}</div>
}
