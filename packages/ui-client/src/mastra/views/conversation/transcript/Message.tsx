/**
 * [INPUT]: Mastra 消息、受控文件回调、原图标、共享长文本卷帘与消息投影
 * [OUTPUT]: UserMessage、MessageCopy；旧附件、长正文折叠和复制反馈
 * [POS]: 纯会话呈现；图片只读内嵌数据，文件点击才进入现有阅读器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react'
import type { MastraDBMessage } from '@mastra/client-js'
import { CopyIcon, CheckIcon, PdfIcon } from '../../../../components/icons'
import type { FileTarget } from '../../../data/file-links.ts'
import { userContent } from './content.ts'
import { CollapsibleUserText } from '../../../../components/disclosure/UserText'

export function UserMessage({ message, onOpenFile }: { message: MastraDBMessage; onOpenFile: (target: FileTarget) => void }) {
  const { text, files, images } = userContent(message)
  return <CollapsibleUserText text={text} leading={<>
    {files.length > 0 && <div className="msg-file-row">{files.map(file => <button type="button" className="msg-file-chip" key={`${file.target.scope}:${file.target.path}`} title={file.target.path} onClick={() => onOpenFile(file.target)}><PdfIcon size={14} /><span className="file-chip-name">{file.name}</span></button>)}</div>}
    {images.length > 0 && <div className="mw-history-images">{images.map((image, index) => <InlineImage key={index} {...image} />)}</div>}
  </>} />
}

function InlineImage({ name, url }: { name: string; url: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  return <><button type="button" className="mw-history-image" aria-label={`预览图片 ${name}`} onClick={() => dialog.current?.showModal()}><img src={url} alt={name} /></button>
    <dialog className="mw-image-preview" ref={dialog} aria-label={`预览图片 ${name}`} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}><button type="button" onClick={() => dialog.current?.close()}>关闭</button><img src={url} alt={name} /></dialog></>
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return } catch { /* WebKit 无剪贴板权限时回退到用户点击内的复制。 */ }
  const focus = document.activeElement as HTMLElement | null, input = document.createElement('textarea')
  input.value = text; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select()
  try { if (!document.execCommand('copy')) throw new Error('复制失败，请手动选择文本复制') }
  finally { input.remove(); focus?.focus({ preventScroll: true }) }
}

export function MessageCopy({ text, user }: { text: string; user: boolean }) {
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
  return <div className="msg-actions"><button type="button" className={`msg-copy${copied ? ' is-copied' : ''}`} aria-label={copied ? '已复制' : user ? '复制这条输入' : '复制这条回答'} title={copied ? '已复制' : '复制'} onClick={() => void copy()}>{copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}</button>{error && <span role="alert">{error}</span>}</div>
}
