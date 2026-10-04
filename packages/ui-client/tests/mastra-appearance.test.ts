/**
 * [INPUT]: 原外观面板、真实设置窗口、useAppearance与浏览器媒体查询事件
 * [OUTPUT]: 皮肤持久化/系统订阅及模型增减、凭证保留、删除不误提交的交互证据
 * [POS]: 验证迁移后的外观能力接线；不把纯 token 测试冒充用户设置路径
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createElement, act } from 'react'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'localStorage']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const subscribers = new Set<() => void>()
let dark = true
Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: dark, addEventListener(_name: string, callback: () => void) { subscribers.add(callback) }, removeEventListener(_name: string, callback: () => void) { subscribers.delete(callback) } }) })
register('./helpers/tsx-loader.mjs', import.meta.url)
const { createRoot } = await import('react-dom/client')
const { useAppearance, APPEARANCE_STORAGE_KEY, listSkins } = await import('../src/appearance/index.ts')
const { PreferencePane } = await import('../src/mastra/views/chrome/Appearance.tsx')
function Panel() { const appearance = useAppearance(); return createElement(PreferencePane, { state: appearance.state, onChange: appearance.setAppearance }) }

test('外观面板恢复皮肤编辑与系统变化订阅，重新挂载读取已保存选择', async () => {
  localStorage.clear()
  const element = document.createElement('div'); document.body.append(element)
  let root = createRoot(element)
  try {
    await act(async () => root.render(createElement(Panel)))
    const skins = listSkins(), selected = skins.find(skin => skin.id !== document.documentElement.dataset.skin)!
    const card = [...element.querySelectorAll<HTMLButtonElement>('[role=radio]')].find(button => button.getAttribute('aria-label')?.startsWith(selected.name))!
    assert.ok(card)
    await act(async () => card.click())
    assert.equal(document.documentElement.dataset.skin, selected.id)
    assert.equal(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!).skinId, selected.id)
    const system = [...element.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '跟随系统')!
    await act(async () => system.click())
    assert.equal(subscribers.size, 1)
    assert.equal(document.documentElement.dataset.appearance, 'dark')
    await act(async () => { dark = false; for (const callback of subscribers) callback() })
    assert.equal(document.documentElement.dataset.appearance, 'light')
    await act(async () => root.unmount())
    assert.equal(subscribers.size, 0)
    root = createRoot(element)
    await act(async () => root.render(createElement(Panel)))
    assert.equal(document.documentElement.dataset.skin, selected.id)
    assert.equal(document.documentElement.dataset.appearance, 'light')
  } finally { await act(async () => root.unmount()); element.remove(); localStorage.clear() }
})

test('模型编辑逐行增减不误提交，保留当前模型与凭证，删除只发删除请求', async () => {
  for (const name of ['HTMLInputElement', 'HTMLButtonElement', 'HTMLDialogElement', 'DocumentFragment', 'MutationObserver', 'getComputedStyle']) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback: () => void) => setTimeout(callback, 0) })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: clearTimeout })
  const { Settings } = await import('../src/mastra/views/Settings.tsx')
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
