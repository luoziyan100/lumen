/**
 * [INPUT]: 真实创建卡与可控产品API响应
 * [OUTPUT]: 创建失败留稿、绑定失败重试不重复建项目的交互证据
 * [POS]: 两步项目创建的UI回归，不写入正式数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createElement, act } from 'react'
import { JSDOM } from 'jsdom'
import type { Project } from '../src/mastra/data/client.ts'
register('./helpers/tsx-loader.mjs', import.meta.url)
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'HTMLInputElement', 'getComputedStyle']) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const { CreateProjectModal } = await import('../src/mastra/views/chrome/project/CreateProjectModal.tsx')

test('创建失败留稿；绑定失败后修改路径重试只绑定一次项目', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const saved = { id: 'project-1', name: '研究项目' } as Project
  let creates = 0; let binds = 0; let closes = 0; let completed: Project | null = null
  const api = {
    async createProject(name: string) { creates++; assert.equal(name, '研究项目'); if (creates === 1) throw new Error('创建失败'); return saved },
    async updateProjectSource(id: string, path: string | null) { binds++; assert.equal(id, saved.id); if (binds === 1) throw new Error('路径不存在'); assert.equal(path, '/valid'); return {} as Awaited<ReturnType<import('../src/mastra/data/client.ts').LumenApi['updateProjectSource']>> },
  }
  async function input(selector: string, value: string) {
    const field = host.querySelector<HTMLInputElement>(selector)!
    await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new window.Event('input', { bubbles: true })) })
  }
  async function submit() { await act(async () => { host.querySelector('form')!.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })) }) }
  try {
    await act(async () => root.render(createElement(CreateProjectModal, { api, onClose: () => { closes++ }, onCreated: value => { completed = value } })))
    await input('.create-proj-name', '  研究项目  '); await input('.create-proj-path', '/invalid')
    await submit()
    assert.match(host.querySelector('[role="alert"]')!.textContent!, /创建失败/)
    assert.equal(host.querySelector<HTMLInputElement>('.create-proj-name')!.value, '  研究项目  ')
    assert.equal(closes, 0)
    await submit()
    assert.match(host.querySelector('[role="alert"]')!.textContent!, /项目已创建，但源文件夹绑定失败/)
    assert.equal(host.querySelector<HTMLInputElement>('.create-proj-name')!.disabled, true)
    await input('.create-proj-path', '/valid'); await submit()
    assert.equal(creates, 2); assert.equal(binds, 2); assert.equal(closes, 1); assert.equal(completed, saved)
  } finally { await act(async () => root.unmount()); host.remove(); dom.window.close() }
})
