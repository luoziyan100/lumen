/**
 * [INPUT]: AgentClient;当前会话/项目;useAgent.send;toast
 * [OUTPUT]: 输入草稿 + 粘贴图 + 暂存文件 + submit/activateSkill
 * [POS]: App composer 的发送相;ask_user 挂起时禁普通发送;带文件先建草稿会话再开跑
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useLayoutEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { AgentClient, ImageData, UploadRef } from '../agent-client'
import { filterComposerFiles } from '../composer/composerAccept'
import { SKILLS_COPY } from '../copy/appCopy'

const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function useComposerDraft(opts: {
  client: AgentClient
  projectId: string
  taskId: string | null
  running: boolean
  pendingAsk: boolean
  activePath: string | null
  send: (text: string, images?: ImageData[], uploads?: UploadRef[], activePath?: string | null) => Promise<void>
  selectConversation: (id: string, isRunning?: boolean, forProjectId?: string) => void
  setDraftProjectId: (id: string | null) => void
  refreshWorkspace: (taskId: string | null) => void
  openRail: () => void
  pinMessages: () => void
  toastError: (title: string, description: string) => void
}) {
  const {
    client, projectId, taskId, running, pendingAsk, activePath,
    send, selectConversation, setDraftProjectId, refreshWorkspace, openRail, pinMessages, toastError,
  } = opts

  const [input, setInput] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 168)}px`
  }, [input])

  const [attachments, setAttachments] = useState<ImageData[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>): void {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    e.preventDefault()
    for (const file of files.slice(0, MAX_IMAGES - attachments.length)) {
      if (file.size > MAX_IMAGE_BYTES) continue
      const reader = new FileReader()
      reader.onload = () => {
        const url = String(reader.result ?? '')
        const base64 = url.slice(url.indexOf(',') + 1)
        setAttachments((prev) => prev.length < MAX_IMAGES
          ? [...prev, { mediaType: file.type, base64 }]
          : prev)
      }
      reader.readAsDataURL(file)
    }
  }

  async function submit(): Promise<void> {
    const t = input.trim()
    if ((!t && attachments.length === 0 && pendingFiles.length === 0) || running || uploading || pendingAsk) return
    const images = attachments
    const files = pendingFiles
    const text = t || (files.length ? '' : '(见图)')
    const receipts: UploadRef[] = []
    if (files.length) {
      setUploading(true)
      try {
        let id = taskId
        if (!id) {
          id = await client.createTask(projectId, t || files.map((f) => f.name).join(', '))
          selectConversation(id, false, projectId)
        }
        for (const file of files) {
          const receipt = await client.uploadFile(projectId, file, id)
          receipts.push({
            name: file.name,
            path: receipt.path,
            ...(receipt.extractPath ? { extractPath: receipt.extractPath } : {}),
          })
        }
        refreshWorkspace(id)
        openRail()
      } catch (err) {
        toastError('上传失败', err instanceof Error ? err.message : '文件还在暂存区,可重试或移除')
        setUploading(false)
        return
      }
      setUploading(false)
    }
    setInput('')
    setAttachments([])
    setPendingFiles([])
    pinMessages()
    await send(
      text,
      images.length ? images : undefined,
      receipts.length ? receipts : undefined,
      activePath,
    )
  }

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    await submit()
  }

  function onComposerKey(e: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
  }

  async function activateSkill(name: string): Promise<void> {
    if (running || uploading || pendingAsk) return
    setInput('')
    pinMessages()
    try {
      const id = await client.activateSkill(projectId, name, taskId ?? undefined)
      selectConversation(id, true, projectId)
      setDraftProjectId(null)
    } catch (err) {
      toastError(SKILLS_COPY.activateFailed, err instanceof Error ? err.message : '请重试')
    }
  }

  function onPickFiles(e: ChangeEvent<HTMLInputElement>): void {
    const files = filterComposerFiles(e.target.files)
    e.target.value = ''
    if (files.length) setPendingFiles((prev) => [...prev, ...files])
  }

  function onAddFiles(files: File[]): void {
    const ok = filterComposerFiles(files)
    if (ok.length) setPendingFiles((prev) => [...prev, ...ok])
  }

  return {
    input, setInput, taRef, fileRef,
    attachments, setAttachments,
    pendingFiles, setPendingFiles,
    uploading,
    onPaste, onSubmit, onComposerKey, activateSkill, onPickFiles, onAddFiles,
  }
}
