/**
 * [INPUT]: 任务技能目录、完整技能包安装 API、原生/浏览器文件选择与原技能面板样式
 * [OUTPUT]: Skills：目录/Markdown 安装和按范围移除；技能选择由输入卡菜单负责
 * [POS]: 保留脚本与资源的相对目录，安装复用服务原子发布；技能只在用户选择后加入草稿
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { Button } from '@cloudflare/kumo/components/button'
import { Dialog } from '@cloudflare/kumo/components/dialog'
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown'
import { CloseIcon, PlusIcon, ChevronDownIcon, SkillIcon, TrashIcon } from '../../components/icons'
import { MASTRA_COPY as C } from '../../copy/mastraCopy'
import { browserSkillFiles, pickSkillPackage, type SkillFile } from '../../shell/pickSkill'
import { LumenApi, type Identity, type SkillInfo } from '../data/client.ts'

export function Skills({ api, identity, onClose }: { api: LumenApi; identity: Identity; onClose: () => void }) {
  const [skills, setSkills] = useState<SkillInfo[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [scope, setScope] = useState<'user' | 'project'>('user')
  const upload = useRef<HTMLInputElement>(null), folder = useRef<HTMLInputElement>(null), active = useRef(true)
  useEffect(() => { active.current = true; void refresh(); return () => { active.current = false } }, [api, identity.projectId, identity.taskId])
  async function refresh() {
    try { const result = await api.skills(identity); if (active.current) setSkills(result.skills) }
    catch (error) { if (active.current) setError(String(error)) }
  }
  async function act(work: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError('')
    try { await work() } catch (error) { if (active.current) setError(error instanceof Error ? error.message : String(error)) }
    finally { if (active.current) setBusy(false) }
  }
  async function install(files: SkillFile[]) {
    if (!files.length) return
    await api.installSkillPackage(identity, files, scope)
    await refresh()
  }
  function choose(directory: boolean) {
    if (!isTauri()) { (directory ? folder : upload).current?.click(); return }
    void act(async () => { const files = await pickSkillPackage(directory); if (files && active.current) await install(files) })
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose() }}><Dialog className="skills-manage-modal p-0" aria-label={C.skills}>
    <div className="skills-manage-head"><div><h2 className="skills-manage-title">{C.skills}</h2><p className="skills-manage-hint">安装和管理研究技能，在输入框的 + 菜单中选择使用。</p></div><Button variant="ghost" aria-label={C.close} disabled={busy} onClick={onClose}><CloseIcon size={18} /></Button></div>
    <div className="skills-manage-toolbar">
      <div className="skills-scope-seg" role="group" aria-label={C.skillScope}>
        <Button className={scope === 'user' ? 'is-on' : ''} variant="ghost" disabled={busy} onClick={() => setScope('user')}>全局技能</Button>
        <Button className={scope === 'project' ? 'is-on' : ''} variant="ghost" disabled={busy} onClick={() => setScope('project')}>当前项目</Button>
      </div>
      <DropdownMenu><DropdownMenu.Trigger render={<Button className="skills-add-btn" variant="secondary" disabled={busy} />}><PlusIcon size={18} />添加<ChevronDownIcon size={16} /></DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" sideOffset={6} className="glass-card"><DropdownMenu.Item onClick={() => choose(true)}>添加技能文件夹</DropdownMenu.Item><DropdownMenu.Item onClick={() => choose(false)}>添加 Markdown</DropdownMenu.Item></DropdownMenu.Content>
      </DropdownMenu>
    </div>
    {error && <p role="alert" className="skills-manage-err">{error}</p>}
    <ul className="skills-manage-list">{skills.length === 0 && <li className="skills-manage-empty">{C.noSkills}</li>}{skills.map(skill => <li className="skills-manage-row" key={`${skill.layer}:${skill.name}`}>
      <SkillIcon name={skill.name} size={18} /><div className="skills-manage-meta"><span className="skills-manage-name">{skill.name}</span><span className="skills-manage-desc">{skill.description}</span><span className="skills-manage-layer">{skill.layer === 'source' ? '项目来源' : skill.layer === 'project' ? C.projectScope : C.userScope}</span></div>
      {skill.layer !== 'source' && <Button className="skills-uninstall" variant="ghost" aria-label={`${C.remove} ${skill.name}`} disabled={busy} onClick={() => void act(async () => { await api.removeSkill(identity, skill.name, skill.layer as 'project' | 'user'); await refresh() })}><TrashIcon size={16} /></Button>}
    </li>)}</ul>
    <input ref={upload} hidden type="file" accept=".md" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void act(() => install(browserSkillFiles(files, false))) }} />
    <input ref={element => { folder.current = element; element?.setAttribute('webkitdirectory', '') }} hidden type="file" multiple onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void act(() => install(browserSkillFiles(files, true))) }} />
  </Dialog></Dialog.Root>
}
