/**
 * [INPUT]: 外观解析/归一入口、明暗基线、皮肤注册表与原语白名单
 * [OUTPUT]: 真实明暗、默认清透取自设计系统(淡蓝强调为唯一有意覆盖且墨色可读)、v1 偏好迁移、皮肤补丁隔离、玻璃/纸面材质与别名级联的纯函数回归
 * [POS]: 外观状态到主题输出的合同；DOM 应用与用户点击由 mastra-appearance 覆盖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveTheme,
  filterWhitelist,
  DARK_BASELINE,
  LIGHT_BASELINE,
  normalizeAppearance,
  DEFAULT_APPEARANCE,
  TOKEN_ALIASES,
  listSkins,
  coerceSkinId,
  SKIN_DEFAULT,
  APPEARANCE_TOKEN_SET,
  loadAppearance,
  APPEARANCE_STORAGE_KEY,
  LEGACY_APPEARANCE_STORAGE_KEY,
} from '../src/appearance/index.ts'
import { THEMES } from 'yan-design-system/themes'
import { CLEAR_SOFT_BLUE_DARK, CLEAR_SOFT_BLUE_LIGHT } from '../src/appearance/skins/light.ts'

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

describe('默认「清透」', () => {
  it('默认浅色，明暗两侧除淡蓝强调外逐项取自设计系统主题值表', () => {
    assert.equal(DEFAULT_APPEARANCE.mode, 'light')
    assert.equal(DEFAULT_APPEARANCE.skinId, SKIN_DEFAULT.id)
    for (const [mode, theme, soft] of [['light', 'yan-clear-light', CLEAR_SOFT_BLUE_LIGHT], ['dark', 'yan-clear-dark', CLEAR_SOFT_BLUE_DARK]] as const) {
      const r = resolveTheme({ ...DEFAULT_APPEARANCE, mode }, mode)
      assert.equal(r.colorScheme, mode)
      assert.equal(r.aurora, false)
      const primitives = Object.entries(THEMES[theme]!).filter(([k]) => !TOKEN_ALIASES[k] && APPEARANCE_TOKEN_SET.has(k) && !(k in soft))
      assert.ok(primitives.length >= 30)
      for (const [k, v] of primitives) assert.equal(r.tokens[k], v, `${mode} ${k}`)
      for (const [k, v] of Object.entries(soft)) assert.equal(r.tokens[k], v, `${mode} 淡蓝 ${k}`)
    }
  })

  it('淡蓝强调的墨色可读：作文字与托底文字都不低于 4.5:1，其他皮肤不补墨色', () => {
    for (const mode of ['light', 'dark'] as const) {
      const t = resolveTheme({ ...DEFAULT_APPEARANCE, mode }, mode).tokens
      const ink = t['--accent-ink']!
      assert.ok(contrast(ink, t['--surface-base']!) >= 4.5, `${mode} 墨色作文字`)
      assert.ok(contrast(ink, t['--surface-elevated']!) >= 4.5, `${mode} 墨色在浮层`)
      assert.ok(contrast(ink, t['--text-on-accent']!) >= 4.5, `${mode} 墨色托底文字`)
      assert.ok(contrast(t['--accent-hover']!, t['--text-on-accent']!) >= 4.5, `${mode} 悬停托底文字`)
    }
    for (const skin of listSkins().filter((s) => s.id !== 'yan-clear')) {
      assert.equal(resolveTheme({ ...DEFAULT_APPEARANCE, skinId: skin.id }, skin.preferredScheme).tokens['--accent-ink'], undefined, skin.id)
    }
  })

  it('v1 偏好迁移：旧默认青瓷改为清透，其他皮肤选择保留', () => {
    const store = new Map<string, string>()
    const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: fake })
    try {
      store.set(LEGACY_APPEARANCE_STORAGE_KEY, JSON.stringify({ version: 1, mode: 'dark', skinId: 'default', overlay: 0, blurPx: 0 }))
      assert.deepEqual(loadAppearance(), DEFAULT_APPEARANCE)
      assert.equal(JSON.parse(store.get(APPEARANCE_STORAGE_KEY)!).skinId, 'yan-clear')
      store.clear()
      store.set(LEGACY_APPEARANCE_STORAGE_KEY, JSON.stringify({ version: 1, mode: 'dark', skinId: 'mist-forest', overlay: 0, blurPx: 0 }))
      assert.equal(loadAppearance().skinId, 'mist-forest')
      store.set(LEGACY_APPEARANCE_STORAGE_KEY, JSON.stringify({ version: 1, mode: 'dark', skinId: 'clay-warm', overlay: 0, blurPx: 0 }))
      assert.equal(loadAppearance().skinId, 'mist-forest', 'v2 已存在时不再读 v1')
    } finally { Reflect.deleteProperty(globalThis, 'localStorage') }
  })
})

describe('filterWhitelist', () => {
  it('丢弃别名与未知键', () => {
    const f = filterWhitelist({
      '--accent': '#fff',
      '--code-keyword': '#000',
      '--color-kumo-brand': '#111',
      '--surface-canvas': '#222',
      '--material-blur': '26px',
    })
    assert.equal(f['--accent'], '#fff')
    assert.equal(f['--code-keyword'], undefined)
    assert.equal(f['--color-kumo-brand'], undefined)
    assert.equal(f['--surface-canvas'], undefined)
    assert.equal(f['--material-blur'], '26px')
  })
})

describe('resolveTheme', () => {
  it('非法 skinId → 默认「清透」', () => {
    const r = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'nope', mode: 'dark' }, 'dark')
    assert.equal(r.skinId, 'yan-clear')
    assert.equal(r.colorScheme, 'dark')
  })

  it('别名保持 var() 级联', () => {
    for (const mode of ['dark', 'light'] as const) {
      const r = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'mist-forest', mode }, 'dark')
      assert.equal(r.tokens['--code-keyword'], 'var(--accent-ink)')
      assert.equal(r.tokens['--surface-canvas'], 'var(--canvas)')
    }
  })

  it('明暗模式实际切换画布、文字与控件表面，显式模式优先于系统', () => {
    for (const [mode, baseline, system] of [['dark', DARK_BASELINE, 'light'], ['light', LIGHT_BASELINE, 'dark']] as const) {
      const r = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'default', mode }, system)
      assert.equal(r.colorScheme, mode)
      assert.equal(r.appearanceIntent, mode)
      for (const token of ['--canvas', '--text', '--surface-base', '--surface-elevated', '--surface-control']) assert.equal(r.tokens[token], baseline[token], `${mode} ${token}`)
    }
    assert.equal(LIGHT_BASELINE['--canvas'], '#E8EEF4')
    assert.equal(LIGHT_BASELINE['--text'], '#18212D')
    assert.notEqual(LIGHT_BASELINE['--canvas'], DARK_BASELINE['--canvas'])
    assert.notEqual(LIGHT_BASELINE['--text'], DARK_BASELINE['--text'])
  })

  it('系统模式将媒体查询应用到实际颜色基线', () => {
    for (const [system, baseline] of [['dark', DARK_BASELINE], ['light', LIGHT_BASELINE]] as const) {
      const r = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'default', mode: 'system' }, system)
      assert.equal(r.colorScheme, system)
      assert.equal(r.tokens['--canvas'], baseline['--canvas'])
      assert.equal(r.tokens['--text'], baseline['--text'])
    }
  })

  it('三个浅色皮肤使用浅画布深文字，深色补丁不污染浅色模式', () => {
    for (const id of ['glacier-glass', 'warm-paper', 'sea-salt']) {
      const skin = listSkins().find(item => item.id === id)!
      assert.ok(skin, id)
      assert.equal(skin.preferredScheme, 'light', id)
      const r = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: id, mode: 'light' }, 'dark')
      assert.equal(r.colorScheme, 'light', id)
      assert.notEqual(r.tokens['--canvas'], DARK_BASELINE['--canvas'], id)
      assert.notEqual(r.tokens['--text'], DARK_BASELINE['--text'], id)
    }
    const mist = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'mist-forest', mode: 'light' }, 'light')
    assert.equal(mist.tokens['--canvas'], LIGHT_BASELINE['--canvas'])
    assert.equal(mist.tokens['--text'], LIGHT_BASELINE['--text'])
    assert.equal(mist.tokens['--accent'], LIGHT_BASELINE['--accent'])
  })

  it('浅色皮肤切深色时使用备用强调色与暗色基线', () => {
    const light = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'glacier-glass', mode: 'light' }, 'light')
    const dark = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'glacier-glass', mode: 'dark' }, 'light')
    assert.equal(dark.colorScheme, 'dark')
    assert.equal(dark.tokens['--canvas'], DARK_BASELINE['--canvas'])
    assert.equal(dark.tokens['--text'], DARK_BASELINE['--text'])
    assert.equal(dark.tokens['--accent'], '#9EBFE5')
    assert.notEqual(dark.tokens['--accent'], light.tokens['--accent'])
    assert.equal(dark.material, 'glass')
  })

  it('液体玻璃保留透明面与折光，纸面使用实体面并关闭光晕', () => {
    const glass = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'glacier-glass', mode: 'light' }, 'light')
    const paper = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'warm-paper', mode: 'light' }, 'light')
    assert.equal(glass.material, 'glass')
    assert.equal(paper.material, 'paper')
    assert.equal(glass.aurora, true)
    assert.equal(paper.aurora, false)
    assert.ok(Number.parseFloat(glass.tokens['--material-blur']) > 0)
    assert.equal(paper.tokens['--material-blur'], '0px')
    assert.notEqual(glass.tokens['--material-highlight'], 'transparent')
    assert.equal(paper.tokens['--material-highlight'], 'transparent')
    assert.notEqual(glass.tokens['--material-edge'], paper.tokens['--material-edge'])
    for (const token of ['--paper', '--card']) {
      const alpha = /,\s*([\d.]+)\)$/.exec(glass.tokens[token])?.[1]
      assert.ok(alpha && Number(alpha) < 1, `${token} 为半透明玻璃`)
      assert.match(paper.tokens[token], /^#[\da-f]{6}$/i, `${token} 为实体纸面`)
    }
    for (const token of ['--surface-base', '--surface-elevated', '--surface-control']) assert.match(glass.tokens[token], /^#[\da-f]{6}$/i, `${token} 为控件实色`)
    assert.equal(resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'default' }, 'dark').material, 'glass')
  })

  it('始终有合法选中：非法 id 回落 default', () => {
    assert.equal(coerceSkinId(null), SKIN_DEFAULT.id)
    assert.equal(coerceSkinId('nope'), SKIN_DEFAULT.id)
    assert.equal(coerceSkinId('clay-warm'), 'clay-warm')
  })

  it('雾林/陶土相对 default 强调色不同（可感知）', () => {
    const d = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'default', mode: 'dark' }, 'dark')
    const m = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'mist-forest', mode: 'dark' }, 'dark')
    const c = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'clay-warm', mode: 'dark' }, 'dark')
    assert.notEqual(m.tokens['--accent'], d.tokens['--accent'])
    assert.notEqual(c.tokens['--accent'], d.tokens['--accent'])
    assert.notEqual(c.tokens['--accent'], m.tokens['--accent'])
  })

  it('整窗皮肤：玻璃壳 paper/card 与 default 不同（侧栏会跟）', () => {
    const d = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'default', mode: 'dark' }, 'dark')
    const m = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'mist-forest', mode: 'dark' }, 'dark')
    const c = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'clay-warm', mode: 'dark' }, 'dark')
    assert.notEqual(m.tokens['--paper'], d.tokens['--paper'])
    assert.notEqual(m.tokens['--card'], d.tokens['--card'])
    assert.notEqual(c.tokens['--paper'], d.tokens['--paper'])
    assert.notEqual(c.tokens['--card'], m.tokens['--card'])
  })

  it('宇宙拿铁：半透明白霜 + canvas 非死黑（与玻璃统一）', () => {
    const r = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'cosmic-latte', mode: 'dark' }, 'dark')
    assert.equal(r.skinId, 'cosmic-latte')
    assert.match(r.tokens['--card'] ?? '', /255,\s*255,\s*255/)
    assert.match(r.tokens['--paper'] ?? '', /255,\s*255,\s*255/)
    assert.equal(r.tokens['--info'], '#3b82f6')
    assert.notEqual(r.tokens['--accent']?.toLowerCase(), '#f59e0b')
    // canvas 抬到冷雾灰蓝，不再是 #0B0C10 死黑
    assert.notEqual((r.tokens['--canvas'] ?? '').toLowerCase(), '#0b0c10')
    assert.notEqual((r.tokens['--canvas'] ?? '').toLowerCase(), '#0c1018')
  })
})

describe('normalizeAppearance', () => {
  it('坏数据回退 default', () => {
    assert.deepEqual(normalizeAppearance(null), DEFAULT_APPEARANCE)
    assert.equal(normalizeAppearance({ version: 1, mode: 'nope', skinId: 'x' }).mode, DEFAULT_APPEARANCE.mode)
    const fonts = normalizeAppearance({ version: 1, mode: 'light', skinId: 'yan-clear', latinFont: 'comic-sans', cjkFont: 'song', justify: 'yes' })
    assert.deepEqual([fonts.latinFont, fonts.cjkFont, fonts.justify], ['source-serif', 'song', false], '未知西文回默认，非布尔对齐视为关')
    const legacy = normalizeAppearance({ version: 1, mode: 'light', skinId: 'yan-clear' })
    assert.deepEqual([legacy.latinFont, legacy.cjkFont, legacy.justify], ['source-serif', 'wenkai', false], '旧偏好没有字体字段时取默认组合')
    assert.equal(resolveTheme(legacy).fontSerif, undefined, '默认组合不产生 --font-serif 覆盖')
    assert.equal(resolveTheme({ ...legacy, cjkFont: 'hei' }).fontSerif, "'Source Serif 4', 'PingFang SC', 'Noto Sans SC', serif")
  })
})

describe('TOKEN_ALIASES', () => {
  it('含 code-keyword 与 surface-canvas；success 已是可 patch 原语', () => {
    assert.equal(TOKEN_ALIASES['--code-keyword'], 'var(--accent-ink)', '代码关键字是文字，走可读墨色')
    assert.equal(TOKEN_ALIASES['--success'], undefined)
    assert.equal(TOKEN_ALIASES['--surface-canvas'], 'var(--canvas)')
  })
})
