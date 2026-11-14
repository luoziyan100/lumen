/**
 * [INPUT]: 共享Disclosure卷帘、脱敏设置DTO、模型档案更新API、原设置行样式、统一 icons、专家分页与外观面板
 * [OUTPUT]: Settings：模型、研究偏好、专家与外观四个分类；供应商卡、逐行模型ID及视觉/上下文/价格设置；专家写入中与保存中一样锁住分类与关闭
 * [POS]: 设置组合层；分类浏览与配置写入分离，外观本机即时应用；密钥只单向提交，失败留稿，服务裁定运行中修改边界
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
import type { useAppearance } from '../../appearance'
import { LumenApi, type PublicModelProfile, type PublicSettings, type SettingsPatch } from '../data/client.ts'

const emptyProfile = (): PublicModelProfile => ({ id: '', name: '', provider: 'openai', baseUrl: '', models: [''], activeModel: '', vision: 'auto', hasApiKey: false, apiKeyMasked: '' })
function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="set-row"><span className="set-label">{label}</span>{children}<span className="set-row-trail" aria-hidden /></div>
}

export function Settings({ api, onClose, appearance }: { api: LumenApi; onClose: () => void; appearance?: ReturnType<typeof useAppearance> }) {
  const { settings: C, common } = useT()
  const [pane, setPane] = useState<'model' | 'prompt' | 'agents' | 'preference'>('model')
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
    {pane === 'agents' && <AgentsPane api={api} onBusy={setAgentsBusy} />}
    {(pane === 'model' || pane === 'prompt') && !settings && <p className="set-hint">{common.loading}</p>}
    {pane === 'model' && settings && !editing && <><div className="mp-head"><h2 className="settings-h">{C.models}</h2><Button type="button" disabled={busy || configurationBusy} variant="outline" size="sm" onClick={() => { edit(emptyProfile()); setEditing(true) }}>{C.addModel}</Button></div><p className="set-hint">{configurationBusy ? C.busyHint : C.hint}</p><div className="mpc-list">{settings.profiles.map(item => <div className={`mpc-card glass-card ${settings.activeProfileId === item.id ? 'is-in-use' : ''}`} key={item.id}><button type="button" disabled={busy || configurationBusy} className="mpc-main" onClick={() => { edit(item); setEditing(true) }}><span className="mpc-name">{item.name}</span><span className="mpc-url">{item.baseUrl}</span><span className="mpc-model">{item.models.join(' · ') || C.noModelId}{!item.hasApiKey && C.noKey}</span></button><div className="mpc-aside"><div className="mpc-aside-idle">{settings.activeProfileId === item.id && <span className="mp-active">{C.inUse}</span>}</div><div className="mpc-aside-hot">{settings.activeProfileId !== item.id && <button type="button" disabled={busy} className="mpc-act mpc-act-enable" onClick={() => void save({ activeProfileId: item.id })}><PlayIcon size={ICON_SM} /><span>{C.enable}</span></button>}{settings.profiles.length > 1 && <button type="button" disabled={busy || configurationBusy} className="mpc-act mpc-act-danger" aria-label={C.deleteProfile(item.name)} onClick={() => void save({ deleteProfileId: item.id })}><TrashIcon size={16} /></button>}</div></div></div>)}</div></>}
    {pane === 'model' && editing && <form className="mp-editor" onSubmit={event => { event.preventDefault(); saveProfile() }}>
      <div className="mp-head"><button type="button" disabled={busy || configurationBusy} className="mp-back" onClick={() => setEditing(false)}><BackIcon size={16} />{common.back}</button><h2 className="settings-h mp-edit-title">{profile.id ? profile.name || C.editProfile : C.newProfile}</h2></div>
      <SettingRow label={C.name}><input className="set-control" aria-label={C.profileName} disabled={busy || configurationBusy} value={profile.name} placeholder={C.namePlaceholder} onChange={event => setProfile({ ...profile, name: event.target.value })} /></SettingRow>
      <SettingRow label={C.provider}><Select aria-label={C.provider} size="sm" className="set-control min-w-0" disabled={busy || configurationBusy} value={profile.provider} items={C.providers} onValueChange={value => setProfile({ ...profile, provider: value === 'anthropic' ? 'anthropic' : 'openai' })} /></SettingRow>
      <SettingRow label="Base URL"><input className="set-control" aria-label="Base URL" disabled={busy || configurationBusy} value={profile.baseUrl} placeholder={profile.provider === 'openai' ? 'https://api.deepseek.com' : 'https://api.anthropic.com'} onChange={event => setProfile({ ...profile, baseUrl: event.target.value })} /></SettingRow>
      <SettingRow label="API Key"><input className={`set-control${masked ? ' set-key-masked' : ''}`} type={masked ? 'text' : 'password'} aria-label="API Key" disabled={busy || configurationBusy} autoComplete="off" spellCheck={false} readOnly={masked} placeholder={profile.hasApiKey ? C.keyKept : C.enterKey} value={masked ? profile.apiKeyMasked : key} onFocus={() => setKeyFocused(true)} onBlur={() => setKeyFocused(false)} onChange={event => setKey(event.target.value)} /></SettingRow>
      <SettingRow label={C.vision}><Select aria-label={C.vision} size="sm" className="set-control min-w-0" disabled={busy || configurationBusy} value={profile.vision} items={{ auto: C.auto, on: common.on, off: common.off }} onValueChange={value => setProfile({ ...profile, vision: value === 'on' || value === 'off' ? value : 'auto' })} /></SettingRow>
      {profile.models.map((model, index) => <div key={index} className="set-row set-row-model"><span className="set-label">{index === 0 ? C.modelId : ''}</span><input className="set-control" aria-label={C.modelIdN(index + 1)} disabled={busy || configurationBusy} ref={element => { modelInputs.current[index] = element }} value={model} placeholder="deepseek-chat / claude-sonnet-4-6 …" onChange={event => setProfile({ ...profile, models: profile.models.map((value, row) => row === index ? event.target.value : value) })} /><span className="set-row-trail">{profile.models.length > 1 && <button type="button" disabled={busy || configurationBusy} className="set-row-icon" aria-label={C.removeModelId} onClick={() => setProfile({ ...profile, models: profile.models.filter((_, row) => row !== index) })}><MinusIcon size={16} /></button>}{index === profile.models.length - 1 && <button type="button" disabled={busy || configurationBusy} className="set-row-icon set-row-add" aria-label={C.addModelId} onClick={addModel}><PlusIcon size={16} /></button>}</span></div>)}
      <p className="set-hint">{C.modelsHint}</p>
      <SettingRow label={C.contextWindow}><input className="set-control" aria-label={C.contextWindow} disabled={busy || configurationBusy} type="number" min={1} value={profile.contextWindow ?? ''} onChange={event => setProfile({ ...profile, contextWindow: event.target.value ? Number(event.target.value) : undefined })} /></SettingRow>
      <Disclosure className="mw-pricing" summary={C.pricing}><p className="set-hint">{C.pricingHint}</p>{profile.pricing ? <>
        <SettingRow label={C.pricingModel}><input className="set-control" aria-label={C.pricingModel} disabled={busy || configurationBusy} value={profile.pricing.model} onChange={event => setProfile({ ...profile, pricing: { ...profile.pricing!, model: event.target.value } })} /></SettingRow>
        {(['inputUsdPerMillion', 'outputUsdPerMillion'] as const).map((field, index) => <SettingRow key={field} label={index ? C.outputPrice : C.inputPrice}><input className="set-control" aria-label={index ? C.outputPriceLabel : C.inputPriceLabel} disabled={busy || configurationBusy} type="number" min={0} step="any" value={profile.pricing![field]} onChange={event => setProfile({ ...profile, pricing: { ...profile.pricing!, [field]: Number(event.target.value) } })} /></SettingRow>)}<Button type="button" disabled={busy || configurationBusy} variant="ghost" onClick={() => setProfile({ ...profile, pricing: undefined })}>{C.clearPricing}</Button></> : <Button type="button" disabled={busy || configurationBusy} variant="ghost" onClick={() => setProfile({ ...profile, pricing: { model: profile.activeModel || profile.models.find(value => value.trim())?.trim() || '', inputUsdPerMillion: 0, outputUsdPerMillion: 0 } })}>{C.setPricing}</Button>}</Disclosure>
      <div className="settings-foot">{profile.id && settings && settings.profiles.length > 1 && <Button type="button" variant="secondary-destructive" size="sm" disabled={busy || configurationBusy} onClick={() => void save({ deleteProfileId: profile.id })}>{common.delete}</Button>}<Button type="submit" variant="primary" size="sm" disabled={busy || configurationBusy || !profile.models.some(value => value.trim())}>{common.save}</Button></div>
    </form>}
    {pane === 'prompt' && settings && <form className="mp-editor" onSubmit={event => { event.preventDefault(); void save({ userInstructions: instructions }) }}><h2 className="settings-h">{C.instructions}</h2><p className="set-hint">{C.instructions}</p><textarea className="set-textarea" aria-label={C.instructions} disabled={busy || configurationBusy} rows={10} value={instructions} onChange={event => setInstructions(event.target.value)} /><div className="settings-foot"><Button type="submit" variant="primary" size="sm" disabled={busy || configurationBusy}>{C.saveInstructions}</Button></div></form>}
    {saved && <p className="set-saved" role="status">{common.saved}</p>}{error && <p className="mw-error" role="alert">{error}</p>}
    </section>
  </Dialog></Dialog.Root>
}
