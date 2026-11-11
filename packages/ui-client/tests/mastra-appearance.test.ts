/**
 * [INPUT]: 真实设置窗口/外观面板、useAppearance、明暗基线、服务忙碌 DTO 与媒体查询事件
 * [OUTPUT]: 真实明暗/材质切换恢复、三个设置分类且无预算入口、忙碌时本机换肤与配置写入隔离、模型增减/凭证保留证据
 * [POS]: 设置与外观的用户路径回归；验证导航、服务配置与本机偏好各自的边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createElement, act } from 'react'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'NodeFilter', 'localStorage', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLDialogElement', 'DocumentFragment', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const subscribers = new Set<() => void>()
let dark = true
Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: dark, addEventListener(_name: string, callback: () => void) { subscribers.add(callback) }, removeEventListener(_name: string, callback: () => void) { subscribers.delete(callback) } }) })
register('./helpers/tsx-loader.mjs', import.meta.url)
const { createRoot } = await import('react-dom/client')
const { useAppearance, APPEARANCE_STORAGE_KEY, listSkins, DARK_BASELINE, LIGHT_BASELINE } = await import('../src/appearance/index.ts')
const { PreferencePane } = await import('../src/mastra/views/chrome/Appearance.tsx')
const { Settings } = await import('../src/mastra/views/Settings.tsx')
function Panel() { const appearance = useAppearance(); return createElement(PreferencePane, { state: appearance.state, onChange: appearance.setAppearance }) }
function SettingsPanel({ api }: { api: import('../src/mastra/data/client.ts').LumenApi }) {
  const appearance = useAppearance()
  return createElement(Settings, { api, appearance, onClose() {} })
}
function assertHostTheme(scheme: 'dark' | 'light', tokens: Record<string, string>) {
  const host = document.documentElement
  assert.equal(host.dataset.appearance, scheme)
  assert.equal(host.style.colorScheme, scheme)
  assert.equal(host.style.getPropertyValue('--canvas'), tokens['--canvas'])
  assert.equal(host.style.getPropertyValue('--ink'), tokens['--ink'])
}

test('系统变化切换实际明暗基线，选择浅色纸面后重挂载恢复颜色与材质', async () => {
  localStorage.clear()
  dark = true
  const element = document.createElement('div'); document.body.append(element)
  let root = createRoot(element)
  try {
    await act(async () => root.render(createElement(Panel)))
    const defaultSkin = listSkins().find(skin => skin.id === 'default')!
    const defaultCard = [...element.querySelectorAll<HTMLButtonElement>('[role=radio]')].find(button => button.getAttribute('aria-label')?.startsWith(defaultSkin.name))!
    await act(async () => defaultCard.click())
    const system = [...element.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '跟随系统')!
    await act(async () => system.click())
    assert.equal(subscribers.size, 1)
    assertHostTheme('dark', DARK_BASELINE)
    await act(async () => { dark = false; for (const callback of subscribers) callback() })
    assertHostTheme('light', LIGHT_BASELINE)
    await act(async () => root.unmount())
    assert.equal(subscribers.size, 0, '卸载系统模式宿主必须移除媒体查询订阅')
    root = createRoot(element)
    await act(async () => root.render(createElement(Panel)))
    assert.equal(subscribers.size, 1)
    assertHostTheme('light', LIGHT_BASELINE)

    const selected = listSkins().find(skin => skin.id === 'warm-paper')!
    const card = [...element.querySelectorAll<HTMLButtonElement>('[role=radio]')].find(button => button.getAttribute('aria-label')?.startsWith(selected.name))!
    assert.ok(card)
    await act(async () => card.click())
    assertHostTheme('light', { ...LIGHT_BASELINE, ...selected.tokens })
    assert.equal(document.documentElement.dataset.material, 'paper')
    assert.equal(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!).mode, 'light')
    assert.equal(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!).skinId, selected.id)
    assert.equal(subscribers.size, 0, '选择固定明暗皮肤后解除系统订阅')
    await act(async () => root.unmount())
    assert.equal(subscribers.size, 0)
    root = createRoot(element)
    await act(async () => root.render(createElement(Panel)))
    assert.equal(document.documentElement.dataset.skin, selected.id)
    assert.equal(document.documentElement.dataset.material, 'paper')
    assertHostTheme('light', { ...LIGHT_BASELINE, ...selected.tokens })
  } finally { await act(async () => root.unmount()); element.remove(); localStorage.clear(); dark = true }
})

test('研究进行中三个设置分类可切换且无预算入口，配置写入受限而本机换肤立即保存', async () => {
  localStorage.clear()
  const profile = { id: 'one', name: '研究模型', provider: 'openai' as const, baseUrl: '', models: ['first'], activeModel: 'first', vision: 'auto' as const, hasApiKey: true, apiKeyMasked: 'sk-••••test' }
  const patches: import('../src/mastra/data/client.ts').SettingsPatch[] = []
  const api = {
    async settings() {
      return { profiles: [profile, { ...profile, id: 'two', name: '备用' }], activeProfileId: 'one', userInstructions: '引用注明来源', researchBudget: { maxPromptTokens: 5000 }, collectExecEvidence: false, busy: true }
    },
    async updateSettings(patch: import('../src/mastra/data/client.ts').SettingsPatch) { patches.push(patch); return this.settings() },
  } as unknown as import('../src/mastra/data/client.ts').LumenApi
  const element = document.createElement('div')
  document.body.append(element)
  let root = createRoot(element)
  const nav = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.settings-nav-item')].find(button => button.textContent === label)!
  const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.settings-body button')].find(button => button.textContent === label || button.getAttribute('aria-label') === label)!
  try {
    await act(async () => root.render(createElement(SettingsPanel, { api })))
    const dialog = document.querySelector('.settings-modal')!
    assert.ok(dialog)
    assert.equal(element.contains(dialog), false, '设置窗口经 Kumo portal 挂在 document 中')
    assert.deepEqual([...document.querySelectorAll('.settings-nav-item')].map(item => item.textContent), ['模型', '研究偏好', '外观'])
    for (const label of ['模型', '研究偏好', '外观']) assert.equal(nav(label).disabled, false, `${label} 分类可进入`)

    await act(async () => nav('研究偏好').click())
    assert.equal(document.querySelector('.settings-h')?.textContent, '研究偏好')
    assert.equal(document.querySelector<HTMLTextAreaElement>('.set-textarea')!.disabled, true)
    assert.equal(button('保存研究偏好').disabled, true)
    await act(async () => button('保存研究偏好').click())

    await act(async () => nav('外观').click())
    const selected = listSkins().find(skin => skin.id === 'glacier-glass')!
    assert.notEqual(document.documentElement.dataset.skin, selected.id)
    const card = [...document.querySelectorAll<HTMLButtonElement>('[role=radio]')].find(button => button.getAttribute('aria-label')?.startsWith(selected.name))!
    assert.ok(card)
    assert.equal(card.disabled, false)
    await act(async () => card.click())
    assert.equal(document.documentElement.dataset.skin, selected.id)
    assert.equal(document.documentElement.dataset.material, 'glass')
    assertHostTheme('light', { ...LIGHT_BASELINE, ...selected.tokens })
    assert.equal(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!).mode, 'light')
    assert.equal(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!).skinId, selected.id)

    await act(async () => nav('模型').click())
    assert.equal(document.querySelector('.settings-h')?.textContent, '模型')
    assert.equal(button('添加模型').disabled, true)
    await act(async () => button('添加模型').click())
    for (const write of document.querySelectorAll<HTMLButtonElement>('.mpc-main, .mpc-act-danger')) {
      assert.equal(write.disabled, true)
      await act(async () => write.click())
    }
    assert.ok(document.querySelector('.mpc-list'), '锁定模型编辑不能进入写入表单')
    await act(async () => root.unmount())
    root = createRoot(element)
    await act(async () => root.render(createElement(SettingsPanel, { api })))
    assert.equal(document.documentElement.dataset.skin, selected.id)
    assert.equal(document.documentElement.dataset.material, 'glass')
    assertHostTheme('light', { ...LIGHT_BASELINE, ...selected.tokens })
    assert.deepEqual(patches, [], '导航和本机换肤不提交服务设置')
  } finally {
    await act(async () => root.unmount())
    element.remove()
    localStorage.clear()
  }
})

test('模型编辑逐行增减不误提交，保留当前模型与凭证，删除只发删除请求', async () => {
  type SettingsPatch = import('../src/mastra/data/client.ts').SettingsPatch
  type PublicSettings = import('../src/mastra/data/client.ts').PublicSettings
  const profile = { id: 'one', name: '研究模型', provider: 'openai' as const, baseUrl: '', models: ['first', 'second'], activeModel: 'second', vision: 'auto' as const, hasApiKey: true, apiKeyMasked: 'sk-••••test' }
  let current: PublicSettings = { profiles: [profile, { ...profile, id: 'two', name: '备用' }], activeProfileId: 'one', userInstructions: '', researchBudget: {}, collectExecEvidence: false }
  const patches: SettingsPatch[] = []
  const api = { async settings() { return current }, async updateSettings(patch: SettingsPatch) { patches.push(patch); if (patch.upsertProfile) current = { ...current, profiles: current.profiles.map(item => item.id === 'one' ? { ...item, ...patch.upsertProfile } as typeof profile : item) }; if (patch.deleteProfileId) current = { ...current, profiles: current.profiles.filter(item => item.id !== patch.deleteProfileId) }; return current } } as unknown as import('../src/mastra/data/client.ts').LumenApi
  const element = document.createElement('div'); document.body.append(element); const root = createRoot(element)
  const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === label || item.getAttribute('aria-label') === label)!
  try {
    await act(async () => root.render(createElement(Settings, { api, onClose() {} })))
    await act(async () => document.querySelector<HTMLButtonElement>('.mpc-main')!.click())
    assert.equal(document.querySelector<HTMLInputElement>('[aria-label="API Key"]')!.value, profile.apiKeyMasked)
    await act(async () => button('再加一个模型 ID').click())
    assert.equal(document.querySelectorAll('.set-row-model').length, 3)
    await act(async () => button('移除此模型 ID').click())
    assert.equal(document.querySelectorAll('.set-row-model').length, 2)
    assert.equal(patches.length, 0)
    await act(async () => button('保存').click())
    assert.deepEqual(patches[0].upsertProfile?.models, ['second'])
    assert.equal(patches[0].upsertProfile?.activeModel, 'second')
    assert.ok(!('apiKey' in patches[0].upsertProfile!))
    await act(async () => button('删除').click())
    assert.deepEqual(patches[1], { deleteProfileId: 'one' })
    assert.equal(patches.length, 2)
    assert.ok(document.querySelector('.mpc-list'))
  } finally { await act(async () => root.unmount()); element.remove() }
})
