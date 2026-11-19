/**
 * [INPUT]: the real settings window/appearance pane, useAppearance, light/dark baselines, the busy-service DTO and media query events
 * [OUTPUT]: real light/dark and material switching restored, reading font pairs/alignment/persistence, five settings sections (models, research preferences, specialists, appearance, speech habits) with no budget entry, local skin changes isolated from busy-service writes, evidence for model add/remove and credential retention
 * [POS]: user-path regression for settings and appearance; each of navigation, service configuration and local preferences keeps to its own boundary
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { zh } from './helpers/zh.ts'
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
const { useAppearance, APPEARANCE_STORAGE_KEY, listSkins, DARK_BASELINE, LIGHT_BASELINE, LATIN_FONTS } = await import('../src/appearance/index.ts')
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
  assert.equal(host.style.getPropertyValue('--text'), tokens['--text'])
}

test('系统变化切换实际明暗基线，选择浅色纸面后重挂载恢复颜色与材质', async () => {
  localStorage.clear()
  dark = true
  const element = document.createElement('div'); document.body.append(element)
  let root = createRoot(element)
  try {
    await act(async () => root.render(createElement(Panel)))
    const defaultSkin = listSkins().find(skin => skin.id === 'default')!
    const defaultCard = [...element.querySelectorAll<HTMLButtonElement>('[role=radio]')].find(button => button.getAttribute('aria-label')?.startsWith(zh.skins[defaultSkin.id]!.name))!
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
    const card = [...element.querySelectorAll<HTMLButtonElement>('[role=radio]')].find(button => button.getAttribute('aria-label')?.startsWith(zh.skins[selected.id]!.name))!
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

test('研究进行中四个设置分类可切换且无预算入口，配置写入受限而本机换肤立即保存', async () => {
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
    // the zh catalog's own tab labels, 说话习惯 included since S14
    assert.deepEqual([...document.querySelectorAll('.settings-nav-item')].map(item => item.textContent), ['模型', '研究偏好', '专家', '外观', '说话习惯', '已归档'])
    for (const label of ['模型', '研究偏好', '专家', '外观', '说话习惯', '已归档']) assert.equal(nav(label).disabled, false, `${label} 分类可进入`)

    await act(async () => nav('研究偏好').click())
    assert.equal(document.querySelector('.settings-h')?.textContent, '研究偏好')
    assert.equal(document.querySelector<HTMLTextAreaElement>('.set-textarea')!.disabled, true)
    assert.equal(button('保存研究偏好').disabled, true)
    await act(async () => button('保存研究偏好').click())

    await act(async () => nav('外观').click())
    const selected = listSkins().find(skin => skin.id === 'glacier-glass')!
    assert.notEqual(document.documentElement.dataset.skin, selected.id)
    const card = [...document.querySelectorAll<HTMLButtonElement>('[role=radio]')].find(button => button.getAttribute('aria-label')?.startsWith(zh.skins[selected.id]!.name))!
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

test('阅读字体：西文/中文分别选、两端对齐开关，写入 --font-serif 并持久化，回到默认组合即移除覆盖', async () => {
  localStorage.clear()
  const host = document.documentElement
  const element = document.createElement('div'); document.body.append(element)
  let root = createRoot(element)
  const pick = (group: string, name: string) => [...element.querySelectorAll<HTMLButtonElement>(`[aria-label="${group}字体"] button`)].find(button => button.textContent === name)!
  const justify = () => element.querySelector<HTMLInputElement>('.pref-check input')!
  const saved = () => JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!)
  try {
    await act(async () => root.render(createElement(Panel)))
    assert.equal(host.style.getPropertyValue('--font-serif'), '', '默认组合不覆盖设计系统字族')
    assert.equal(pick('西文', 'Source Serif').getAttribute('aria-pressed'), 'true')
    assert.equal(pick('中文', '霞鹜文楷').getAttribute('aria-pressed'), 'true')
    assert.equal(LATIN_FONTS.length, 7)
    await act(async () => pick('西文', 'EB Garamond').click())
    assert.match(host.style.getPropertyValue('--font-serif'), /^'Lumen EB Garamond', 'LXGW WenKai'/)
    await act(async () => pick('中文', '宋体').click())
    assert.match(host.style.getPropertyValue('--font-serif'), /^'Lumen EB Garamond', 'Songti SC'/)
    assert.match(pick('西文', 'Literata').style.fontFamily, /Lumen Literata/, '选项用自身字体预览')
    assert.equal('justify' in host.dataset, false)
    await act(async () => justify().click())
    assert.equal('justify' in host.dataset, true)
    assert.deepEqual([saved().latinFont, saved().cjkFont, saved().justify], ['eb-garamond', 'song', true])
    await act(async () => root.unmount())
    root = createRoot(element)
    await act(async () => root.render(createElement(Panel)))
    assert.match(host.style.getPropertyValue('--font-serif'), /^'Lumen EB Garamond', 'Songti SC'/, '重挂载恢复')
    assert.equal(justify().checked, true)
    await act(async () => { pick('西文', 'Source Serif').click(); pick('中文', '霞鹜文楷').click(); justify().click() })
    assert.equal(host.style.getPropertyValue('--font-serif'), '')
    assert.equal('justify' in host.dataset, false)
  } finally { await act(async () => root.unmount()); element.remove() }
})
