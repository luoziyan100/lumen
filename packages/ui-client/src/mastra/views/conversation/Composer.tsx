/**
 * [INPUT]: 固定身份的 SessionFeed/欢迎态按需准备、会话草稿、原生运行状态与问询插槽，原BorderBeam视觉与统一图标入口
 * [OUTPUT]: Composer：完整输入卡、模型菜单与互斥发送/停止、坞上方问询；新草稿聚焦输入，可停止期间保留草稿且不提交；连接中的发送显示「连上后发送」，连上即发
 * [POS]: 视图卸载仅释放订阅；草稿、提交快照和失败材料由同会话 draft 保留
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useT, errorText } from '../../../i18n/index.ts'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { BorderBeam } from 'border-beam'
import { Button } from '@cloudflare/kumo/components/button'
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown'
import { ICON_SM, PlusIcon, SendIcon, StopIcon, ChevronDownIcon, ArrowDownIcon, PaperclipGlyph, SkillGlyph, BriefcaseGlyph, skillGlyphForName, FileTypeIcon, CloseIcon, CheckIcon, GearGlyph } from '../../../components/icons'
import { LumenApi, type Identity, type PublicSettings, type SkillInfo } from '../../data/client.ts'
import type { SessionFeed } from '../../data/feed.ts'
import { Skills } from '../Skills'
import { Attachments } from './Attachments'
import { conversationDraft } from './draft.ts'
import { useSkillSlash } from './Slash'

export function Composer({ api, identity, feed, connected, canStop, queued, onActivity, onSettings, model, onJumpToLatest, activePath, onClearActivePath, prompt, prepareSession }: {
  api: LumenApi; identity: Identity; feed: SessionFeed | null; connected: boolean; canStop: boolean; queued: number; onActivity: () => void; onSettings?: () => void; model?: string; onJumpToLatest?: () => void; activePath?: string | null; onClearActivePath?: () => void
  prompt?: ReactNode; prepareSession?: () => Promise<SessionFeed>
}) {
  const { chat: C, common } = useT()
  const store = conversationDraft(identity)
  const { draft, files, uploading, pending, failed } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [error, setError] = useState(''), [stopping, setStopping] = useState(false), [skillsOpen, setSkillsOpen] = useState(false)
  const [models, setModels] = useState<PublicSettings | null>(null)
  const [skills, setSkills] = useState<SkillInfo[] | null>(null), [choosingSkill, setChoosingSkill] = useState(false)
  const skillRequest = useRef(0), skillSelection = useRef(false)
  const [preparingSend, setPreparingSend] = useState(false)
  const card = useRef<HTMLFormElement>(null), textarea = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 168)}px`
  }, [draft])
  const slash = useSkillSlash({ api, identity, text: draft, anchor: card, prepareSession, onManage: () => { void manageSkills() } })
  useEffect(() => {
    let active = true
    void api.settings().then(value => { if (active) { setModels(value); if (!value.busy) setError('') } }).catch(() => {})
    return () => { active = false }
  }, [api, connected, model, canStop])
  const selectedModel = models?.profiles.find(profile => profile.id === models.activeProfileId)?.activeModel
  useEffect(() => {
    if (!models?.busy) return
    let active = true
    const refresh = () => { void api.settings().then(value => { if (active) { setModels(value); if (!value.busy) setError('') } }).catch(() => {}) }
    const timer = window.setInterval(refresh, 2000)
    return () => { active = false; window.clearInterval(timer) }
  }, [api, models?.busy])
  async function changeModel(profileId: string, activeModel: string) {
    try { setModels(await api.updateSettings({ activeProfileId: profileId, upsertProfile: { id: profileId, activeModel } })); await feed?.refresh() } catch (error) { setError(errorText(error)) }
  }
  const fileInput = useRef<HTMLInputElement>(null), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; skillRequest.current++ } }, [])
  async function refreshSkills() {
    const request = ++skillRequest.current; setSkills(null); setError('')
    try { await prepareSession?.(); const result = await api.skills(identity); if (alive.current && request === skillRequest.current) setSkills(result.skills) }
    catch (error) { if (alive.current && request === skillRequest.current) { setSkills([]); setError(errorText(error)) } }
  }
  async function activateSkill(name: string) {
    if (skillSelection.current) return
    skillSelection.current = true; setChoosingSkill(true); setError('')
    try {
      await prepareSession?.()
      const result = await api.activateSkill(identity, name)
      store.appendText(result.content)
      if (alive.current) textarea.current?.focus()
    } catch (error) { if (alive.current) setError(errorText(error)) }
    finally { skillSelection.current = false; if (alive.current) setChoosingSkill(false) }
  }
  async function manageSkills() {
    try { await prepareSession?.(); if (alive.current) setSkillsOpen(true) }
    catch (error) { if (alive.current) setError(errorText(error)) }
  }
  // ---- A send while the conversation reconnects waits for the connection instead of vanishing ----
  const [sendOnConnect, setSendOnConnect] = useState(false)
  const ready = connected && Boolean(feed || prepareSession)
  useEffect(() => {
    if (!sendOnConnect || !ready) return
    setSendOnConnect(false)
    send()
  }, [sendOnConnect, ready])
  function send() {
    if (canStop) return
    if (!ready) { if (draft.trim() || files.length) setSendOnConnect(true); return }
    setError('')
    const target = feed ?? (async () => {
      setPreparingSend(true)
      try { return await prepareSession!() }
      finally { if (alive.current) setPreparingSend(false) }
    })
    void store.send(api, target, activePath).then(sent => { if (sent) onActivity() })
  }
  return <div className="composer-dock mw-composer-dock">
    {prompt}
    {onJumpToLatest && <button className="jump-latest" type="button" onClick={onJumpToLatest} aria-label={C.jumpLatest} title={C.jumpLatest}><ArrowDownIcon /></button>}
    {failed.map(item => <div className="mw-submit-error" role="alert" key={item.id}><strong>{C.sendFailed}</strong><p>{item.error}</p><pre>{item.content}</pre>{item.files.length > 0 && <p>{item.files.map(file => file.name).join(common.listSeparator)}</p>}<Button variant="ghost" onClick={() => store.restore(item.id)}>{C.restoreDraft}</Button></div>)}
    {error && <p role="alert" className="mw-error">{error}</p>}
    <BorderBeam className="composer-beam" size="md" theme="dark" colorVariant="colorful" borderRadius={24} strength={1} brightness={1.65} saturation={1.4} duration={2.8}>
    <form ref={card} className="composer-card mw-composer" onSubmit={event => { event.preventDefault(); send() }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); store.addFiles(Array.from(event.dataTransfer.files)) }}>
      <div className="composer-top">
        <DropdownMenu>
          <DropdownMenu.Trigger render={<button className="composer-at liquid-glass" type="button" title={C.add} aria-label={C.add} disabled={uploading || choosingSkill} />}><PlusIcon /></DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" side="top" sideOffset={6} className="composer-plus-menu glass-card">
            <DropdownMenu.Item icon={PaperclipGlyph} onClick={() => fileInput.current?.click()}>{C.addFile}</DropdownMenu.Item>
            <DropdownMenu.Sub onOpenChange={open => { if (open) void refreshSkills() }}><DropdownMenu.SubTrigger icon={SkillGlyph}>{C.skills}</DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent align="start" side="right" sideOffset={4} className="glass-card">
                {!skills?.length && <div className="composer-model-menu-empty">{skills === null ? C.readingSkills : C.noSkills}</div>}
                {skills?.map(skill => <DropdownMenu.Item key={`${skill.layer}:${skill.name}`} icon={skillGlyphForName(skill.name)} onClick={() => void activateSkill(skill.name)}>{skill.name}</DropdownMenu.Item>)}
                <DropdownMenu.Item icon={BriefcaseGlyph} onClick={() => { void manageSkills() }}>{C.manageSkills}</DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>
      {files.length > 0 && <Attachments files={files} onRemove={index => store.removeFile(index)} />}
      {activePath && <div className="active-doc-row"><span className="active-doc-chip" title={activePath}><FileTypeIcon name={activePath} size={ICON_SM} /><span className="active-doc-label">{C.activeDoc}</span><span className="active-doc-path">{activePath.split('/').pop()}</span>{onClearActivePath && <button type="button" className="active-doc-clear" aria-label={C.clearActiveDoc} onClick={onClearActivePath}><CloseIcon size={ICON_SM} /></button>}</span></div>}
      <textarea ref={textarea} autoFocus={!!prepareSession} className="composer-input" rows={2} aria-label={C.placeholder} placeholder={C.placeholder} value={draft} onChange={event => store.setText(event.target.value)} onPaste={event => { const pasted = Array.from(event.clipboardData.files); if (pasted.length) { event.preventDefault(); store.addFiles(pasted) } }} onKeyDown={event => { if (slash.onKeyDown(event)) return; if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send() } }} />
      <input ref={fileInput} type="file" multiple hidden onChange={event => { store.addFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />
      <footer className="composer-foot"><div className="composer-pills">
        <DropdownMenu onOpenChange={open => { if (open) void api.settings().then(value => { if (alive.current) { setModels(value); setError('') } }).catch(() => {}) }}><DropdownMenu.Trigger render={<button className="composer-pill liquid-glass" type="button" aria-label={C.pickModel} title={C.pickModel} />}><span className="composer-pill-label">{selectedModel || C.pickModel}</span><ChevronDownIcon /></DropdownMenu.Trigger><DropdownMenu.Content align="start" side="top" sideOffset={6} className="composer-model-menu glass-card">{models?.profiles.flatMap(profile => profile.models.map(model => <DropdownMenu.Item key={`${profile.id}:${model}`} onClick={() => void changeModel(profile.id, model)}>{models.activeProfileId === profile.id && selectedModel === model && <CheckIcon />}<span>{model}</span><span className="composer-model-menu-meta">{profile.name}</span></DropdownMenu.Item>))}{onSettings && <DropdownMenu.Item icon={GearGlyph} onClick={onSettings}>{C.manageModels}</DropdownMenu.Item>}</DropdownMenu.Content></DropdownMenu></div>
        <span className="composer-spacer" />
        {(uploading || queued > 0 || pending > 0 || preparingSend || sendOnConnect) && <small role="status">{uploading ? C.uploading : sendOnConnect ? C.sendOnConnect : queued > 0 ? `${C.queuedMessages} ${queued}` : C.submitting}</small>}
        {canStop
          ? <button type="button" className="composer-btn composer-btn-stop liquid-glass" title={stopping ? C.stopping : C.stop} aria-label={stopping ? C.stopping : C.stop} disabled={stopping} onClick={() => { setStopping(true); void api.stop(identity).catch(error => { if (alive.current) setError(errorText(error)) }).finally(() => { if (alive.current) setStopping(false) }) }}><StopIcon /></button>
          : <button className="composer-btn composer-btn-send liquid-glass" type="submit" aria-label={C.send} title={C.sendHint} disabled={uploading || preparingSend || sendOnConnect || (!draft.trim() && !files.length)}><SendIcon /></button>}
      </footer>
    </form></BorderBeam>
    {slash.menu}
    {skillsOpen && <Skills api={api} identity={identity} onClose={() => setSkillsOpen(false)} />}
  </div>
}
