/**
 * [INPUT]: 外观解析/归一入口、明暗基线、皮肤注册表与原语白名单
 * [OUTPUT]: 真实明暗、皮肤补丁隔离、玻璃/纸面材质与别名级联的纯函数回归
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
} from '../src/appearance/index.ts'

describe('filterWhitelist', () => {
  it('丢弃别名与未知键', () => {
    const f = filterWhitelist({
      '--ember': '#fff',
      '--success': '#000',
      '--color-kumo-brand': '#111',
      '--surface-canvas': '#222',
      '--material-blur': '26px',
    })
    assert.equal(f['--ember'], '#fff')
    assert.equal(f['--success'], undefined)
    assert.equal(f['--color-kumo-brand'], undefined)
    assert.equal(f['--surface-canvas'], undefined)
    assert.equal(f['--material-blur'], '26px')
  })
})

describe('resolveTheme', () => {
  it('非法 skinId → default', () => {
    const r = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'nope', mode: 'dark' }, 'dark')
    assert.equal(r.skinId, 'default')
    assert.equal(r.colorScheme, 'dark')
  })

  it('别名保持 var() 级联', () => {
    for (const mode of ['dark', 'light'] as const) {
      const r = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'mist-forest', mode }, 'dark')
      assert.equal(r.tokens['--success'], 'var(--moss)')
      assert.equal(r.tokens['--code-keyword'], 'var(--ember)')
      assert.equal(r.tokens['--surface-canvas'], 'var(--canvas)')
    }
  })

  it('明暗模式实际切换画布、文字与控件表面，显式模式优先于系统', () => {
    for (const [mode, baseline, system] of [['dark', DARK_BASELINE, 'light'], ['light', LIGHT_BASELINE, 'dark']] as const) {
      const r = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'default', mode }, system)
      assert.equal(r.colorScheme, mode)
      assert.equal(r.appearanceIntent, mode)
      for (const token of ['--canvas', '--ink', '--surface-base', '--surface-elevated', '--surface-control']) assert.equal(r.tokens[token], baseline[token], `${mode} ${token}`)
    }
    assert.equal(LIGHT_BASELINE['--canvas'], '#E8EEF4')
    assert.equal(LIGHT_BASELINE['--ink'], '#18212D')
    assert.notEqual(LIGHT_BASELINE['--canvas'], DARK_BASELINE['--canvas'])
    assert.notEqual(LIGHT_BASELINE['--ink'], DARK_BASELINE['--ink'])
  })

  it('系统模式将媒体查询应用到实际颜色基线', () => {
    for (const [system, baseline] of [['dark', DARK_BASELINE], ['light', LIGHT_BASELINE]] as const) {
      const r = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'default', mode: 'system' }, system)
      assert.equal(r.colorScheme, system)
      assert.equal(r.tokens['--canvas'], baseline['--canvas'])
      assert.equal(r.tokens['--ink'], baseline['--ink'])
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
      assert.notEqual(r.tokens['--ink'], DARK_BASELINE['--ink'], id)
    }
    const mist = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'mist-forest', mode: 'light' }, 'light')
    assert.equal(mist.tokens['--canvas'], LIGHT_BASELINE['--canvas'])
    assert.equal(mist.tokens['--ink'], LIGHT_BASELINE['--ink'])
    assert.equal(mist.tokens['--ember'], LIGHT_BASELINE['--ember'])
  })

  it('浅色皮肤切深色时使用备用强调色与暗色基线', () => {
    const light = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'glacier-glass', mode: 'light' }, 'light')
    const dark = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'glacier-glass', mode: 'dark' }, 'light')
    assert.equal(dark.colorScheme, 'dark')
    assert.equal(dark.tokens['--canvas'], DARK_BASELINE['--canvas'])
    assert.equal(dark.tokens['--ink'], DARK_BASELINE['--ink'])
    assert.equal(dark.tokens['--ember'], '#9EBFE5')
    assert.notEqual(dark.tokens['--ember'], light.tokens['--ember'])
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
    assert.notEqual(m.tokens['--ember'], d.tokens['--ember'])
    assert.notEqual(c.tokens['--ember'], d.tokens['--ember'])
    assert.notEqual(c.tokens['--ember'], m.tokens['--ember'])
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
    assert.equal(r.tokens['--indigo'], '#3b82f6')
    assert.notEqual(r.tokens['--ember']?.toLowerCase(), '#f59e0b')
    // canvas 抬到冷雾灰蓝，不再是 #0B0C10 死黑
    assert.notEqual((r.tokens['--canvas'] ?? '').toLowerCase(), '#0b0c10')
    assert.notEqual((r.tokens['--canvas'] ?? '').toLowerCase(), '#0c1018')
  })
})

describe('normalizeAppearance', () => {
  it('坏数据回退 default', () => {
    assert.deepEqual(normalizeAppearance(null), DEFAULT_APPEARANCE)
    assert.equal(normalizeAppearance({ version: 1, mode: 'nope', skinId: 'x' }).mode, DEFAULT_APPEARANCE.mode)
  })
})

describe('TOKEN_ALIASES', () => {
  it('含 success 与 surface-canvas', () => {
    assert.equal(TOKEN_ALIASES['--success'], 'var(--moss)')
    assert.equal(TOKEN_ALIASES['--surface-canvas'], 'var(--canvas)')
  })
})
