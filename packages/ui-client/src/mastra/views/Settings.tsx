/**
 * [INPUT]: the shared Disclosure, redacted settings DTOs, the model-profile update API, the settings row styles, the shared icons, the specialists and appearance panes, the speech-habits table (S14)
 * [OUTPUT]: Settings: six sections — models, research preferences, specialists, appearance, speech habits and archived topics/conversations (Archived.tsx); provider cards, per-row model ids, vision/context/pricing settings; habits are view-and-delete only; a specialist write locks the sections and close like a save does
 * [POS]: the settings composition layer; browsing and writing stay separate, appearance applies locally at once; keys submit one-way and survive a failure as drafts, the service rules what may change while running
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Disclosure } from '../../components/disclosure/Disclosure'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Dialog } from '@cloudflare/kumo/components/dialog'
import { Select } from '@cloudflare/kumo/components/select'
import { useT, errorText } from '../../i18n/index.ts'
import { CloseIcon, BackIcon, MinusIcon, PlusIcon, PlayIcon, TrashIcon, ICON_SM } from '../../components/icons'
import { PreferencePane } from './chrome/Appearance'
import { AgentsPane } from '../agents/Agents'
import { ArchivedPane } from './Archived'
import type { useAppearance } from '../../appearance'
import { LumenApi, type Provider, type PublicModelProfile, type PublicSettings, type SettingsPatch, type SpeechHabit } from '../data/client.ts'

const BASE_URL_HINT: Record<Provider, string> = {
  openai: 'https://api.deepseek.com', anthropic: 'https://api.anthropic.com', google: 'https://generativelanguage.googleapis.com/v1beta',
}
const isProvider = (value: unknown): value is Provider => typeof value === 'string' && Object.hasOwn(BASE_URL_HINT, value)

const emptyProfile = (): PublicModelProfile => ({ id: '', name: '', provider: 'openai', baseUrl: '', models: [''], activeModel: '', vision: 'auto', hasApiKey: false, apiKeyMasked: '' })
function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="set-row"><span className="set-label">{label}</span>{children}<span className="set-row-trail" aria-hidden /></div>
}

/** S14 speech habits: counted only by the user's keeps and restores; this pane views and deletes. */
function HabitsPane({ api }: { api: LumenApi }) {
  const { common: { labelled, loading } } = useT(), S = useT().studio.sediment.habits
  const [items, setItems] = useState<SpeechHabit[] | null>(null), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void api.speechHabits().then(result => { if (active) setItems(result.items) }).catch(cause => { if (active) setError(errorText(cause)) })
    return () => { active = false }
  }, [api])
  if (error) return <p className="mw-error" role="alert">{error}</p>
  if (!items) return <p className="set-hint">{loading}</p>
  return <div className="habits-pane">
    <h2 className="settings-h">{S.title}</h2>
    {items.length === 0 ? <p className="set-hint">{S.empty}</p>
      : <ul className="habits-list">{items.map(habit => <li key={habit.fragment} className="habits-row">
        <span className="habits-fragment">{habit.fragment}</span>
        <span className="habits-counts">{habit.kept > 0 && S.kept(habit.kept)}{habit.kept > 0 && habit.restored > 0 && ' · '}{habit.restored > 0 && S.restored(habit.restored)}</span>
        <button type="button" className="habits-remove" aria-label={labelled(S.remove, habit.fragment)} title={S.remove} onClick={() => {
          void api.deleteSpeechHabit(habit.fragment).then(() => setItems(previous => previous?.filter(row => row.fragment !== habit.fragment) ?? null)).catch(cause => setError(errorText(cause)))
        }}><TrashIcon size={16} /></button>
      </li>)}</ul>}
  </div>
}

