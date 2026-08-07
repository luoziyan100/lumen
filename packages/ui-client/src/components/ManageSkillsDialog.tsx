/**
 * [INPUT]: SkillInfo;SKILLS_COPY;Kumo Dialog;pickSkillFolder/File
 * [OUTPUT]: ManageSkillsDialog —— 列表 / 添加文件夹·SKILL.md / 卸载
 * [POS]: composer + 斜杠 Manage 入口;禁挂 glass-beam(毁 Dialog fixed 居中)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useState } from 'react'
import { Dialog } from '@cloudflare/kumo/components/dialog'
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown'
import type { SkillInfo, SkillInstallScope } from '../agent-client'
import { SKILLS_COPY } from '../appCopy'
import { pickSkillFile, pickSkillFolder } from '../pickSkillPath'
import { ChevronDownIcon, CloseIcon, FileTextIcon, PlusIcon, TrashIcon } from './icons'

function layerLabel(layer: SkillInfo['layer']): string {
  if (layer === 'user') return SKILLS_COPY.layerUser
  if (layer === 'workspace') return SKILLS_COPY.layerWorkspace
  return SKILLS_COPY.layerSource
}

export function ManageSkillsDialog({
  skills,
  busy,
  onClose,
  onInstall,
  onUninstall,
}: {
  skills: SkillInfo[]
  busy: boolean
  onClose: () => void
  onInstall: (scope: SkillInstallScope, path: string) => Promise<void>
  onUninstall: (scope: SkillInstallScope, name: string) => Promise<void>
}) {
  const [scope, setScope] = useState<SkillInstallScope>('user')
  const [err, setErr] = useState<string | null>(null)

  async function addFolder(): Promise<void> {
    setErr(null)
    const path = await pickSkillFolder()
    if (!path) {
      setErr(SKILLS_COPY.pickUnavailable)
      return
    }
    try {
      await onInstall(scope, path)
    } catch (e) {
      setErr(e instanceof Error ? e.message : SKILLS_COPY.installFailed)
    }
  }

  async function addFile(): Promise<void> {
    setErr(null)
    const path = await pickSkillFile()
    if (!path) {
      setErr(SKILLS_COPY.pickUnavailable)
      return
    }
    try {
      await onInstall(scope, path)
    } catch (e) {
      setErr(e instanceof Error ? e.message : SKILLS_COPY.installFailed)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(o: boolean) => { if (!o) onClose() }}>
      <Dialog className="skills-manage-modal p-0" aria-label={SKILLS_COPY.manageTitle}>
        <div className="skills-manage-head">
          <div>
            <h2 className="skills-manage-title">{SKILLS_COPY.manageTitle}</h2>
            <p className="skills-manage-hint">{SKILLS_COPY.manageHint}</p>
          </div>
          <button type="button" className="icon-btn" aria-label="关闭" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="skills-manage-toolbar">
          <div className="skills-scope-seg" role="group" aria-label="安装目标">
            <button
              type="button"
              className={scope === 'user' ? 'is-on' : ''}
              disabled={busy}
              onClick={() => setScope('user')}
            >
              {SKILLS_COPY.installToUser}
            </button>
            <button
              type="button"
              className={scope === 'project' ? 'is-on' : ''}
              disabled={busy}
              onClick={() => setScope('project')}
            >
              {SKILLS_COPY.installToProject}
            </button>
          </div>
          <DropdownMenu>
            <DropdownMenu.Trigger
              render={<button type="button" className="skills-add-btn" disabled={busy} />}
            >
              <PlusIcon size={14} />
              Add
              <ChevronDownIcon size={12} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" side="bottom" sideOffset={6} className="glass-card">
              <DropdownMenu.Item onClick={() => { void addFolder() }}>
                {SKILLS_COPY.addFolder}
              </DropdownMenu.Item>
              <DropdownMenu.Item onClick={() => { void addFile() }}>
                {SKILLS_COPY.addFile}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
        </div>

        {err && <p className="skills-manage-err" role="alert">{err}</p>}

        <ul className="skills-manage-list">
          {skills.length === 0 && <li className="skills-manage-empty">{SKILLS_COPY.empty}</li>}
          {skills.map((s) => (
            <li key={`${s.layer}:${s.name}`} className="skills-manage-row">
              <FileTextIcon size={18} />
              <div className="skills-manage-meta">
                <span className="skills-manage-name">{s.name}</span>
                <span className="skills-manage-desc">{s.description}</span>
                <span className="skills-manage-layer">{layerLabel(s.layer)}</span>
              </div>
              {(s.layer === 'user' || s.layer === 'workspace') && (
                <button
                  type="button"
                  className="skills-uninstall"
                  title={SKILLS_COPY.uninstall}
                  aria-label={SKILLS_COPY.uninstall}
                  disabled={busy}
                  onClick={() => {
                    void onUninstall(s.layer === 'user' ? 'user' : 'project', s.name).catch((e) => {
                      setErr(e instanceof Error ? e.message : SKILLS_COPY.uninstallFailed)
                    })
                  }}
                >
                  <TrashIcon size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Dialog>
    </Dialog.Root>
  )
}
