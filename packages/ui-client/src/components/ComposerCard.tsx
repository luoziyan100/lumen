/**
 * [INPUT]: border-beam;icons;ASK_USER_COPY;ImageData;父级传入的输入/附件/运行态
 * [OUTPUT]: ComposerCard —— Border Beam 暗玻璃对话输入卡(像素试点)
 * [POS]: 贴 composer-dock;仅改输入岛,不染暖纸消息流;见 doc/ui-design.md §0
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { BorderBeam } from 'border-beam'
import { Tooltip } from '@cloudflare/kumo/components/tooltip'
import type { ImageData } from '../agent-client'
import { ASK_USER_COPY } from '../appCopy'
import { AtIcon, ChevronDownIcon, CloseIcon, PdfIcon, SendIcon } from './icons'

export function ComposerCard({
  input,
  onInputChange,
  onSubmit,
  onKeyDown,
  onPaste,
  taRef,
  fileRef,
  onPickFiles,
  onAttachClick,
  attachments,
  onRemoveAttachment,
  pendingFiles,
  onRemoveFile,
  running,
  onStop,
  uploading,
  pendingAsk,
  modelLabel,
  onOpenModel,
  ctxUsage,
  canSend,
}: {
  input: string
  onInputChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onKeyDown: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void
  taRef: RefObject<HTMLTextAreaElement | null>
  fileRef: RefObject<HTMLInputElement | null>
  onPickFiles: (e: ChangeEvent<HTMLInputElement>) => void
  onAttachClick: () => void
  attachments: ImageData[]
  onRemoveAttachment: (index: number) => void
  pendingFiles: File[]
  onRemoveFile: (index: number) => void
  running: boolean
  onStop: () => void
  uploading: boolean
  pendingAsk: boolean
  modelLabel: string
  onOpenModel: () => void
  ctxUsage: number | null | undefined
  canSend: boolean
}) {
  const shortModel = shortenModel(modelLabel)

  return (
    <BorderBeam
      className="composer-beam"
      size="md"
      theme="dark"
      colorVariant="colorful"
      borderRadius={24}
      strength={1}
      brightness={1.65}
      saturation={1.4}
      duration={2.8}
    >
      <form className="composer-card" onSubmit={onSubmit}>
        <div className="composer-top">
          <Tooltip
            content={uploading ? '上传中…' : '添加文件'}
            render={
              <button
                type="button"
                className="composer-at"
                aria-label="添加文件"
                disabled={uploading || pendingAsk}
                onClick={onAttachClick}
              >
                <AtIcon size={18} />
              </button>
            }
          />
        </div>

        {attachments.length > 0 && (
          <div className="attach-row">
            {attachments.map((im, i) => (
              <span key={i} className="attach-chip">
                <img src={`data:${im.mediaType};base64,${im.base64}`} alt="待发送图片" />
                <button type="button" aria-label="移除图片" onClick={() => onRemoveAttachment(i)}>
                  <CloseIcon size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {pendingFiles.length > 0 && (
          <div className="file-row">
            {pendingFiles.map((f, i) => (
              <span key={`${f.name}-${i}`} className="file-chip" title={f.name}>
                <PdfIcon size={14} />
                <span className="file-chip-name">{f.name}</span>
                <button type="button" aria-label="移除文件" onClick={() => onRemoveFile(i)}>
                  <CloseIcon size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={taRef}
          className="composer-input"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={pendingAsk ? ASK_USER_COPY.waitingHint : '问点什么,或粘贴图片、让它去研究…'}
          rows={2}
          disabled={pendingAsk}
        />

        <div className="composer-foot">
          <div className="composer-pills">
            <button
              type="button"
              className="composer-pill"
              onClick={onOpenModel}
              title="模型设置"
            >
              <span className="composer-pill-label">{shortModel || 'Agent'}</span>
              <ChevronDownIcon size={12} />
            </button>
            <button
              type="button"
              className="composer-pill"
              disabled
              title="即将支持"
            >
              <span className="composer-pill-label">Auto</span>
              <ChevronDownIcon size={12} />
            </button>
            {typeof ctxUsage === 'number' && ctxUsage >= 0.6 && (
              <span
                className={ctxUsage >= 0.85 ? 'ctx-meter ctx-meter-high' : 'ctx-meter'}
                title="当前会话的上下文占用"
              >
                上下文 {Math.round(ctxUsage * 100)}%
              </span>
            )}
          </div>
          <span className="composer-spacer" />
          {running ? (
            <Tooltip
              content="停止"
              render={
                <button
                  type="button"
                  className="composer-btn composer-btn-stop"
                  aria-label="停止"
                  onClick={onStop}
                >
                  <span className="stop-square" />
                </button>
              }
            />
          ) : (
            <Tooltip
              content="发送"
              render={
                <button
                  type="submit"
                  className="composer-btn composer-btn-send"
                  aria-label="发送"
                  disabled={!canSend}
                >
                  <SendIcon size={18} />
                </button>
              }
            />
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.md,.txt,.tex,.csv,.json,.html,.png,.jpg,.jpeg,.webp,.gif,.docx,.pptx,.epub"
          hidden
          onChange={onPickFiles}
        />
      </form>
    </BorderBeam>
  )
}

/** 底栏 pill 宽度有限:长模型名收成尾段 */
function shortenModel(label: string): string {
  const t = label.trim()
  if (!t) return ''
  if (t.length <= 18) return t
  const parts = t.split(/[/:]/)
  const last = parts[parts.length - 1] || t
  return last.length <= 18 ? last : `${last.slice(0, 16)}…`
}