export function Settings({ api, onClose, appearance }: { api: LumenApi; onClose: () => void; appearance?: ReturnType<typeof useAppearance> }) {
  const { settings: C, common } = useT()
  const [pane, setPane] = useState<keyof typeof C.tabs>('model')
  const [editing, setEditing] = useState(false)
  const [settings, setSettings] = useState<PublicSettings | null>(null), [profile, setProfile] = useState<PublicModelProfile>(emptyProfile)
  const [key, setKey] = useState(''), [keyFocused, setKeyFocused] = useState(false), [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false), [agentsBusy, setAgentsBusy] = useState(false)
  const pending = useRef(false), modelInputs = useRef<(HTMLInputElement | null)[]>([])
  function edit(next: PublicModelProfile) { setProfile({ ...next, models: next.models.length ? [...next.models] : [''] }); setKey(''); setKeyFocused(false); setSaved(false); setError('') }
  useEffect(() => {
    let active = true
    void api.settings().then(result => { if (active) { setSettings(result); setInstructions(result.userInstructions) } }).catch(error => { if (active) setError(errorText(error)) })
    return () => { active = false }
  }, [api])
  useEffect(() => {
    if (!settings?.busy) return
    let active = true
    const refresh = () => { void api.settings().then(result => { if (active) { setSettings(result); setInstructions(result.userInstructions) } }).catch(() => {}) }
    const timer = window.setInterval(refresh, 2000)
    return () => { active = false; window.clearInterval(timer) }
  }, [api, settings?.busy])
  async function save(patch: SettingsPatch) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setSaved(false)
    try {
      const result = await api.updateSettings(patch)
      setSettings(result)
      if (patch.userInstructions !== undefined) setInstructions(result.userInstructions)
      if (patch.upsertProfile) {
        const next = result.profiles.find(item => item.id === profile.id) ?? result.profiles.find(item => !settings?.profiles.some(previous => previous.id === item.id))
        if (next) edit(next)
      }
      if (patch.deleteProfileId === profile.id) setEditing(false)
      setSaved(true)
    } catch (error) { setError(errorText(error)) }
    finally { pending.current = false; setBusy(false) }
  }
  function saveProfile() {
    const models = [...new Set(profile.models.map(value => value.trim()).filter(Boolean))]
    const activeModel = models.includes(profile.activeModel) ? profile.activeModel : models[0]
    if (!activeModel) return
    void save({ upsertProfile: { ...(profile.id ? { id: profile.id } : {}), name: profile.name.trim() || C.modelProfile, provider: profile.provider, baseUrl: profile.baseUrl.trim(), activeModel, models, ...(key.trim() ? { apiKey: key.trim() } : {}), vision: profile.vision, contextWindow: profile.contextWindow ?? null, pricing: profile.pricing ?? null } })
  }
  function addModel() {
    const index = profile.models.length
    setProfile({ ...profile, models: [...profile.models, ''] })
    requestAnimationFrame(() => modelInputs.current[index]?.focus())
  }
  const masked = profile.hasApiKey && !key && !keyFocused
  const configurationBusy = settings?.busy === true
  const locked = busy || agentsBusy
  return <Dialog.Root open onOpenChange={open => { if (!open && !pending.current && !agentsBusy) onClose() }}><Dialog className="settings-modal mw-settings p-0" aria-label={C.title}>
    <nav className="settings-nav" aria-label={C.nav}><div className="settings-nav-title">{C.title}</div>{(Object.entries(C.tabs) as [keyof typeof C.tabs, string][]).map(([id, label]) => <button type="button" disabled={locked} key={id} className={`settings-nav-item${pane === id ? ' is-active' : ''}`} onClick={() => { setPane(id); setSaved(false); setError(''); if (id === 'model') setEditing(false) }}>{label}</button>)}</nav>
    <section className="settings-body">
    <button type="button" className="settings-close" disabled={locked} onClick={onClose} aria-label={C.close}><CloseIcon size={18} /></button>
    {pane === 'preference' && (appearance ? <PreferencePane state={appearance.state} onChange={appearance.setAppearance} /> : <p className="set-hint">{C.appearanceUnavailable}</p>)}
    {pane === 'habits' && <HabitsPane api={api} />}
    {pane === 'archived' && <ArchivedPane api={api} />}
    {pane === 'agents' && <AgentsPane api={api} onBusy={setAgentsBusy} />}
    {(pane === 'model' || pane === 'prompt') && !settings && <p className="set-hint">{common.loading}</p>}
    {pane === 'model' && settings && !editing && <><div className="mp-head"><h2 className="settings-h">{C.models}</h2><Button type="button" disabled={busy || configurationBusy} variant="outline" size="sm" onClick={() => { edit(emptyProfile()); setEditing(true) }}>{C.addModel}</Button></div>{configurationBusy && <p className="set-hint">{C.busyHint}</p>}<div className="mpc-list">{settings.profiles.map(item => <div className={`mpc-card glass-card ${settings.activeProfileId === item.id ? 'is-in-use' : ''}`} key={item.id}><button type="button" disabled={busy || configurationBusy} className="mpc-main" onClick={() => { edit(item); setEditing(true) }}><span className="mpc-name">{item.name}</span><span className="mpc-url">{item.baseUrl}</span><span className="mpc-model">{item.models.join(' · ') || C.noModelId}{!item.hasApiKey && C.noKey}</span></button><div className="mpc-aside"><div className="mpc-aside-idle">{settings.activeProfileId === item.id && <span className="mp-active">{C.inUse}</span>}</div><div className="mpc-aside-hot">{settings.activeProfileId !== item.id && <button type="button" disabled={busy} className="mpc-act mpc-act-enable" onClick={() => void save({ activeProfileId: item.id })}><PlayIcon size={ICON_SM} /><span>{C.enable}</span></button>}{settings.profiles.length > 1 && <button type="button" disabled={busy || configurationBusy} className="mpc-act mpc-act-danger" aria-label={C.deleteProfile(item.name)} onClick={() => void save({ deleteProfileId: item.id })}><TrashIcon size={16} /></button>}</div></div></div>)}</div></>}
    {pane === 'model' && editing && <form className="mp-editor" onSubmit={event => { event.preventDefault(); saveProfile() }}>
      <div className="mp-head"><button type="button" disabled={busy || configurationBusy} className="mp-back" onClick={() => setEditing(false)}><BackIcon size={16} />{common.back}</button><h2 className="settings-h mp-edit-title">{profile.id ? profile.name || C.editProfile : C.newProfile}</h2></div>
      <SettingRow label={C.name}><input className="set-control" aria-label={C.profileName} disabled={busy || configurationBusy} value={profile.name} placeholder={C.namePlaceholder} onChange={event => setProfile({ ...profile, name: event.target.value })} /></SettingRow>
      <SettingRow label={C.provider}><Select aria-label={C.provider} size="sm" className="set-control min-w-0" disabled={busy || configurationBusy} value={profile.provider} items={C.providers satisfies Record<Provider, string>} onValueChange={value => setProfile({ ...profile, provider: isProvider(value) ? value : 'openai' })} /></SettingRow>
      <SettingRow label="Base URL"><input className="set-control" aria-label="Base URL" disabled={busy || configurationBusy} value={profile.baseUrl} placeholder={BASE_URL_HINT[profile.provider]} onChange={event => setProfile({ ...profile, baseUrl: event.target.value })} /></SettingRow>
      <SettingRow label="API Key"><input className={`set-control${masked ? ' set-key-masked' : ''}`} type={masked ? 'text' : 'password'} aria-label="API Key" disabled={busy || configurationBusy} autoComplete="off" spellCheck={false} readOnly={masked} placeholder={profile.hasApiKey ? C.keyKept : C.enterKey} value={masked ? profile.apiKeyMasked : key} onFocus={() => setKeyFocused(true)} onBlur={() => setKeyFocused(false)} onChange={event => setKey(event.target.value)} /></SettingRow>
      <SettingRow label={C.vision}><Select aria-label={C.vision} size="sm" className="set-control min-w-0" disabled={busy || configurationBusy} value={profile.vision} items={{ auto: C.auto, on: common.on, off: common.off }} onValueChange={value => setProfile({ ...profile, vision: value === 'on' || value === 'off' ? value : 'auto' })} /></SettingRow>
      {profile.models.map((model, index) => <div key={index} className="set-row set-row-model"><span className="set-label">{index === 0 ? C.modelId : ''}</span><input className="set-control" aria-label={C.modelIdN(index + 1)} disabled={busy || configurationBusy} ref={element => { modelInputs.current[index] = element }} value={model} placeholder="deepseek-chat / claude-sonnet-4-6 …" onChange={event => setProfile({ ...profile, models: profile.models.map((value, row) => row === index ? event.target.value : value) })} /><span className="set-row-trail">{profile.models.length > 1 && <button type="button" disabled={busy || configurationBusy} className="set-row-icon" aria-label={C.removeModelId} onClick={() => setProfile({ ...profile, models: profile.models.filter((_, row) => row !== index) })}><MinusIcon size={16} /></button>}{index === profile.models.length - 1 && <button type="button" disabled={busy || configurationBusy} className="set-row-icon set-row-add" aria-label={C.addModelId} onClick={addModel}><PlusIcon size={16} /></button>}</span></div>)}
      <SettingRow label={C.contextWindow}><input className="set-control" aria-label={C.contextWindow} disabled={busy || configurationBusy} type="number" min={1} value={profile.contextWindow ?? ''} onChange={event => setProfile({ ...profile, contextWindow: event.target.value ? Number(event.target.value) : undefined })} /></SettingRow>
      <Disclosure className="mw-pricing" summary={C.pricing}>{profile.pricing ? <>
        <SettingRow label={C.pricingModel}><input className="set-control" aria-label={C.pricingModel} disabled={busy || configurationBusy} value={profile.pricing.model} onChange={event => setProfile({ ...profile, pricing: { ...profile.pricing!, model: event.target.value } })} /></SettingRow>
        {(['inputUsdPerMillion', 'outputUsdPerMillion'] as const).map((field, index) => <SettingRow key={field} label={index ? C.outputPrice : C.inputPrice}><input className="set-control" aria-label={index ? C.outputPriceLabel : C.inputPriceLabel} disabled={busy || configurationBusy} type="number" min={0} step="any" value={profile.pricing![field]} onChange={event => setProfile({ ...profile, pricing: { ...profile.pricing!, [field]: Number(event.target.value) } })} /></SettingRow>)}<Button type="button" disabled={busy || configurationBusy} variant="ghost" onClick={() => setProfile({ ...profile, pricing: undefined })}>{C.clearPricing}</Button></> : <Button type="button" disabled={busy || configurationBusy} variant="ghost" onClick={() => setProfile({ ...profile, pricing: { model: profile.activeModel || profile.models.find(value => value.trim())?.trim() || '', inputUsdPerMillion: 0, outputUsdPerMillion: 0 } })}>{C.setPricing}</Button>}</Disclosure>
      <div className="settings-foot">{profile.id && settings && settings.profiles.length > 1 && <Button type="button" variant="secondary-destructive" size="sm" disabled={busy || configurationBusy} onClick={() => void save({ deleteProfileId: profile.id })}>{common.delete}</Button>}<Button type="submit" variant="primary" size="sm" disabled={busy || configurationBusy || !profile.models.some(value => value.trim())}>{common.save}</Button></div>
    </form>}
    {pane === 'prompt' && settings && <form className="mp-editor" onSubmit={event => { event.preventDefault(); void save({ userInstructions: instructions }) }}><h2 className="settings-h">{C.instructions}</h2><p className="set-hint">{C.instructions}</p><textarea className="set-textarea" aria-label={C.instructions} disabled={busy || configurationBusy} rows={10} value={instructions} onChange={event => setInstructions(event.target.value)} /><div className="settings-foot"><Button type="submit" variant="primary" size="sm" disabled={busy || configurationBusy}>{C.saveInstructions}</Button></div></form>}
    {saved && <p className="set-saved" role="status">{common.saved}</p>}{error && <p className="mw-error" role="alert">{error}</p>}
    </section>
  </Dialog></Dialog.Root>
}
