/**
 * [INPUT]: border-beam;icons;ASK_USER_COPY;SKILLS_COPY;ImageData;composerAccept;SkillSlashMenu;父级传入
 * [OUTPUT]: ComposerCard —— Border Beam 暗玻璃对话输入卡;液态玻璃控件;+/Skills;/ 斜杠;模型芯片;拖放文件;待发图可放大
 * [POS]: 贴 composer-dock;仅改输入岛,不染暖纸消息流;见 doc/ui-design.md §0
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { BorderBeam } from 'border-beam'
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown'
import { Tooltip } from '@cloudflare/kumo/components/tooltip'
import type { ImageData, SkillInfo } from '../agent-client'
import { ASK_USER_COPY, SKILLS_COPY } from '../appCopy'
import { dragHasFiles, filterComposerFiles } from '../composerAccept'
import { AtGlyph, CheckIcon, ChevronDownIcon, CloseIcon, FileTextGlyph, GearGlyph, PdfIcon, PlusIcon, SendIcon } from './icons'
import { SkillSlashMenu } from './SkillSlashMenu'
import { parseSlashFilter } from '../skillSlash'

/** composer 芯片可选的一条模型(跨供应商扁平) */
export type ComposerModelOption = {
  profileId: string
  modelId: string
  profileName: string
}

