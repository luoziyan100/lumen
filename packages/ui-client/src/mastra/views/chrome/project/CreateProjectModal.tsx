/**
 * [INPUT]: 产品API创建项目/绑定资料、原生目录选择与原设计文案/图标
 * [OUTPUT]: CreateProjectModal，无遮罩的名称与可选源目录创建卡
 * [POS]: chrome 的创建入口；保留两步写入中已创建身份，重试不重复建项目，完成导航交给组合根
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import type { LumenApi, Project } from '../../../data/client.ts'
import { CREATE_PROJECT_COPY as copy } from '../../../../copy/appCopy.ts'
import { pickFolder } from '../../../../shell/pickFolder.ts'
import { CloseIcon, FolderIcon, ICON_MD } from '../../../../components/icons.tsx'
import './project.css'

export function CreateProjectModal({ api, onClose, onCreated }: {
  api: Pick<LumenApi, 'createProject' | 'updateProjectSource'>
  onClose: () => void
  onCreated: (project: Project) => void
}) {
  const [name, setName] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const project = useRef<Project | null>(null)
  const submitting = useRef(false)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting.current) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function onPick() {
    const path = await pickFolder()
    if (path && !submitting.current) setSourcePath(path)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    try {
      project.current ??= await api.createProject(name.trim())
      if (sourcePath.trim()) await api.updateProjectSource(project.current.id, sourcePath.trim())
      onCreated(project.current)
      onClose()
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      setError(project.current ? `项目已创建，但源文件夹绑定失败：${detail}。请修改路径后重试，或清除路径后完成。` : detail)
    } finally { submitting.current = false; setBusy(false) }
  }

  return <aside className="create-proj-card" role="dialog" aria-label={copy.title} aria-busy={busy}>
    <div className="create-proj-head"><h2 className="create-proj-title">{copy.title}</h2><button type="button" className="create-proj-x" aria-label="关闭" disabled={busy} onClick={onClose}><CloseIcon size={16} /></button></div>
    <form className="create-proj-form" onSubmit={event => { void submit(event) }}>
      <label className="create-proj-field"><span className="create-proj-label">{copy.nameLabel}</span><span className="create-proj-name-wrap"><FolderIcon size={ICON_MD} /><input className="create-proj-name" autoFocus value={name} maxLength={64} placeholder={copy.namePlaceholder} disabled={busy || Boolean(project.current)} onChange={event => setName(event.target.value)} /></span></label>
      <div className="create-proj-field"><span className="create-proj-label">{copy.folderLabel}</span>
        <button type="button" className="create-proj-folder" disabled={busy} onClick={() => { void onPick() }}><FolderIcon size={ICON_MD} /><span>{sourcePath ? `${copy.folderChosen}: ${sourcePath}` : copy.folderHint}</span></button>
        <input className="create-proj-path" aria-label="源文件夹路径" value={sourcePath} placeholder={copy.folderPaste} disabled={busy} onChange={event => setSourcePath(event.target.value)} />
        {sourcePath && <button type="button" className="create-proj-clear" disabled={busy} onClick={() => setSourcePath('')}>{copy.folderClear}</button>}
      </div>
      {error && <p className="create-proj-error" role="alert">{error}</p>}
      <div className="create-proj-actions"><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>{copy.cancel}</Button><Button type="submit" variant="primary" disabled={!name.trim() || busy}>{copy.submit}</Button></div>
    </form>
  </aside>
}
