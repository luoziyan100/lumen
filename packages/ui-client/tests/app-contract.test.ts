import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getTimeGreeting } from '../src/greeting.ts'
import { SYSTEM_PROMPT_COPY } from '../src/settingsCopy.ts'
import { APP_BRAND_COPY, APP_TITLEBAR_ACTIONS, APP_TITLEBAR_WORKSPACE_TOGGLE, WORKSPACE_DRAWER_COPY } from '../src/appCopy.ts'

// aura 相关断言随 aura 动效一并移除(2026-07-06 重构:画布改纯色暖纸)。
// 本文件留存的是与 aura 无关的 UI 契约:问候文案、设置文案、标题栏形制。

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
  // 设置已迁到侧栏左下角账户区;标题栏只留工作区
  assert.deepEqual(APP_TITLEBAR_ACTIONS.map((action) => action.label), ['工作区'])
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

test('navigation icon controls share one visual size', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(css, /\.nav-icon-btn\s*{[^}]*width:\s*36px;[^}]*height:\s*36px;/s)
  assert.match(css, /\.nav-icon-btn svg\s*{[^}]*width:\s*22px;[^}]*height:\s*22px;/s)
})
