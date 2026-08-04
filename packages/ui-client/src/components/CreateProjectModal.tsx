/**
 * [INPUT]: Kumo Button;CREATE_PROJECT_COPY;pickFolder;FolderIcon
 * [OUTPUT]: CreateProjectModal —— 名称 + 可选本机源文件夹
 * [POS]: 新建项目悬浮卡(无遮罩);确认后由 App 调 createProject
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { CREATE_PROJECT_COPY } from '../appCopy'
import { pickFolder } from '../pickFolder'
import { CloseIcon, FolderIcon, ICON_MD } from './icons'

export interface CreateProjectPayload {
  name: string
  sourcePath?: string
}

export function CreateProjectModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (payload: CreateProjectPayload) => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function onPick(): Promise<void> {
    const path = await pickFolder()
    if (path) setSourcePath(path)
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    try {
      await onCreate({ name: n, sourcePath: sourcePath.trim() || undefined })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="create-proj-card" role="dialog" aria-label={CREATE_PROJECT_COPY.title}>
      <div className="create-proj-head">
        <h2 className="create-proj-title">{CREATE_PROJECT_COPY.title}</h2>
        <button type="button" className="create-proj-x" aria-label="关闭" onClick={onClose}>
          <CloseIcon size={16} />
        </button>
      </div>
      <form className="create-proj-form" onSubmit={(e) => { void submit(e) }}>
        <label className="create-proj-field">
          <span className="create-proj-label">{CREATE_PROJECT_COPY.nameLabel}</span>
          <span className="create-proj-name-wrap">
            <FolderIcon size={ICON_MD} />
            <input
              className="create-proj-name"
              autoFocus
              value={name}
              maxLength={64}
              placeholder={CREATE_PROJECT_COPY.namePlaceholder}
              onChange={(e) => setName(e.target.value)}
            />
          </span>
        </label>

        <div className="create-proj-field">
          <span className="create-proj-label">{CREATE_PROJECT_COPY.folderLabel}</span>
          <button type="button" className="create-proj-folder" onClick={() => { void onPick() }}>
            <FolderIcon size={ICON_MD} />
            <span>
              {sourcePath
                ? `${CREATE_PROJECT_COPY.folderChosen}: ${sourcePath}`
                : CREATE_PROJECT_COPY.folderHint}
            </span>
          </button>
          <input
            className="create-proj-path"
            value={sourcePath}
            placeholder={CREATE_PROJECT_COPY.folderPaste}
            onChange={(e) => setSourcePath(e.target.value)}
          />
          {sourcePath && (
            <button type="button" className="create-proj-clear" onClick={() => setSourcePath('')}>
              {CREATE_PROJECT_COPY.folderClear}
            </button>
          )}
        </div>

        <div className="create-proj-actions">
          <Button type="button" variant="ghost" onClick={onClose}>{CREATE_PROJECT_COPY.cancel}</Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || busy}>
            {CREATE_PROJECT_COPY.submit}
          </Button>
        </div>
      </form>
    </aside>
  )
}
