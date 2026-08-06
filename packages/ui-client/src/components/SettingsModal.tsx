/**
 * 设置弹窗:左导航(模型 / 提示词 / 常驻)。
 * 模型页 = 接入目录:供应商卡 + 卡内多模型 ID;不负责「当前用哪个」(由 composer 芯片下拉决定)。
 * 列表区 mpc-list 自滚动(卡 flex:none,禁被挤扁)。全行统一 trail 对齐。
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Dialog } from '@cloudflare/kumo/components/dialog'
import { Select } from '@cloudflare/kumo/components/select'
import type { AgentClient, PublicSettings, PublicModelProfile } from '../agent-client'
import { BACKGROUND_SERVICE_COPY, SYSTEM_PROMPT_COPY } from '../settingsCopy'
import {
  isTauriShell,
  launchdInstall,
  launchdStatus,
  launchdUninstall,
  type LaunchdStatus,
} from '../ensureAgent'
import { BackIcon, CloseIcon, MinusIcon, PlayIcon, PlusIcon, TrashIcon } from './icons'

type Pane = 'model' | 'prompt' | 'service'
type ModelView = 'list' | 'edit'

type ProfileForm = {
  name: string
  provider: 'anthropic' | 'openai'
  baseUrl: string
  apiKey: string
  models: string[]
}

const EMPTY_FORM: ProfileForm = {
  name: '',
  provider: 'openai',
  baseUrl: '',
  apiKey: '',
  models: [''],
}

function modelsFromProfile(p: PublicModelProfile): string[] {
  if (p.models?.length) return [...p.models]
  if (p.model) return [p.model]
  return ['']
}

function profileModelsLabel(p: PublicModelProfile): string {
  const ids = (p.models?.length ? p.models : (p.model ? [p.model] : [])).map((s) => s.trim()).filter(Boolean)
  const base = ids.length ? ids.join(' · ') : '未填模型 ID'
  return p.hasApiKey ? base : `${base} · 未配置 Key`
}

export function SettingsModal({
  client,
  onClose,
  activeProfileId,
  onChanged,
}: {
  client: AgentClient
  onClose: () => void
  /** 仅作列表「使用中」示意;选用权在 composer */
  activeProfileId?: string | null
  /** 启用/删除后通知外层刷新芯片 */
  onChanged?: () => void
}) {
  const [pane, setPane] = useState<Pane>('model')
  const [view, setView] = useState<ModelView>('list')
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [saved, setSaved] = useState('')

  const [selId, setSelId] = useState<string | null>(null)
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM)
  /** Key 框聚焦中:闲时用掩码当可见值(WebKit password 常不显 placeholder) */
  const [keyFocused, setKeyFocused] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [launchd, setLaunchd] = useState<LaunchdStatus | null>(null)
  const [launchdBusy, setLaunchdBusy] = useState(false)
  const modelInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const tauri = isTauriShell()

  useEffect(() => {
    client.getSettings().then((s) => {
      setSettings(s)
      setInstructions(s.userInstructions)
    })
  }, [client])

  useEffect(() => {
    if (pane !== 'service') return
    void launchdStatus().then(setLaunchd)
  }, [pane])

  function flash(text: string): void {
    setSaved(text)
    setTimeout(() => setSaved(''), 1800)
  }

  function openEditor(p: PublicModelProfile | null): void {
    setSelId(p?.id ?? null)
    setKeyFocused(false)
    if (!p) {
      setForm(EMPTY_FORM)
    } else {
      setForm({
        name: p.name,
        provider: p.provider,
        baseUrl: p.baseUrl,
        apiKey: '',
        models: modelsFromProfile(p),
      })
    }
    setView('edit')
  }

  async function saveProfile(e: FormEvent): Promise<void> {
    e.preventDefault()
    const cleaned = form.models.map((s) => s.trim()).filter(Boolean)
    // 不在此处决定 activeModel:若已有仍属本列表则保留,否则取首项(供尚未在芯片选过时的回退)
    const prev = selId ? settings?.profiles.find((p) => p.id === selId) : undefined
    const keep = prev?.activeModel && cleaned.includes(prev.activeModel) ? prev.activeModel : (cleaned[0] ?? '')
    const next = await client.updateSettings({
      upsertProfile: {
        ...(selId ? { id: selId } : {}),
        name: form.name,
        provider: form.provider,
        baseUrl: form.baseUrl,
        models: cleaned,
        activeModel: keep,
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
      },
    })
    setSettings(next)
    const mine = selId
      ? next.profiles.find((p) => p.id === selId)
      : next.profiles[next.profiles.length - 1]
    if (mine) {
      setSelId(mine.id)
      const models = modelsFromProfile(mine)
      setKeyFocused(false)
      setForm({
        name: mine.name,
        provider: mine.provider,
        baseUrl: mine.baseUrl,
        apiKey: '',
        models: models.length ? models : [''],
      })
    }
    flash('已保存')
  }

  function addModelRow(): void {
    const nextIdx = form.models.length
    setForm((f) => ({ ...f, models: [...f.models, ''] }))
    requestAnimationFrame(() => {
      modelInputRefs.current[nextIdx]?.focus()
    })
  }

  function removeModelRow(index: number): void {
    setForm((f) => {
      if (f.models.length <= 1) return { ...f, models: [''] }
      return { ...f, models: f.models.filter((_, i) => i !== index) }
    })
  }

  async function activate(id: string): Promise<void> {
    const next = await client.updateSettings({ activeProfileId: id })
    setSettings(next)
    onChanged?.()
    flash('已启用')
  }

  async function removeProfile(id: string): Promise<void> {
    const next = await client.updateSettings({ deleteProfileId: id })
    setSettings(next)
    onChanged?.()
    setView('list')
    flash('已删除')
  }

  async function toggleLaunchd(on: boolean): Promise<void> {
    setLaunchdBusy(true)
    try {
      const next = on ? await launchdInstall() : await launchdUninstall()
      setLaunchd(next)
      flash(on ? '已开启常驻' : '已关闭常驻')
    } catch (e) {
      flash(e instanceof Error ? e.message : '操作失败')
    } finally {
      setLaunchdBusy(false)
    }
  }

  const selected = settings?.profiles.find((p) => p.id === selId)
  const inUseId = activeProfileId ?? settings?.activeProfileId ?? null
  // 已存 Key 且未在改:把掩码填进 value(text),避免 password+空值在 WebKit 里像「没保存」
  const keyShowingMask = Boolean(selected?.hasApiKey && !form.apiKey && !keyFocused)

  if (client.demo) return <DemoModelSettings client={client} onClose={onClose} />

  return (
    <Dialog.Root open onOpenChange={(o: boolean) => { if (!o) onClose() }}>
      <Dialog className="settings-modal p-0" aria-label="设置">
        <nav className="settings-nav">
          <div className="settings-nav-title">设置</div>
          <button className={`settings-nav-item ${pane === 'model' ? 'is-active' : ''}`} onClick={() => { setPane('model'); setView('list') }}>模型</button>
          <button className={`settings-nav-item ${pane === 'prompt' ? 'is-active' : ''}`} onClick={() => setPane('prompt')}>{SYSTEM_PROMPT_COPY.nav}</button>
          <button className={`settings-nav-item ${pane === 'service' ? 'is-active' : ''}`} onClick={() => setPane('service')}>{BACKGROUND_SERVICE_COPY.nav}</button>
        </nav>

        <div className="settings-body">
          <button type="button" className="settings-close" aria-label="关闭" onClick={onClose}><CloseIcon size={18} /></button>

          {pane === 'model' && !settings && <p className="set-hint">加载中…</p>}

          {pane === 'model' && settings && view === 'list' && (
            <>
              <div className="mp-head">
                <h2 className="settings-h">模型</h2>
                <Button type="button" variant="outline" size="sm" onClick={() => openEditor(null)}><PlusIcon size={16} />添加模型</Button>
              </div>
              <div className="mpc-list">
                {settings.profiles.map((p) => {
                  const inUse = inUseId === p.id
                  const canDelete = settings.profiles.length > 1
                  return (
                    <div key={p.id} className={`mpc-card glass-card ${inUse ? 'is-in-use' : ''}`}>
                      <button type="button" className="mpc-main" onClick={() => openEditor(p)} title="点击配置">
                        <span className="mpc-name">{p.name}</span>
                        <span className="mpc-url">{p.baseUrl || (p.provider === 'anthropic' ? 'https://api.anthropic.com' : '未设置 Base URL')}</span>
                        <span className="mpc-model">{profileModelsLabel(p)}</span>
                      </button>
                      <div className="mpc-aside">
                        <div className="mpc-aside-idle">
                          {inUse && <span className="mp-active">使用中</span>}
                        </div>
                        <div className="mpc-aside-hot">
                          {!inUse && (
                            <button
                              type="button"
                              className="mpc-act mpc-act-enable"
                              title="启用此供应商"
                              onClick={(e) => { e.stopPropagation(); void activate(p.id) }}
                            >
                              <PlayIcon size={14} />
                              <span>启用</span>
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className="mpc-act mpc-act-danger"
                              title="删除此供应商"
                              aria-label={`删除 ${p.name}`}
                              onClick={(e) => { e.stopPropagation(); void removeProfile(p.id) }}
                            >
                              <TrashIcon size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {saved && <span className="set-saved">{saved}</span>}
            </>
          )}

          {pane === 'model' && settings && view === 'edit' && (
            <form className="mp-editor" onSubmit={saveProfile}>
              <div className="mp-head">
                <button type="button" className="mp-back" onClick={() => setView('list')}><BackIcon size={16} />返回</button>
                <h2 className="settings-h mp-edit-title">{selId ? (selected?.name || '编辑配置') : '新建模型配置'}</h2>
              </div>

              <div className="set-row">
                <span className="set-label">名称</span>
                <input className="set-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="DeepSeek / Claude 官方 / GPT …" />
                <span className="set-row-trail" aria-hidden />
              </div>
              <div className="set-row">
                <span className="set-label">接口协议</span>
                <Select
                  aria-label="接口协议"
                  size="sm"
                  className="set-control min-w-0"
                  value={form.provider}
                  onValueChange={(v) => setForm({ ...form, provider: (v ?? 'openai') as 'anthropic' | 'openai' })}
                  items={{ anthropic: 'Anthropic(官方 Claude API)', openai: 'OpenAI 兼容(DeepSeek / 代理等)' }}
                />
                <span className="set-row-trail" aria-hidden />
              </div>
              <div className="set-row">
                <span className="set-label">Base URL</span>
                <input className="set-control" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder={form.provider === 'openai' ? 'https://api.deepseek.com' : 'https://api.anthropic.com'} />
                <span className="set-row-trail" aria-hidden />
              </div>
              <div className="set-row">
                <span className="set-label">API Key</span>
                <input
                  className={`set-control${keyShowingMask ? ' set-key-masked' : ''}`}
                  type={keyShowingMask ? 'text' : 'password'}
                  value={keyShowingMask ? (selected?.apiKeyMasked ?? '') : form.apiKey}
                  onFocus={() => setKeyFocused(true)}
                  onBlur={() => setKeyFocused(false)}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder={selected?.hasApiKey ? '留空保持不变' : '粘贴该服务的 API Key'}
                  autoComplete="off"
                  spellCheck={false}
                  readOnly={keyShowingMask}
                />
                <span className="set-row-trail" aria-hidden />
              </div>

              {form.models.map((mid, i) => {
                const isLast = i === form.models.length - 1
                return (
                  <div key={i} className="set-row set-row-model">
                    <span className="set-label">{i === 0 ? '模型 ID' : ''}</span>
                    <input
                      className="set-control"
                      ref={(el) => { modelInputRefs.current[i] = el }}
                      value={mid}
                      onChange={(e) => {
                        const models = [...form.models]
                        models[i] = e.target.value
                        setForm({ ...form, models })
                      }}
                      placeholder="deepseek-chat / claude-sonnet-4-6 …"
                    />
                    <span className="set-row-trail">
                      {form.models.length > 1 && (
                        <button
                          type="button"
                          className="set-row-icon"
                          title="移除此模型 ID"
                          aria-label="移除此模型 ID"
                          onClick={() => removeModelRow(i)}
                        >
                          <MinusIcon size={16} />
                        </button>
                      )}
                      {isLast && (
                        <button
                          type="button"
                          className="set-row-icon set-row-add"
                          title="再加一个模型 ID"
                          aria-label="再加一个模型 ID"
                          onClick={addModelRow}
                        >
                          <PlusIcon size={16} />
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}

              <p className="set-hint">此处只登记可接入的模型;对话里用哪个在输入框旁芯片选择。Key 不跨卡借用。</p>
              <div className="settings-foot">
                {saved && <span className="set-saved">{saved}</span>}
                {selId && (settings.profiles.length > 1) && (
                  <Button type="button" variant="secondary-destructive" size="sm" onClick={() => removeProfile(selId)}>删除</Button>
                )}
                <Button type="submit" variant="primary" size="sm">保存</Button>
              </div>
            </form>
          )}

          {pane === 'prompt' && (
            <form
              className="mp-editor"
              onSubmit={async (e) => {
                e.preventDefault()
                const next = await client.updateSettings({ userInstructions: instructions })
                setSettings(next)
                flash('已保存')
              }}
            >
              <h2 className="settings-h">{SYSTEM_PROMPT_COPY.title}</h2>
              <p className="set-hint">{SYSTEM_PROMPT_COPY.hint}</p>
              <textarea
                className="set-textarea"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={SYSTEM_PROMPT_COPY.placeholder}
                rows={10}
              />
              <div className="settings-foot">
                {saved && <span className="set-saved">{saved}</span>}
                <Button type="submit" variant="primary" size="sm">保存</Button>
              </div>
            </form>
          )}

          {pane === 'service' && (
            <div className="mp-editor">
              <h2 className="settings-h">{BACKGROUND_SERVICE_COPY.title}</h2>
              <p className="set-hint">{BACKGROUND_SERVICE_COPY.hint}</p>
              {!tauri && <p className="set-hint">{BACKGROUND_SERVICE_COPY.unavailable}</p>}
              {tauri && (
                <>
                  <p className="set-hint">
                    {launchd?.plistInstalled ? BACKGROUND_SERVICE_COPY.on : BACKGROUND_SERVICE_COPY.off}
                    {' · '}
                    {launchd?.portfileAlive
                      ? `${BACKGROUND_SERVICE_COPY.alive}${launchd.port ? ` (:${launchd.port})` : ''}`
                      : BACKGROUND_SERVICE_COPY.dead}
                  </p>
                  <div className="settings-foot">
                    {saved && <span className="set-saved">{saved}</span>}
                    {launchd?.plistInstalled ? (
                      <Button type="button" variant="secondary-destructive" size="sm" disabled={launchdBusy} onClick={() => { void toggleLaunchd(false) }}>
                        {BACKGROUND_SERVICE_COPY.disable}
                      </Button>
                    ) : (
                      <Button type="button" variant="primary" size="sm" disabled={launchdBusy} onClick={() => { void toggleLaunchd(true) }}>
                        {BACKGROUND_SERVICE_COPY.enable}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </Dialog>
    </Dialog.Root>
  )
}

const DEMO_MODEL_KEY = 'lumen:demoModel'

function DemoModelSettings({ client, onClose }: { client: AgentClient; onClose: () => void }) {
  const [form, setForm] = useState(() => {
    const base = { provider: 'openai' as 'anthropic' | 'openai', baseUrl: '', apiKey: '', model: '' }
    try { return { ...base, ...(JSON.parse(sessionStorage.getItem(DEMO_MODEL_KEY) || '{}') as Partial<typeof base>) } }
    catch { return base }
  })
  const [saved, setSaved] = useState('')

  function save(e: FormEvent): void {
    e.preventDefault()
    const cfg = { provider: form.provider, model: form.model.trim(), apiKey: form.apiKey.trim(), baseUrl: form.baseUrl.trim() || undefined }
    sessionStorage.setItem(DEMO_MODEL_KEY, JSON.stringify(cfg))
    client.setModel(cfg)
    setSaved('已保存并启用')
    setTimeout(() => setSaved(''), 1800)
  }

  return (
    <Dialog.Root open onOpenChange={(o: boolean) => { if (!o) onClose() }}>
      <Dialog className="settings-modal p-0" aria-label="设置">
        <div className="settings-body">
          <button type="button" className="settings-close" aria-label="关闭" onClick={onClose}><CloseIcon size={18} /></button>
          <form className="mp-editor" onSubmit={save}>
            <h2 className="settings-h">模型 · 自带 Key</h2>
            <p className="set-hint">你的 API Key 只临时存在<strong>你自己浏览器的本次会话</strong>里(关闭标签页即清除),聊天时随请求直连模型厂商——本站服务器不保存、不经手你的 Key。</p>
            <div className="set-row">
              <span className="set-label">接口协议</span>
              <Select aria-label="接口协议" size="sm" className="set-control min-w-0" value={form.provider}
                onValueChange={(v) => setForm({ ...form, provider: (v ?? 'openai') as 'anthropic' | 'openai' })}
                items={{ anthropic: 'Anthropic(官方 Claude)', openai: 'OpenAI 兼容(DeepSeek / 代理)' }} />
              <span className="set-row-trail" aria-hidden />
            </div>
            <div className="set-row">
              <span className="set-label">Base URL</span>
              <input className="set-control" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder={form.provider === 'openai' ? 'https://api.deepseek.com' : 'https://api.anthropic.com'} />
              <span className="set-row-trail" aria-hidden />
            </div>
            <div className="set-row">
              <span className="set-label">API Key</span>
              <input className="set-control" type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="粘贴你自己的 API Key" autoComplete="off" />
              <span className="set-row-trail" aria-hidden />
            </div>
            <div className="set-row">
              <span className="set-label">模型 ID</span>
              <input className="set-control" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="deepseek-chat / claude-sonnet-4-6 …" />
              <span className="set-row-trail" aria-hidden />
            </div>
            <div className="settings-foot">
              {saved && <span className="set-saved">{saved}</span>}
              <Button type="submit" variant="primary" size="sm">保存并启用</Button>
            </div>
          </form>
        </div>
      </Dialog>
    </Dialog.Root>
  )
}
