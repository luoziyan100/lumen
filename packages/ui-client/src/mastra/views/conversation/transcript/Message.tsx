/**
 * [INPUT]: Mastra 消息、受控文件回调、统一文件类型/复制图标、共享长文本卷帘与消息投影、components/clipboard 的 copyText
 * [OUTPUT]: UserMessage、MessageCopy；旧附件、长正文折叠和复制反馈
 * [POS]: 纯会话呈现；图片只读内嵌数据，文件点击才进入现有阅读器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useT } from '../../../../i18n/index.ts'
import { useEffect, useRef, useState } from 'react'
import type { MastraDBMessage } from '@mastra/client-js'
import { CopyIcon, CheckIcon, FileTypeIcon, ICON_SM } from '../../../../components/icons'
import type { FileTarget } from '../../../data/file-links.ts'
import { userContent } from './content.ts'
import { CollapsibleUserText } from '../../../../components/disclosure/UserText'
import { copyText } from '../../../../components/clipboard.ts'

export function UserMessage({ message, onOpenFile }: { message: MastraDBMessage; onOpenFile: (target: FileTarget) => void }) {
  const { text, files, images } = userContent(message)
  return <CollapsibleUserText text={text} leading={<>
    {files.length > 0 && <div className="msg-file-row">{files.map(file => <button type="button" className="msg-file-chip" key={`${file.target.scope}:${file.target.path}`} title={file.target.path} onClick={() => onOpenFile(file.target)}><FileTypeIcon name={file.name} size={ICON_SM} /><span className="file-chip-name">{file.name}</span></button>)}</div>}
    {images.length > 0 && <div className="mw-history-images">{images.map((image, index) => <InlineImage key={index} {...image} />)}</div>}
  </>} />
}

function InlineImage({ name, url }: { name: string; url: string }) {
  const { transcript: T, common } = useT()
  const dialog = useRef<HTMLDialogElement>(null)
  return <><button type="button" className="mw-history-image" aria-label={T.previewImage(name)} onClick={() => dialog.current?.showModal()}><img src={url} alt={name} /></button>
    <dialog className="mw-image-preview" ref={dialog} aria-label={T.previewImage(name)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}><button type="button" onClick={() => dialog.current?.close()}>{common.close}</button><img src={url} alt={name} /></dialog></>
}

export function MessageCopy({ text, user }: { text: string; user: boolean }) {
  const { transcript: T, common } = useT()
  const [copied, setCopied] = useState(false), [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(timer.current) } }, [])
  async function copy() {
    try {
      await copyText(text); if (!alive.current) return
      setError(''); setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1400)
    } catch (error) { if (alive.current) { setCopied(false); setError(error instanceof Error ? error.message : String(error)) } }
  }
  if (!text) return null
  return <div className="msg-actions"><button type="button" className={`msg-copy${copied ? ' is-copied' : ''}`} aria-label={copied ? common.copied : user ? T.copyInput : T.copyAnswer} title={copied ? common.copied : common.copy} onClick={() => void copy()}>{copied ? <CheckIcon /> : <CopyIcon />}</button>{error && <span role="alert">{error}</span>}</div>
}