export function ComposerCard({
  input,
  onInputChange,
  onSubmit,
  onKeyDown,
  onPaste,
  taRef,
  fileRef,
  onPickFiles,
  onAddFiles,
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
  modelOptions,
  selectedProfileId,
  selectedModelId,
  onSelectModel,
  onManageModels,
  ctxUsage,
  canSend,
  skills,
  onActivateSkill,
  onOpenManageSkills,
}: {
  input: string
  onInputChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onKeyDown: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void
  taRef: RefObject<HTMLTextAreaElement | null>
  fileRef: RefObject<HTMLInputElement | null>
  onPickFiles: (e: ChangeEvent<HTMLInputElement>) => void
  onAddFiles: (files: File[]) => void
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
  modelOptions: ComposerModelOption[]
  selectedProfileId: string | null
  selectedModelId: string
  onSelectModel: (opt: ComposerModelOption) => void
  onManageModels: () => void
  ctxUsage: number | null | undefined
  canSend: boolean
  skills: SkillInfo[]
  onActivateSkill: (name: string) => void
  onOpenManageSkills: () => void
}) {
  const shortModel = shortenModel(modelLabel)
  const dropBlocked = uploading || pendingAsk
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)
  const slashFilter = useMemo(() => parseSlashFilter(input), [input])
  const slashOpen = slashFilter != null && !pendingAsk && !running
  const filteredSkills = useMemo(() => {
    const q = (slashFilter ?? '').toLowerCase()
    return skills.filter((s) => !q || s.name.includes(q) || s.description.toLowerCase().includes(q))
  }, [skills, slashFilter])
  const [slashHi, setSlashHi] = useState(0)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const pendingImageUrls = useObjectUrls(pendingFiles)

  useEffect(() => {
    setSlashHi(0)
  }, [slashFilter, skills.length])

  useEffect(() => {
    if (!previewSrc) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setPreviewSrc(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewSrc])

  function onDragEnter(e: DragEvent<HTMLFormElement>): void {
    if (dropBlocked || !dragHasFiles(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current += 1
    setDragOver(true)
  }

  function onDragLeave(e: DragEvent<HTMLFormElement>): void {
    if (!dragHasFiles(e.dataTransfer) && dragDepth.current === 0) return
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragOver(false)
  }

  function onDragOver(e: DragEvent<HTMLFormElement>): void {
    if (dropBlocked || !dragHasFiles(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  function onDrop(e: DragEvent<HTMLFormElement>): void {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = 0
    setDragOver(false)
    if (dropBlocked) return
    const files = filterComposerFiles(e.dataTransfer.files)
    if (files.length) onAddFiles(files)
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (slashOpen && filteredSkills.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashHi((i) => (i + 1) % filteredSkills.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashHi((i) => (i - 1 + filteredSkills.length) % filteredSkills.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const s = filteredSkills[slashHi]
        if (s) onActivateSkill(s.name)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onInputChange('')
        return
      }
    }
    onKeyDown(e)
  }

  const imageAttachments = attachments.map((im, i) => ({
    key: `att-${i}`,
    src: `data:${im.mediaType};base64,${im.base64}`,
    onRemove: () => onRemoveAttachment(i),
  }))
  const imagePending = pendingFiles.flatMap((f, i) => {
    if (!f.type.startsWith('image/')) return []
    const src = pendingImageUrls[i]
    if (!src) return []
    return [{ key: `file-img-${f.name}-${i}`, src, onRemove: () => onRemoveFile(i) }]
  })
  const nonImagePending = pendingFiles
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !f.type.startsWith('image/'))

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
      <form
        className={`composer-card${dragOver ? ' is-drop-target' : ''}`}
        onSubmit={onSubmit}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {dragOver && (
          <div className="composer-drop-hint" aria-hidden>
            松手添加文件
          </div>
        )}
        {slashOpen && (
          <SkillSlashMenu
            skills={skills}
            filter={slashFilter ?? ''}
            highlight={slashHi}
            onHighlight={setSlashHi}
            onPickSkill={(s) => onActivateSkill(s.name)}
            onManage={onOpenManageSkills}
          />
        )}
        <div className="composer-top">
          <DropdownMenu>
            <Tooltip
              content="添加"
              render={
                <DropdownMenu.Trigger
                  render={
                    <button
                      type="button"
                      className="composer-at liquid-glass"
                      aria-label="添加"
                      disabled={uploading || pendingAsk}
                    />
                  }
                >
                  <PlusIcon size={18} />
                </DropdownMenu.Trigger>
              }
            />
            <DropdownMenu.Content align="start" side="top" sideOffset={6} className="composer-plus-menu glass-card">
              <DropdownMenu.Item icon={AtGlyph} onClick={onAttachClick}>
                {SKILLS_COPY.menuAddFiles}
              </DropdownMenu.Item>
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger icon={FileTextGlyph}>
                  {SKILLS_COPY.menuSkills}
                </DropdownMenu.SubTrigger>
                <DropdownMenu.SubContent align="start" side="right" sideOffset={4} className="glass-card">
                  {skills.length === 0 && (
                    <div className="composer-model-menu-empty">{SKILLS_COPY.empty}</div>
                  )}
                  {skills.map((s) => (
                    <DropdownMenu.Item
                      key={`m-${s.layer}-${s.name}`}
                      onClick={() => onActivateSkill(s.name)}
                    >
                      {s.name}
                    </DropdownMenu.Item>
                  ))}
                  <DropdownMenu.Item icon={GearGlyph} onClick={onOpenManageSkills}>
                    {SKILLS_COPY.manageItem}
                  </DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Sub>
            </DropdownMenu.Content>
          </DropdownMenu>
        </div>

        {(imageAttachments.length > 0 || imagePending.length > 0) && (
          <div className="attach-row">
            {[...imageAttachments, ...imagePending].map((im) => (
              <span key={im.key} className="attach-chip">
                <button
                  type="button"
                  className="attach-chip-thumb"
                  aria-label="放大预览图片"
                  onClick={() => setPreviewSrc(im.src)}
                >
                  <img src={im.src} alt="" />
                </button>
                <button
                  type="button"
                  className="attach-chip-remove"
                  aria-label="移除图片"
                  onClick={() => im.onRemove()}
                >
                  <CloseIcon size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {nonImagePending.length > 0 && (
          <div className="file-row">
            {nonImagePending.map(({ f, i }) => (
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
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          placeholder={pendingAsk ? ASK_USER_COPY.waitingHint : '问点什么…'}
          rows={2}
          disabled={pendingAsk}
        />

        <div className="composer-foot">
          <div className="composer-pills">
            <DropdownMenu>
              <DropdownMenu.Trigger
                render={<button type="button" className="composer-pill liquid-glass" />}
                title="选择模型"
                aria-label="选择模型"
              >
                <span className="composer-pill-label">{shortModel || '选择模型'}</span>
                <ChevronDownIcon size={12} />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="start" side="top" sideOffset={6} className="composer-model-menu glass-card">
                {modelOptions.length === 0 && (
                  <div className="composer-model-menu-empty">尚未接入模型 ID,先去管理配置</div>
                )}
                {modelOptions.map((opt) => {
                  const selected = opt.profileId === selectedProfileId && opt.modelId === selectedModelId
                  return (
                    <DropdownMenu.Item
                      key={`${opt.profileId}::${opt.modelId}`}
                      onClick={() => onSelectModel(opt)}
                    >
                      {selected && <CheckIcon size={14} />}
                      <span>{opt.modelId}</span>
                      <span className="composer-model-menu-meta">{opt.profileName}</span>
                    </DropdownMenu.Item>
                  )
                })}
                <DropdownMenu.Item icon={GearGlyph} onClick={onManageModels}>
                  管理模型配置…
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
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
                  className="composer-btn composer-btn-stop liquid-glass"
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
                  className="composer-btn composer-btn-send liquid-glass"
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
          hidden
          onChange={onPickFiles}
        />
      </form>

      {previewSrc && createPortal(
        <div
          className="attach-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
          onClick={() => setPreviewSrc(null)}
        >
          <button
            type="button"
            className="attach-lightbox-close"
            aria-label="关闭预览"
            onClick={() => setPreviewSrc(null)}
          >
            <CloseIcon size={18} />
          </button>
          <img
            className="attach-lightbox-img"
            src={previewSrc}
            alt="待发送图片预览"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body,
      )}
    </BorderBeam>
  )
}

/** 为 pending 图片 File 建 object URL;按内容签名重建,避免数组引用抖动反复 revoke */
function useObjectUrls(files: File[]): (string | null)[] {
  const sig = files.map((f) => `${f.name}\0${f.size}\0${f.lastModified}\0${f.type}`).join('\n')
  const [urls, setUrls] = useState<(string | null)[]>(() => files.map(() => null))
  useEffect(() => {
    const next = files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null))
    setUrls(next)
    return () => {
      for (const u of next) {
        if (u) URL.revokeObjectURL(u)
      }
    }
    // 仅跟 sig:同内容新 File[] 引用不重建 URL(避免 lightbox blob 被 revoke)
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps -- files 由 sig 编码
  return urls
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
