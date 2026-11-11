/**
 * [INPUT]: 真实 WorkspaceApp/Composer/Welcome与React DOM、HTTP/Mastra 服务及确定性模型响应
 * [OUTPUT]: 新对话入口/恢复旧空选择的延迟建会话、历史切换草稿保留、提交竞赛、斜杠技能与会话轮询时序的行为证据
 * [POS]: 组件级 Mastra 客户端回归；控制上传/提交与轮询网络时序，实际组件和服务处理消息；不宣称覆盖 WebKit
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { createElement, StrictMode, act } from 'react'
import { JSDOM } from 'jsdom'
import { serve } from '@hono/node-server'
import { createHttpService } from '../../mastra-service/src/server.ts'
import { fixtureProvider, textReply } from '../../mastra-service/tests/provider-fixture.ts'
import { LumenApi, type Identity } from '../src/mastra/data/client.ts'
import { SessionFeed, messageText } from '../src/mastra/data/feed.ts'
import { MASTRA_COPY as C } from '../src/copy/mastraCopy.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'NodeFilter', 'Text', 'DocumentFragment', 'MutationObserver', 'localStorage', 'getComputedStyle']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } })
Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) })
after(() => dom.window.close())
register('./helpers/tsx-loader.mjs', import.meta.url)
// ---- Node 沿用文件回归的 Vite 资源入口；组件与服务保持真实 ----
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(specifier, context, next) { if (specifier.endsWith('?url')) return { url: 'data:text/javascript,export default "test-worker-url"', shortCircuit: true }; return next(specifier, context) }`), import.meta.url)
const { createRoot } = await import('react-dom/client')
const { Specialists } = await import('../src/mastra/views/conversation/Specialists.tsx')
const { Conversation } = await import('../src/mastra/views/Conversation.tsx')
const { Composer } = await import('../src/mastra/views/conversation/Composer.tsx')
const { Welcome } = await import('../src/mastra/views/conversation/welcome/Welcome.tsx')
const { WorkspaceApp } = await import('../src/mastra/views/WorkspaceApp.tsx')

function gate() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

function capturePolls(milliseconds: number) {
  const original = window.setInterval, callbacks: Array<() => void> = []
  window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    if (timeout === milliseconds && typeof handler === 'function') { callbacks.push(() => handler(...args)); return 0 }
    return original.call(window, handler, timeout, ...args)
  }) as typeof window.setInterval
  return { tick() { assert.ok(callbacks.length, '没有启动目标轮询'); callbacks.at(-1)!() }, restore() { window.setInterval = original } }
}

async function until(check: () => boolean, message: string) {
  const limit = Date.now() + 8000
  while (!check()) {
    if (Date.now() > limit) throw new Error(message)
    await act(async () => { await delay(10) })
  }
}

async function environment(prefix: string) {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-composer-')), token = 'composer-test-token-at-least-24-characters'
  const fixture = fixtureProvider(() => textReply('回复完成'))
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const network: { before?: (request: Request) => Promise<Response | void> } = {}
  const requests: Array<{ url: URL; method: string; identity?: Identity }> = []
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: async request => {
    const url = new URL(request.url), identity = request.method === 'POST' && url.pathname === '/lumen/sessions' ? await request.clone().json() as Identity : undefined
    requests.push({ url, method: request.method, identity })
    return await network.before?.(request.clone()) ?? service.app.fetch(request)
  } })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const api = new LumenApi({ baseUrl: `http://127.0.0.1:${address.port}`, token })
  const a = { projectId: prefix, taskId: 'a' }, b = { projectId: `${prefix}-other`, taskId: 'a' }
  for (const identity of [a, b]) {
    await api.request('/lumen/projects', 'POST', { id: identity.projectId, name: identity.projectId }); await api.open(identity)
  }
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  let feed: SessionFeed | undefined
  return { api, a, b, element, requests, network, memory: service.application.memory,
    async select(identity: Identity, activePath?: string) {
      feed?.close(); feed = new SessionFeed(api, identity)
      await act(async () => { root.render(createElement(StrictMode, {}, createElement(Composer, {
        key: `${identity.projectId}:${identity.taskId}`, api, identity, feed: feed!, connected: true, canStop: false, queued: 0, activePath, onActivity() {},
      }))) })
    },
    async welcome(projectId: string, onSession: (identity: Identity) => void) {
      await act(async () => root.render(createElement(Welcome, { key: projectId, api, projectId, onSession, onSettings() {} })))
    },
    async workspace(saved: Identity | null = null) {
      localStorage.setItem('lumen.mastra.selection', JSON.stringify(saved))
      if (!dom.window.HTMLElement.prototype.scrollTo) Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollTo', {
        configurable: true, value(this: HTMLElement, options: ScrollToOptions) { this.scrollTop = Number(options.top ?? 0) },
      })
      await act(async () => root.render(createElement(StrictMode, {}, createElement(WorkspaceApp, { connection: api.connection }))))
    },
    async click(name: string) {
      const button = [...element.querySelectorAll<HTMLButtonElement>('button')].find(item => !item.disabled && !item.closest('[aria-hidden="true"], [inert]') && (item.textContent?.trim() === name || item.getAttribute('aria-label') === name))
      assert.ok(button, `未找到按钮：${name}`); await act(async () => button.click())
    },
    async specialists(identity: Identity, idle: boolean) {
      await act(async () => root.render(createElement(Specialists, { api, identity, idle, onActivity() {} })))
    },
    async conversation(identity: Identity) {
      feed?.close()
      await act(async () => root.render(createElement(Conversation, { key: `${identity.projectId}:${identity.taskId}`, api, identity, onActivity() {}, onOpenFile() {} })))
    },
    async text(value: string) {
      const input = element.querySelector('textarea')!
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
      assert.equal(input.value, value)
    },
    async attach(files: File[]) {
      const input = element.querySelector('input[type=file]')!
      Object.defineProperty(input, 'files', { configurable: true, value: files })
      await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
    },
    async key(key: string) {
      const input = element.querySelector('textarea')!
      await act(async () => { input.focus(); input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })
    },
    async submit(times = 1) {
      await act(async () => { for (let i = 0; i < times; i++) element.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })) })
    },
    async restore() {
      const button = [...element.querySelectorAll('button')].find(button => button.textContent === C.restoreDraft)
      assert.ok(button); await act(async () => { button.click() })
    },
    async messages(identity: Identity) { return (await api.session(identity).listMessages(`${identity.projectId}:${identity.taskId}`, { page: 0, perPage: 200 })).messages.map(messageText).join('\n') },
    async answer(identity: Identity) {
      let text = '', attempts = 0
      while (!text.includes('回复完成')) {
        if (++attempts > 400) throw new Error('服务未保存原生回复')
        await act(async () => { await delay(20); text = await this.messages(identity) })
      }
      return text
    },
    async close() {
      feed?.close(); await act(async () => root.unmount()); element.remove()
      server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      await service.close(); await rm(dataRoot, { recursive: true, force: true })
    },
  }
}

test('CT-MASTRA-COMPOSER-001: StrictMode 切项目与同名会话后草稿和附件仍各自保留', { timeout: 20000 }, async () => {
  const env = await environment('draft-remount')
  try {
    const saved = `lumen:mastra:draft:v1:${JSON.stringify([env.a.projectId, env.a.taskId])}`
    localStorage.setItem(saved, '此前保存的草稿')
    await env.select(env.a); assert.equal(env.element.querySelector('textarea')!.value, '此前保存的草稿')
    await env.text('A 未发送的研究问题'); await env.attach([new File(['A'], 'a.txt')])
    assert.equal(localStorage.getItem(saved), 'A 未发送的研究问题')
    await env.select(env.b); assert.equal(env.element.querySelector('textarea')!.value, ''); assert.ok(!env.element.textContent!.includes('a.txt'))
    await env.text('B 的新草稿'); await env.attach([new File(['B'], 'b.txt')])
    await env.select(env.a)
    assert.equal(env.element.querySelector('textarea')!.value, 'A 未发送的研究问题')
    assert.ok(env.element.textContent!.includes('a.txt')); assert.ok(!env.element.textContent!.includes('b.txt'))
    await env.select(env.b); assert.equal(env.element.querySelector('textarea')!.value, 'B 的新草稿')
    assert.ok(env.element.textContent!.includes('b.txt'))
  } finally { await env.close() }
})

test('CT-MASTRA-COMPOSER-005: 斜杠过滤、上下键和回车只激活技能；空结果不会发送', { timeout: 25000 }, async () => {
  const env = await environment('skill-keyboard')
  try {
    for (const name of ['alpha', 'beta']) await env.api.installSkillPackage(env.a, [{
      path: `${name}/SKILL.md`, file: new File([`---\nname: ${name}\ndescription: ${name} 研究技能\n---\n${name} 的研究步骤`], 'SKILL.md'),
    }], 'project')
    await env.select(env.a); await env.text('/')
    await until(() => document.querySelectorAll('[role=option]').length === 2, '斜杠未显示当前项目技能')
    await env.key('ArrowDown'); await env.key('Enter')
    await until(() => env.element.querySelector('textarea')!.value.includes('beta 的研究步骤'), '键盘选择未激活指定技能')
    assert.equal(env.requests.filter(item => item.method === 'POST' && item.url.pathname.endsWith('/messages')).length, 0)
    await env.text('/alpha')
    await until(() => document.querySelectorAll('[role=option]').length === 1, '技能过滤未更新')
    await env.key('ArrowUp'); await env.key('Enter')
    await until(() => env.element.querySelector('textarea')!.value.includes('alpha 的研究步骤'), '过滤后选择错误')
    await env.text('/missing'); await until(() => !!document.querySelector('.skill-slash-empty'), '未展示空结果')
    await env.key('Enter'); assert.equal(env.element.querySelector('textarea')!.value, '/missing')
    assert.equal(env.requests.filter(item => item.method === 'POST' && item.url.pathname.endsWith('/messages')).length, 0)
    await env.key('Escape'); assert.equal(env.element.querySelector('textarea')!.value, '')
    assert.equal(document.querySelector('.skill-slash-menu'), null)
  } finally { await env.close() }
})

test('CT-MASTRA-COMPOSER-002: 上传中切走仍提交原会话一次，后来输入不被清空', { timeout: 25000 }, async () => {
  const env = await environment('draft-send'), started = gate(), release = gate()
  try {
    env.network.before = async request => { if (new URL(request.url).pathname === '/lumen/uploads') { started.resolve(); await release.promise } }
    await env.select(env.a, 'notes/current-draft.md'); await env.text('A 已确认发送'); await env.attach([new File(['材料'], 'evidence.txt')]); await env.submit(2)
    await started.promise
    await env.text('A 后来输入'); await env.select(env.b); await env.text('B 不应被污染')
    assert.equal(env.element.querySelector('.active-doc-chip'), null)
    release.resolve()
    await until(() => env.requests.some(item => item.method === 'POST' && item.url.pathname.endsWith('/messages')), '切走后已授权的提交消失')
    await env.select(env.a); await until(() => !env.element.textContent!.includes(C.submitting) && !env.element.textContent!.includes(C.uploading), '提交状态未释放')
    assert.equal(env.element.querySelector('textarea')!.value, 'A 后来输入')
    const messages = await env.answer(env.a)
    assert.match(messages, /A 已确认发送/); assert.match(messages, /evidence\.txt/)
    assert.match(messages, /当前稿（本会话工作区路径）：notes\/current-draft\.md/)
    assert.doesNotMatch(await env.messages(env.b), /A 已确认发送|current-draft\.md/)
    assert.equal(env.requests.filter(item => item.method === 'POST' && item.url.pathname.endsWith('/messages')).length, 1)
    await env.select(env.b); assert.equal(env.element.querySelector('textarea')!.value, 'B 不应被污染')
  } finally { release.resolve(); await env.close() }
})

test('CT-MASTRA-COMPOSER-003: 部分上传失败在原会话恢复剩余附件，保留新草稿且不重复上传已成功文件', { timeout: 25000 }, async () => {
  const env = await environment('draft-recover'), failed = gate(), release = gate()
  const uploaded: string[] = []
  try {
    env.network.before = async request => {
      if (new URL(request.url).pathname !== '/lumen/uploads') return
      const file = (await request.formData()).get('file') as File; uploaded.push(file.name)
      if (uploaded.length === 2) { failed.resolve(); await release.promise; return Response.json({ error: 'test upload rejected' }, { status: 400 }) }
    }
    await env.select(env.a); await env.text('A 部分上传'); await env.attach([new File(['1'], 'first.txt'), new File(['2'], 'second.txt')]); await env.submit()
    await failed.promise; await env.text('A 后写的内容'); await env.attach([new File(['3'], 'later.txt')]); await env.select(env.b); await env.text('B 的内容')
    release.resolve(); await delay(30); await env.select(env.a)
    await until(() => env.element.textContent!.includes(C.sendFailed), '原会话未收到失败恢复入口')
    assert.equal(env.element.querySelector('textarea')!.value, 'A 后写的内容')
    await env.restore()
    const restored = env.element.querySelector('textarea')!.value
    assert.match(restored, /A 部分上传/); assert.match(restored, /first\.txt/); assert.match(restored, /A 后写的内容/)
    assert.ok(env.element.textContent!.includes('second.txt')); assert.ok(env.element.textContent!.includes('later.txt'))
    assert.ok(!env.element.textContent!.includes(C.sendFailed))
    await env.submit(); await until(() => env.requests.some(item => item.method === 'POST' && item.url.pathname.endsWith('/messages')), '恢复后未发出消息')
    assert.deepEqual(uploaded, ['first.txt', 'second.txt', 'second.txt', 'later.txt'])
    const messages = await env.answer(env.a)
    for (const expected of ['A 部分上传', 'A 后写的内容', 'first.txt', 'second.txt', 'later.txt']) assert.ok(messages.includes(expected))
    await env.select(env.b); assert.equal(env.element.querySelector('textarea')!.value, 'B 的内容')
  } finally { release.resolve(); await env.close() }
})

test('CT-MASTRA-COMPOSER-004: 原生消息迟到拒绝不覆盖后来提交和草稿，已上传附件可直接恢复引用', { timeout: 25000 }, async () => {
  const env = await environment('draft-send-fail'), started = gate(), release = gate()
  try {
    env.network.before = async request => {
      if (request.method !== 'POST' || !new URL(request.url).pathname.endsWith('/messages')) return
      if (!(await request.json()).message.includes('先发的消息')) return
      started.resolve(); await release.promise
      return Response.json({ error: 'test message rejected' }, { status: 400 })
    }
    await env.select(env.a); await env.text('先发的消息'); await env.attach([new File(['材料'], 'saved.txt')]); await env.submit()
    await act(async () => { await started.promise })
    await env.text('后发的消息'); await env.submit(); await env.text('最后保留的草稿')
    await env.select(env.b); await env.text('B 独立内容')
    assert.match(await env.answer(env.a), /后发的消息/)
    release.resolve(); await env.select(env.a)
    await until(() => env.element.textContent!.includes(C.sendFailed), '原生拒绝后恢复入口丢失')
    assert.equal(env.element.querySelector('textarea')!.value, '最后保留的草稿')
    await env.restore()
    const content = env.element.querySelector('textarea')!.value
    assert.match(content, /先发的消息/); assert.match(content, /saved\.txt/); assert.match(content, /最后保留的草稿/)
    assert.equal(env.element.querySelectorAll('.mw-attachment').length, 0)
    assert.equal(env.requests.filter(item => item.url.pathname === '/lumen/uploads').length, 1)
    assert.doesNotMatch(await env.messages(env.a), /先发的消息/)
    await env.select(env.b); assert.equal(env.element.querySelector('textarea')!.value, 'B 独立内容')
  } finally { release.resolve(); await env.close() }
})


test('输入框随草稿增长至168px、删除后收缩，切会话恢复草稿时重新量高', { timeout: 20000 }, async () => {
  const env = await environment('draft-height')
  const prototype = dom.window.HTMLTextAreaElement.prototype
  Object.defineProperty(prototype, 'scrollHeight', { configurable: true, get() { return this.value.length > 30 ? 240 : this.value.length > 5 ? 96 : 44 } })
  try {
    await env.select(env.a); assert.equal(env.element.querySelector('textarea')!.style.height, '44px')
    await env.text('跨行研究问题'); assert.equal(env.element.querySelector('textarea')!.style.height, '96px')
    await env.text('研究问题'.repeat(20)); assert.equal(env.element.querySelector('textarea')!.style.height, '168px')
    await env.select(env.b); assert.equal(env.element.querySelector('textarea')!.style.height, '44px')
    await env.select(env.a); assert.equal(env.element.querySelector('textarea')!.style.height, '168px')
    await env.text('短'); assert.equal(env.element.querySelector('textarea')!.style.height, '44px')
  } finally { delete (prototype as unknown as {scrollHeight?: number}).scrollHeight; await env.close() }
})

test('滚动离开最新与轮次跳转显示回到底部，点击后恢复跟随且按钮在输入坞内', { timeout: 25000 }, async () => {
  const env = await environment('jump-latest')
  const prototype = dom.window.HTMLElement.prototype
  Object.defineProperty(prototype, 'scrollTo', { configurable: true, value(this: HTMLElement, options: ScrollToOptions) { this.scrollTop = Number(options.top ?? 0) } })
  try {
    const threadId = `${env.a.projectId}:${env.a.taskId}`
    await env.memory.saveMessages({ messages: Array.from({ length: 8 }, (_, index) => ({ id: `scroll-${index}`, threadId, resourceId: threadId, role: index % 2 ? 'assistant' as const : 'user' as const, createdAt: new Date(Date.now() + index), content: { format: 2 as const, parts: [{ type: 'text' as const, text: `第${index}条研究内容` }] } })) })
    await env.conversation(env.a)
    await until(() => env.element.querySelectorAll('.mw-message').length >= 8, '对话历史未加载')
    const transcript = env.element.querySelector<HTMLElement>('.mw-transcript')!
    Object.defineProperties(transcript, { scrollHeight: { configurable: true, value: 1200 }, clientHeight: { configurable: true, value: 400 } })
    assert.equal(env.element.querySelector('.jump-latest'), null)
    await act(async () => { transcript.scrollTop = 100; transcript.dispatchEvent(new dom.window.Event('scroll', { bubbles: true })) })
    const jump = env.element.querySelector<HTMLButtonElement>('.composer-dock .jump-latest')!
    assert.ok(jump)
    await act(async () => jump.click())
    assert.equal(transcript.scrollTop, 1200); assert.equal(env.element.querySelector('.jump-latest'), null)
    await act(async () => { transcript.scrollTop = 1160; transcript.dispatchEvent(new dom.window.Event('scroll', { bubbles: true })) })
    assert.ok(env.element.querySelector('.composer-dock .jump-latest'), '离底部不到 100px 的上滑仍被当成贴底')
    await act(async () => { transcript.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaY: -4, bubbles: true })) })
    assert.ok(env.element.querySelector('.composer-dock .jump-latest'))
    const tick = env.element.querySelector<HTMLButtonElement>('.turn-rail-hit')
    assert.ok(tick)
    await act(async () => tick.click())
    assert.ok(env.element.querySelector('.composer-dock .jump-latest'))
  } finally { await env.close(); delete (prototype as unknown as {scrollTo?: unknown}).scrollTo }
})


test('专家继续提交202交给原审批呈现，不留下过期提示，失败仍展示错误并保留要求', { timeout: 20000 }, async () => {
  const env = await environment('specialist-notice')
  let accepted = true
  env.network.before = async request => {
    const path = new URL(request.url).pathname
    if (path === '/lumen/specialists') return Response.json({ specialists: [{ id: 'expert', role: '核对专家', title: '文献核对', directory: 'experts/a', continuations: 1, canContinue: true, status: 'completed' }] })
    if (path === '/lumen/specialists/continue') return accepted ? Response.json({ continued: false, pendingApproval: true }, { status: 202 }) : Response.json({ error: '专家暂不可继续' }, { status: 409 })
  }
  try {
    await env.specialists(env.a, true)
    await until(() => env.element.textContent!.includes('继续研究'), '专家目录未加载')
    const start = () => [...env.element.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '继续研究')!
    await act(async () => start().click()); await env.text('核对引用')
    await env.submit()
    await until(() => env.element.querySelector('form') === null, '接受后未关闭继续表单')
    await env.specialists(env.a, false); await env.specialists(env.a, true)
    assert.ok(!env.element.textContent!.includes('等待本轮审批'))
    accepted = false
    await act(async () => start().click()); await env.text('保留失败后的要求'); await env.submit()
    await until(() => env.element.textContent!.includes('专家暂不可继续'), '继续失败未呈现')
    assert.equal(env.element.querySelector('textarea')!.value, '保留失败后的要求')
  } finally { await env.close() }
})

test('专家轮询在前次响应未结束时不重叠，完成后继续取得最新状态', { timeout: 20000 }, async () => {
  const env = await environment('specialist-serial'), polling = capturePolls(3000), started = gate(), release = gate()
  let calls = 0
  env.network.before = async request => {
    if (new URL(request.url).pathname !== '/lumen/specialists') return
    const call = ++calls
    if (call === 1) { started.resolve(); await release.promise }
    return Response.json({ specialists: [{ id: 'expert', role: '核对专家', title: '文献核对', directory: 'experts/a', continuations: 0, canContinue: call > 1, status: call === 1 ? 'running' : 'completed' }] })
  }
  try {
    await env.specialists(env.a, true); await started.promise
    await act(async () => { polling.tick(); polling.tick(); await delay(30) })
    assert.equal(calls, 1, '前次请求未返回时发出了重叠轮询')
    release.resolve(); await until(() => env.element.textContent!.includes('研究中'), '前次响应未显示')
    await act(async () => polling.tick())
    await until(() => env.element.textContent!.includes('已完成'), '串行轮询未继续刷新')
    assert.equal(calls, 2)
  } finally { release.resolve(); polling.restore(); await env.close() }
})

test('Conversation 子任务轮询在途时串行，完成状态恢复发送入口', { timeout: 20000 }, async () => {
  const env = await environment('children-serial'), polling = capturePolls(2000), started = gate(), release = gate()
  const scrollTo = Object.getOwnPropertyDescriptor(dom.window.HTMLElement.prototype, 'scrollTo')
  Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollTo', { configurable: true, value(this: HTMLElement, options: ScrollToOptions) { this.scrollTop = Number(options.top ?? 0) } })
  let held = false, calls = 0
  env.network.before = async request => {
    if (new URL(request.url).pathname !== '/lumen/children') return
    if (!held) return Response.json({ tasks: [] })
    const call = ++calls
    if (call === 1) { started.resolve(); await release.promise }
    return Response.json({ tasks: [{ id: 'child', toolName: 'reader', status: call === 1 ? 'running' : 'completed' }] })
  }
  try {
    await env.conversation(env.a)
    await until(() => env.element.querySelector('.mw-connection') === null, '会话未连接')
    await act(async () => { await delay(30); held = true; polling.tick() }); await started.promise
    await act(async () => { polling.tick(); polling.tick(); await delay(30) })
    assert.equal(calls, 1, '前次请求未返回时发出了重叠子任务轮询')
    release.resolve(); await until(() => env.element.querySelector('.mw-children')?.textContent?.includes(C.childStatus.running) ?? false, '运行子任务未显示')
    assert.ok([...env.element.querySelectorAll('button')].some(button => button.textContent === C.stopChild), '运行子任务未提供停止入口')
    await act(async () => polling.tick())
    await until(() => env.element.querySelector('.mw-children')?.textContent?.includes(C.childStatus.completed) ?? false, '最新完成状态未显示')
    assert.equal(calls, 2)
    assert.equal(env.element.querySelector('.composer-btn-stop'), null)
    assert.ok(env.element.querySelector('.composer-btn-send'), '完成后发送入口未恢复')
  } finally {
    release.resolve(); polling.restore(); await env.close()
    if (scrollTo) Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollTo', scrollTo)
    else delete (dom.window.HTMLElement.prototype as unknown as { scrollTo?: unknown }).scrollTo
  }
})


test('欢迎输入卡浏览不建会话；准备失败保留文本附件，重试只发一次', async () => {
  const env = await environment('welcome-retry')
  const selected: Identity[] = []
  let attempts = 0
  try {
    const initial = env.requests.length
    await env.welcome(env.a.projectId, value => selected.push(value))
    await env.text('研究欢迎草稿')
    await env.attach([new File(['source'], 'welcome.txt', { type: 'text/plain' })])
    assert.equal(env.requests.slice(initial).filter(request => request.method === 'POST').length, 0)
    env.network.before = async request => {
      if (new URL(request.url).pathname === '/lumen/sessions' && request.method === 'POST' && ++attempts === 1) return Response.json({ error: '准备失败' }, { status: 503 })
    }
    await env.submit()
    await until(() => env.element.textContent!.includes('准备失败'), '未显示会话准备失败')
    assert.ok(env.element.textContent!.includes('研究欢迎草稿'))
    assert.ok(env.element.textContent!.includes('welcome.txt'))
    assert.equal(selected.length, 0)
    await env.restore(); await env.submit(2)
    await until(() => selected.length === 1, '欢迎发送未选择已创建会话')
    assert.equal(attempts, 2)
    const text = await env.answer(selected[0])
    assert.match(text, /研究欢迎草稿/)
    assert.match(text, /welcome.txt/)
  } finally { await env.close() }
})

test('欢迎准备期间切项目，已确认提交仍归原项目且不抢回选择', async () => {
  const env = await environment('welcome-switch'), opened = gate(), release = gate()
  const selected: Identity[] = []
  let target: Identity | null = null
  try {
    env.network.before = async request => {
      if (new URL(request.url).pathname === '/lumen/sessions' && request.method === 'POST') {
        target = await request.json() as Identity; opened.resolve(); await release.promise
      }
    }
    await env.welcome(env.a.projectId, value => selected.push(value)); await env.text('留在原项目的研究')
    await env.submit(); await opened.promise
    await env.select(env.b); release.resolve()
    await env.answer(target!)
    assert.equal(selected.length, 0)
    assert.equal(target!.projectId, env.a.projectId)
    assert.ok(!(await env.messages(env.b)).includes('留在原项目的研究'))
  } finally { release.resolve(); await env.close() }
})

test('欢迎斜杠技能先准备真实会话，只读取技能不发送研究', async () => {
  const env = await environment('welcome-skills')
  let target: Identity | null = null
  const selected: Identity[] = []
  try {
    env.network.before = async request => {
      if (new URL(request.url).pathname === '/lumen/sessions' && request.method === 'POST') target = await request.json() as Identity
    }
    await env.welcome(env.a.projectId, value => selected.push(value)); await env.text('/')
    await until(() => Boolean(target) && env.requests.some(request => request.url.pathname === '/lumen/skills'), '技能入口未准备真实会话')
    await until(() => !env.element.textContent!.includes('正在读取技能…'), '技能未加载')
    assert.equal(selected.length, 0)
    assert.equal(await env.messages(target!), '')
    assert.equal(env.element.querySelector('textarea')!.value, '/')
  } finally { await env.close() }
})

test('欢迎准备期间新增输入不进入已确认快照，发送后仍留在草稿', async () => {
  const env = await environment('welcome-snapshot'), opened = gate(), release = gate()
  const selected: Identity[] = []
  try {
    env.network.before = async request => {
      if (new URL(request.url).pathname === '/lumen/sessions' && request.method === 'POST') { opened.resolve(); await release.promise }
    }
    await env.welcome(env.a.projectId, value => selected.push(value))
    await env.text('已经确认的研究'); await env.attach([new File(['first'], 'confirmed.txt', { type: 'text/plain' })])
    await env.submit(); await opened.promise
    await env.text('下一条尚未确认'); await env.attach([new File(['later'], 'later.txt', { type: 'text/plain' })])
    release.resolve()
    await until(() => selected.length === 1, '研究未完成提交')
    const text = await env.answer(selected[0])
    assert.match(text, /已经确认的研究/); assert.match(text, /confirmed.txt/)
    assert.ok(!text.includes('下一条尚未确认')); assert.ok(!text.includes('later.txt'))
    assert.equal(env.element.querySelector('textarea')!.value, '下一条尚未确认')
    assert.ok(env.element.textContent!.includes('later.txt'))
    await env.select(selected[0])
    assert.equal(env.element.querySelector('textarea')!.value, '下一条尚未确认')
    assert.ok(env.element.textContent!.includes('later.txt'))
  } finally { release.resolve(); await env.close() }
})

test('不同本地服务的同名项目欢迎草稿与附件隔离', async () => {
  const first = await environment('welcome-endpoint'), second = await environment('welcome-endpoint')
  try {
    await first.welcome(first.a.projectId, () => {})
    await first.text('只属于第一个服务'); await first.attach([new File(['private'], 'first-service.txt')])
    await second.welcome(second.a.projectId, () => {})
    assert.equal(second.element.querySelector('textarea')!.value, '')
    assert.ok(!second.element.textContent!.includes('first-service.txt'))
    assert.equal(first.element.querySelector('textarea')!.value, '只属于第一个服务')
  } finally { await first.close(); await second.close() }
})

test('工作台新对话与项目加号只回欢迎态，首次重复提交只建一个目标项目会话并进入导航', { timeout: 30000 }, async () => {
  const env = await environment('workspace-new'), started = gate(), release = gate()
  const saved = () => JSON.parse(localStorage.getItem('lumen.mastra.selection') ?? 'null') as Identity | null
  const creations = () => env.requests.filter(request => request.method === 'POST' && (request.url.pathname === '/lumen/sessions' || /^\/lumen\/projects\/[^/]+\/sessions$/.test(request.url.pathname)))
  let target: Identity | null = null
  try {
    const threadId = `${env.a.projectId}:${env.a.taskId}`
    await env.memory.saveMessages({ messages: [{ id: 'workspace-history', threadId, resourceId: threadId, role: 'user', createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text: '已有历史研究内容' }] } }] })
    await env.api.updateSession(env.a, { title: '已有历史研究' })
    const initialThreads = (await env.memory.listThreads({ perPage: false })).threads.map(thread => thread.id).sort()
    env.requests.length = 0
    await env.workspace(env.a)
    await until(() => env.element.querySelector('.mw-message')?.textContent?.includes('已有历史研究内容') ?? false, '工作台未恢复已有消息会话')
    await until(() => env.element.querySelector('aside')?.textContent?.includes('已有历史研究') ?? false, '历史会话未进入导航')
    assert.deepEqual(saved(), env.a)
    assert.ok(![...env.element.querySelectorAll('aside .sb-item')].some(item => item.textContent === '新研究'), '旧默认空会话仍出现在导航')
    await env.click('搜索对话')
    await until(() => [...document.querySelectorAll('[role=option]')].some(item => item.textContent?.includes('已有历史研究')), '历史会话未出现在搜索')
    assert.ok(![...document.querySelectorAll('[role=option]')].some(item => item.textContent === '新研究'), '旧默认空会话仍出现在搜索')
    await act(async () => [...document.querySelectorAll<HTMLElement>('[role=option]')].find(item => item.textContent?.includes('已有历史研究'))!.click())
    env.requests.length = 0
    for (let click = 0; click < 3; click++) {
      await env.click('新对话'); assert.equal(saved(), null)
    }
    for (let click = 0; click < 2; click++) {
      await env.click(`在${env.b.projectId}新建对话`); assert.equal(saved(), null)
    }
    assert.equal(env.element.querySelector('.sb-folder-main[aria-pressed="true"]')?.textContent, env.b.projectId)
    await env.key('Enter'); await env.text('   '); await env.key('Enter')
    await env.text('只在目标项目首次发送'); await env.attach([new File(['evidence'], 'first-send.txt', { type: 'text/plain' })])
    assert.equal(saved(), null)
    assert.equal(creations().length, 0, '浏览新对话、输入或附件提前发出了创建请求')
    assert.deepEqual((await env.memory.listThreads({ perPage: false })).threads.map(thread => thread.id).sort(), initialThreads)
    env.network.before = async request => {
      if (request.method === 'POST' && new URL(request.url).pathname === '/lumen/sessions') { target = await request.json() as Identity; started.resolve(); await release.promise }
    }
    await env.submit(2); await started.promise
    assert.equal(creations().length, 1, '创建在途时重复提交建了多个会话')
    assert.equal(target!.projectId, env.b.projectId); assert.equal(saved(), null)
    release.resolve()
    await until(() => saved()?.taskId === target?.taskId, '首次发送后未选中已创建会话')
    assert.deepEqual(saved(), target)
    await until(() => env.element.querySelector('nav[aria-label="最近会话"] .sb-item[aria-current="page"]') !== null, '首次发送会话未进入导航')
    const messages = await env.answer(target!)
    assert.match(messages, /只在目标项目首次发送/); assert.match(messages, /first-send\.txt/)
    assert.ok(creations().every(request => request.identity?.projectId === target!.projectId && request.identity.taskId === target!.taskId), '首次发送绑定了额外会话身份')
    assert.equal(env.requests.filter(request => request.method === 'POST' && /^\/lumen\/projects\/[^/]+\/sessions$/.test(request.url.pathname)).length, 0)
    assert.equal(env.requests.filter(request => request.method === 'POST' && request.url.pathname.endsWith('/messages')).length, 1)
    const threads = (await env.memory.listThreads({ perPage: false })).threads
    assert.equal(threads.length, initialThreads.length + 1)
    assert.ok(threads.some(thread => thread.id === `${env.b.projectId}:${target!.taskId}`))
    assert.ok((await env.api.sessions(env.b.projectId)).items.find(item => item.taskId === target!.taskId)?.lastMessageId)
  } finally { release.resolve(); await env.close(); localStorage.removeItem('lumen.mastra.selection') }
})

test('工作台切历史再回新对话保留欢迎草稿和附件，重复新入口不会重新分配草稿', { timeout: 25000 }, async () => {
  const env = await environment('workspace-draft')
  try {
    const threadId = `${env.a.projectId}:${env.a.taskId}`
    await env.memory.saveMessages({ messages: [{ id: 'draft-history', threadId, resourceId: threadId, role: 'user', createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text: '可重新打开的历史内容' }] } }] })
    await env.api.updateSession(env.a, { title: '草稿切换历史' })
    env.requests.length = 0
    await env.workspace(env.a)
    await until(() => env.element.querySelector('.mw-message')?.textContent?.includes('可重新打开的历史内容') ?? false, '历史未恢复')
    await until(() => env.element.querySelector('aside')?.textContent?.includes('草稿切换历史') ?? false, '历史未进入导航')
    env.requests.length = 0
    await env.click('新对话'); await env.text('尚未发送的欢迎草稿')
    await env.attach([new File(['draft'], 'unsent.txt', { type: 'text/plain' })])
    await env.click('草稿切换历史')
    await until(() => env.element.querySelector('.mw-message')?.textContent?.includes('可重新打开的历史内容') ?? false, '点击历史未打开原会话')
    assert.equal(env.element.querySelector('textarea')!.value, '')
    assert.equal(env.element.querySelectorAll('.mw-attachment').length, 0)
    await env.text('历史会话独立草稿'); await env.click('新对话')
    assert.equal(env.element.querySelector('textarea')!.value, '尚未发送的欢迎草稿')
    assert.ok(env.element.querySelector('.mw-attachment')?.textContent?.includes('unsent.txt'))
    await env.click(`在${env.a.projectId}新建对话`)
    assert.equal(env.element.querySelector('textarea')!.value, '尚未发送的欢迎草稿')
    assert.ok(env.element.querySelector('.mw-attachment')?.textContent?.includes('unsent.txt'))
    await env.click('草稿切换历史')
    assert.equal(env.element.querySelector('textarea')!.value, '历史会话独立草稿')
    assert.equal(env.requests.filter(request => request.method === 'POST' && /^\/lumen\/projects\/[^/]+\/sessions$/.test(request.url.pathname)).length, 0)
    assert.ok(env.requests.filter(request => request.method === 'POST' && request.url.pathname === '/lumen/sessions').every(request => request.identity?.projectId === env.a.projectId && request.identity.taskId === env.a.taskId), '历史往返绑定了未发送的欢迎身份')
    assert.equal((await env.memory.listThreads({ perPage: false })).threads.length, 2)
  } finally { await env.close(); localStorage.removeItem('lumen.mastra.selection') }
})

test('工作台恢复旧默认空选择后回欢迎态，保留原线程且不会自动创建', { timeout: 20000 }, async () => {
  const env = await environment('workspace-empty')
  try {
    env.requests.length = 0
    await env.workspace(env.b)
    await until(() => env.element.querySelector('.mw-center.chat-empty textarea') !== null && localStorage.getItem('lumen.mastra.selection') === 'null', '旧默认空选择未回到欢迎输入')
    assert.equal(env.element.querySelector('.sb-folder-main[aria-pressed="true"]')?.textContent, env.b.projectId)
    assert.equal(env.element.querySelectorAll('aside .sb-item').length, 0)
    assert.equal((await env.memory.listThreads({ perPage: false })).threads.length, 2)
    assert.equal((await env.api.sessions(env.b.projectId)).items.find(item => item.taskId === env.b.taskId)?.lastMessageId, null)
    assert.equal(env.requests.filter(request => request.method === 'POST' && (request.url.pathname === '/lumen/sessions' || /^\/lumen\/projects\/[^/]+\/sessions$/.test(request.url.pathname))).length, 0)
  } finally { await env.close(); localStorage.removeItem('lumen.mastra.selection') }
})
