import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveAuraState } from '../src/aura/deriveAuraState.ts'
import { LUMEN_CELADON_AURA_MAP } from '../src/aura/lumenTheme.ts'
import { getTimeGreeting } from '../src/greeting.ts'
import { SYSTEM_PROMPT_COPY } from '../src/settingsCopy.ts'
import { APP_BRAND_COPY, APP_TITLEBAR_ACTIONS, APP_TITLEBAR_WORKSPACE_TOGGLE, WORKSPACE_DRAWER_COPY } from '../src/appCopy.ts'

test('deriveAuraState: initial disconnected UI stays idle to avoid a blocked color flash', () => {
  assert.equal(deriveAuraState({ connected: false, running: false, items: [] }), 'idle')
})

test('deriveAuraState: empty connected UI is idle', () => {
  assert.equal(deriveAuraState({ connected: true, running: false, items: [] }), 'idle')
})

test('deriveAuraState: active research tool drives researching', () => {
  assert.equal(
    deriveAuraState({
      connected: true,
      running: true,
      items: [{ kind: 'process', running: true, steps: [{ name: 'search_papers' }] }],
    }),
    'researching',
  )
})

test('deriveAuraState: write tool drives writing', () => {
  assert.equal(
    deriveAuraState({
      connected: true,
      running: true,
      items: [{ kind: 'process', running: true, steps: [{ name: 'write_file' }] }],
    }),
    'writing',
  )
})

test('deriveAuraState: assistant output while running drives writing', () => {
  assert.equal(
    deriveAuraState({
      connected: true,
      running: true,
      items: [{ kind: 'msg', role: 'assistant' }],
    }),
    'writing',
  )
})

test('deriveAuraState: completed assistant turn drives done', () => {
  assert.equal(
    deriveAuraState({
      connected: true,
      running: false,
      items: [{ kind: 'msg', role: 'assistant' }],
    }),
    'done',
  )
})

test('deriveAuraState: error message drives blocked', () => {
  assert.equal(
    deriveAuraState({
      connected: true,
      running: false,
      items: [{ kind: 'msg', role: 'error' }],
    }),
    'blocked',
  )
})

test('Lumen celadon aura keeps idle visibly animated', () => {
  assert.deepEqual(LUMEN_CELADON_AURA_MAP.idle.colors, ['#f7f5ed', '#dbeadd', '#a8d0b2', '#eef2e6'])
  assert.ok(LUMEN_CELADON_AURA_MAP.idle.speed > 0.3)
  assert.ok(LUMEN_CELADON_AURA_MAP.idle.neuroOpacity > 0)
})

test('Lumen celadon aura uses no red blocked palette', () => {
  const blockedColors = [
    ...LUMEN_CELADON_AURA_MAP.blocked.colors,
    LUMEN_CELADON_AURA_MAP.blocked.neuroColor,
    ...LUMEN_CELADON_AURA_MAP.blocked.borderColors,
  ]
  assert.deepEqual(blockedColors, ['#eef3e8', '#c9dfcf', '#8fb89c', '#e4ede3', '#6f9f80', '#8fb89c', '#cfe4d4'])
})

test('getTimeGreeting returns Chinese greetings by local hour', () => {
  assert.equal(getTimeGreeting(new Date('2026-07-02T07:00:00')), '早上好')
  assert.equal(getTimeGreeting(new Date('2026-07-02T12:00:00')), '中午好')
  assert.equal(getTimeGreeting(new Date('2026-07-02T15:00:00')), '下午好')
  assert.equal(getTimeGreeting(new Date('2026-07-02T21:00:00')), '晚上好')
})

test('settings prompt copy identifies the field as system prompt', () => {
  assert.equal(SYSTEM_PROMPT_COPY.nav, '系统提示词')
  assert.equal(SYSTEM_PROMPT_COPY.title, '系统提示词')
  assert.match(SYSTEM_PROMPT_COPY.hint, /系统提示词/)
  assert.match(SYSTEM_PROMPT_COPY.hint, /系统级指令/)
})

test('titlebar brand shows only the product name', () => {
  assert.equal(`${APP_BRAND_COPY.name}${APP_BRAND_COPY.subtitle}`, 'Lumen')
})

test('titlebar actions only include currently available sections', () => {
  assert.deepEqual(APP_TITLEBAR_ACTIONS.map((action) => action.label), ['工作区', '设置'])
})

test('workspace drawer is toggled from the titlebar icon, not an internal arrow', () => {
  const workspaceAction = APP_TITLEBAR_ACTIONS.find((action) => action.id === 'workspace')
  assert.equal('icon' in (workspaceAction ?? {}), false)
  assert.equal(APP_TITLEBAR_WORKSPACE_TOGGLE.icon, 'panel')
  assert.equal(APP_TITLEBAR_WORKSPACE_TOGGLE.position, 'before-workspace')
  assert.equal(APP_TITLEBAR_WORKSPACE_TOGGLE.buttonSize, 36)
  assert.equal(APP_TITLEBAR_WORKSPACE_TOGGLE.iconSize, 22)
  assert.equal(APP_TITLEBAR_WORKSPACE_TOGGLE.gapToLabel, 4)
  assert.equal(WORKSPACE_DRAWER_COPY.internalCollapseGlyph, '')
})
