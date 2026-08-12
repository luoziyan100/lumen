/**
 * [INPUT]: resolveTheme / filterWhitelist / normalizeAppearance
 * [POS]: appearance AT4 / R2 / R3
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveTheme,
  filterWhitelist,
  DARK_BASELINE,
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
    })
    assert.equal(f['--ember'], '#fff')
    assert.equal(f['--success'], undefined)
    assert.equal(f['--color-kumo-brand'], undefined)
    assert.equal(f['--surface-canvas'], undefined)
  })
})

describe('resolveTheme', () => {
  it('非法 skinId → default', () => {
    const r = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'nope' }, 'dark')
    assert.equal(r.skinId, 'default')
    assert.equal(r.colorScheme, 'dark')
  })

  it('别名保持 var() 级联', () => {
    const r = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'mist-forest' }, 'dark')
    assert.equal(r.tokens['--success'], 'var(--moss)')
    assert.equal(r.tokens['--code-keyword'], 'var(--ember)')
    assert.equal(r.tokens['--surface-canvas'], 'var(--canvas)')
    assert.ok(r.tokens['--ember'])
    assert.notEqual(r.tokens['--ember'], DARK_BASELINE['--ember'])
  })

  it('mode light 仍用 dark token 基线（Phase A）', () => {
    const r = resolveTheme({ ...DEFAULT_APPEARANCE, mode: 'light' }, 'light')
    assert.equal(r.colorScheme, 'dark')
    assert.equal(r.appearanceIntent, 'light')
    assert.equal(r.tokens['--canvas'], DARK_BASELINE['--canvas'])
  })

  it('预置皮肤 preferredScheme 全 dark（R2/AT13）', () => {
    for (const s of listSkins()) {
      assert.equal(s.preferredScheme, 'dark', s.id)
    }
  })

  it('始终有合法选中：非法 id 回落 default', () => {
    assert.equal(coerceSkinId(null), SKIN_DEFAULT.id)
    assert.equal(coerceSkinId('nope'), SKIN_DEFAULT.id)
    assert.equal(coerceSkinId('clay-warm'), 'clay-warm')
  })

  it('雾林/陶土相对 default 强调色不同（可感知）', () => {
    const d = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'default' }, 'dark')
    const m = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'mist-forest' }, 'dark')
    const c = resolveTheme({ ...DEFAULT_APPEARANCE, skinId: 'clay-warm' }, 'dark')
    assert.notEqual(m.tokens['--ember'], d.tokens['--ember'])
    assert.notEqual(c.tokens['--ember'], d.tokens['--ember'])
    assert.notEqual(c.tokens['--ember'], m.tokens['--ember'])
  })
})

describe('normalizeAppearance', () => {
  it('坏数据回退 default', () => {
    assert.deepEqual(normalizeAppearance(null), DEFAULT_APPEARANCE)
    assert.equal(normalizeAppearance({ version: 1, mode: 'nope', skinId: 'x' }).mode, 'dark')
  })
})

describe('TOKEN_ALIASES', () => {
  it('含 success 与 surface-canvas', () => {
    assert.equal(TOKEN_ALIASES['--success'], 'var(--moss)')
    assert.equal(TOKEN_ALIASES['--surface-canvas'], 'var(--canvas)')
  })
})
