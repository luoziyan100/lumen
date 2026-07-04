/**
 * 设置弹窗:左导航(模型 / 提示词)。
 * 模型页两级导航:第一屏 = 供应商大卡片列表(名称+URL+启用态);点卡片 → 第二屏该配置的表单(可返回)。
 * key 纪律:输入留空 = 保持;服务端只回掩码。保存/启用即热生效。
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import type { AgentClient, PublicSettings, PublicModelProfile } from '../agent-client'
import { SYSTEM_PROMPT_COPY } from '../settingsCopy'

type Pane = 'model' | 'prompt'
type ModelView = 'list' | 'edit'

const EMPTY_FORM = { name: '', provider: 'openai' as 'anthropic' | 'openai', baseUrl: '', apiKey: '', model: '' }

export function SettingsModal({ client, onClose }: { client: AgentClient; onClose: () => void }) {
  const [pane, setPane] = useState<Pane>('model')
  const [view, setView] = useState<ModelView>('list')
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [saved, setSaved] = useState('')

  const [selId, setSelId] = useState<string | null>(null) // null = 新建
  const [form, setForm] = useState(EMPTY_FORM)
  const [instructions, setInstructions] = useState('')

  useEffect(() => {
    client.getSettings().then((s) => {
      setSettings(s)
      setInstructions(s.userInstructions)
    })
  }, [client])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function flash(text: string): void {
    setSaved(text)
    setTimeout(() => setSaved(''), 1800)
  }

  function openEditor(p: PublicModelProfile | null): void {
    setSelId(p?.id ?? null)
    setForm(p
      ? { name: p.name, provider: p.provider, baseUrl: p.baseUrl, apiKey: '', model: p.model }
      : EMPTY_FORM)
    setView('edit')
  }

  async function saveProfile(e: FormEvent): Promise<void> {
    e.preventDefault()
    const next = await client.updateSettings({
      upsertProfile: {
        ...(selId ? { id: selId } : {}),
        name: form.name,
        provider: form.provider,
        baseUrl: form.baseUrl,
        model: form.model,
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
      },
    })
    setSettings(next)
    if (!selId) {
      const mine = next.profiles[next.profiles.length - 1]
      setSelId(mine?.id ?? null)
    }
    setForm((f) => ({ ...f, apiKey: '' }))
    flash('已保存')
  }

  async function activate(id: string): Promise<void> {
    const next = await client.updateSettings({ activeProfileId: id })
    setSettings(next)
    flash('已启用')
  }

  async function removeProfile(id: string): Promise<void> {
    const next = await client.updateSettings({ deleteProfileId: id })
    setSettings(next)
    setView('list')
    flash('已删除')
  }

  const selected = settings?.profiles.find((p) => p.id === selId)
  const isActive = (id: string): boolean => settings?.activeProfileId === id

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" role="dialog" aria-label="设置" onClick={(e) => e.stopPropagation()}>
        <nav className="settings-nav">
          <div className="settings-nav-title">设置</div>
          <button className={`settings-nav-item ${pane === 'model' ? 'is-active' : ''}`} onClick={() => { setPane('model'); setView('list') }}>模型</button>
          <button className={`settings-nav-item ${pane === 'prompt' ? 'is-active' : ''}`} onClick={() => setPane('prompt')}>{SYSTEM_PROMPT_COPY.nav}</button>
        </nav>

        <div className="settings-body">
          <button type="button" className="settings-close" aria-label="关闭" onClick={onClose}>×</button>

          {/* ---- 模型:第一屏 供应商卡片列表 ---- */}
          {pane === 'model' && settings && view === 'list' && (
            <>
              <div className="mp-head">
                <h2 className="settings-h">模型</h2>
                <Button type="button" variant="outline" size="sm" onClick={() => openEditor(null)}>＋ 添加模型</Button>
              </div>
              <div className="mpc-list">
                {settings.profiles.map((p) => (
                  <div key={p.id} className={`mpc-card ${isActive(p.id) ? 'is-active' : ''}`}>
                    <button className="mpc-main" onClick={() => openEditor(p)} title="点击配置">
                      <span className="mpc-name">{p.name}</span>
                      <span className="mpc-url">{p.baseUrl || (p.provider === 'anthropic' ? 'https://api.anthropic.com' : '未设置 Base URL')}</span>
                      <span className="mpc-model">{p.model}{p.hasApiKey ? '' : ' · 未配置 Key'}</span>
                    </button>
                    {isActive(p.id)
                      ? <span className="mp-active">启用中</span>
                      : <button className="mp-enable" onClick={() => activate(p.id)}>启用</button>}
                  </div>
                ))}
              </div>
              {saved && <span className="set-saved">{saved}</span>}
            </>
          )}

          {/* ---- 模型:第二屏 单配置表单 ---- */}
          {pane === 'model' && settings && view === 'edit' && (
            <form className="mp-editor" onSubmit={saveProfile}>
              <div className="mp-head">
                <button type="button" className="mp-back" onClick={() => setView('list')}>← 返回</button>
                <h2 className="settings-h mp-edit-title">{selId ? (selected?.name || '编辑配置') : '新建模型配置'}</h2>
                {selId && !isActive(selId) && (
                  <button type="button" className="mp-enable" onClick={() => activate(selId)}>启用</button>
                )}
                {selId && isActive(selId) && <span className="mp-active">启用中</span>}
              </div>
              <label className="set-row">
                <span className="set-label">名称</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="DeepSeek / Claude 官方 / GPT …" />
              </label>
              <label className="set-row">
                <span className="set-label">接口协议</span>
                <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value as 'anthropic' | 'openai' })}>
                  <option value="anthropic">Anthropic(官方 Claude API)</option>
                  <option value="openai">OpenAI 兼容(DeepSeek / 代理等)</option>
                </select>
              </label>
              <label className="set-row">
                <span className="set-label">Base URL</span>
                <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder={form.provider === 'openai' ? 'https://api.deepseek.com' : 'https://api.anthropic.com'} />
              </label>
              <label className="set-row">
                <span className="set-label">API Key</span>
                <input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={selected?.hasApiKey ? `${selected.apiKeyMasked}(留空保持不变)` : '粘贴该服务的 API Key'} autoComplete="off" />
              </label>
              <label className="set-row">
                <span className="set-label">模型 ID</span>
                <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="deepseek-chat / claude-sonnet-4-6 …" />
              </label>
              <p className="set-hint">每个配置的 Key 独立,不互相借用。保存/启用即刻生效于下一条消息。</p>
              <div className="settings-foot">
                {saved && <span className="set-saved">{saved}</span>}
                {selId && (settings.profiles.length > 1) && (
                  <Button type="button" variant="secondary-destructive" size="sm" onClick={() => removeProfile(selId)}>删除</Button>
                )}
                <Button type="submit" variant="primary" size="sm">保存</Button>
              </div>
            </form>
          )}

          {/* ---- 系统提示词 ---- */}
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
        </div>
      </div>
    </div>
  )
}
