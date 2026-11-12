/**
 * [INPUT]: 真实 Sprite/SpriteFace/useSpeaking、React DOM、原生 HTTP/SSE 与可控模型流
 * [OUTPUT]: 文字增量/静默回落、真实组件卸载清计时器、减少动态切换、收起仍说话及展开不重复订阅的证据
 * [POS]: 精灵的数据与组件接线回归；图片、布局与 WebKit 效果另在桌面验收
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { createElement, act } from 'react'
import { JSDOM } from 'jsdom'
import { serve } from '@hono/node-server'
import { createHttpService } from '../../mastra-service/src/server.ts'
import { fixtureProvider, textReply } from '../../mastra-service/tests/provider-fixture.ts'
import { ensureTopic } from '../../mastra-service/tests/topic-fixture.ts'
import { LumenApi } from '../src/mastra/data/client.ts'
import { useSpeaking } from '../src/mastra/studio/useSpeaking.ts'
import { STUDIO_COPY as S } from '../src/copy/studioCopy.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'NodeFilter', 'Text', 'DocumentFragment', 'MutationObserver', 'localStorage', 'getComputedStyle', 'navigator']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } })
let reduced = false
const changes = new Set<() => void>()
Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ get matches() { return reduced }, addEventListener(_type: string, listener: () => void) { changes.add(listener) }, removeEventListener(_type: string, listener: () => void) { changes.delete(listener) } }) })
Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollTo', { configurable: true, value(this: HTMLElement, options: ScrollToOptions) { this.scrollTop = Number(options?.top ?? 0) } })
after(() => dom.window.close())
register('./helpers/tsx-loader.mjs', import.meta.url)
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(specifier, context, next) { if (specifier.endsWith('?url')) return { url: 'data:text/javascript,export default "test-worker-url"', shortCircuit: true }; return next(specifier, context) }`), import.meta.url)
const { createRoot } = await import('react-dom/client')
const { SpriteFace } = await import('../src/mastra/studio/SpriteFace.tsx')
const { Sprite } = await import('../src/mastra/studio/Sprite.tsx')

async function until(check: () => boolean, message: string) {
  const deadline = Date.now() + 10000
  while (!check()) {
    if (Date.now() > deadline) throw new Error(message)
    await act(async () => { await delay(15) })
  }
}

test('真实 hook：工具与思考不说话，文字增量开口，静默 600ms 与运行结束回落', async () => {
  const element = document.createElement('div'), root = createRoot(element)
  function Probe({ id, text }: { id: string | null; text: string }) { return createElement('output', {}, String(useSpeaking(id, text))) }
  async function show(id: string | null, text = '') { await act(async () => root.render(createElement(Probe, { id, text }))) }
  try {
    await show(null)
    await show('tool-only')
    assert.equal(element.textContent, 'false')
    await show('tool-only', '   ')
    assert.equal(element.textContent, 'false', '空白与工具/思考不算可见文字')
    await show('answer', '有文字了')
    assert.equal(element.textContent, 'true', '新消息第一段也算文字增量')
    await act(async () => { await delay(650) })
    assert.equal(element.textContent, 'false')
    await show('answer', '有文字了，继续')
    assert.equal(element.textContent, 'true')
    await show(null)
    assert.equal(element.textContent, 'false')
  } finally { await act(async () => root.unmount()) }
})

test('真实头像：减少动态立即退出眨眼，卸载清掉计时器和系统订阅', async () => {
  const element = document.createElement('div'), root = createRoot(element)
  const originalSet = window.setTimeout, originalClear = window.clearTimeout
  const pending = new Map<number, () => void>()
  let sequence = 0
  window.setTimeout = ((callback: () => void) => { pending.set(++sequence, callback); return sequence }) as typeof window.setTimeout
  window.clearTimeout = (handle: number) => { pending.delete(handle) }
  reduced = false
  try {
    await act(async () => root.render(createElement(SpriteFace, { state: 'idle', breathe: true })))
    assert.equal(pending.size, 1)
    const [id, blink] = [...pending][0]!
    pending.delete(id)
    await act(async () => blink())
    assert.equal(element.querySelector('.sprite-face')!.getAttribute('data-face'), 'blink')
    reduced = true
    await act(async () => { for (const change of changes) change() })
    assert.equal(element.querySelector('.sprite-face')!.getAttribute('data-face'), 'neutral')
    assert.equal(pending.size, 0)
    await act(async () => root.render(createElement(SpriteFace, { state: 'speaking' })))
    assert.equal(pending.size, 0)
    assert.equal(element.querySelectorAll('img[alt=""]').length, 5)
  } finally {
    await act(async () => root.unmount())
    assert.equal(pending.size, 0)
    assert.equal(changes.size, 0)
    window.setTimeout = originalSet; window.clearTimeout = originalClear; reduced = false
  }
})

test('原生 SSE 接线：收起时照样说话，打开只用一个订阅，工具状态不冒充文字', { timeout: 30000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-sprite-view-'))
  const fallback = fixtureProvider(() => textReply('标题'))
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined
  const encode = new TextEncoder()
  const fetch: typeof globalThis.fetch = async (url, init) => {
    const request = JSON.parse(String(init?.body)) as { stream?: boolean; tools?: unknown[] }
    if (!request.stream || !request.tools?.length) return fallback.fetch(url, init)
    return new Response(new ReadableStream({ start(controller) { stream = controller } }), { headers: { 'Content-Type': 'text/event-stream' } })
  }
  function chunk(delta: object, finish: string | null = null) {
    stream!.enqueue(encode.encode(`data: ${JSON.stringify({ id: 'sprite-stream', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`))
  }
  const service = await createHttpService({ dataRoot, token: 'sprite-view-token-at-least-24-characters', model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch } })
  let subscriptions = 0
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: request => {
    if (new URL(request.url).pathname.endsWith('/stream')) subscriptions++
    return service.app.fetch(request)
  } })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const api = new LumenApi({ baseUrl: `http://127.0.0.1:${address.port}`, token: 'sprite-view-token-at-least-24-characters' })
  const identity = { topicId: 'sprite-live', taskId: 'answer' }
  ensureTopic(service, identity.topicId); await api.open(identity)
  const topic = { ...(await api.topics()).items[0]!, running: true }
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  localStorage.clear(); reduced = true
  try {
    await act(async () => root.render(createElement(Sprite, { api, identity, topic, sessions: [], onIdentity() {}, onActivity() {}, onOpenFile() {}, onFocusBlock() {}, onBoard() {}, onSettings() {} })))
    await until(() => subscriptions === 1, '精灵没有订阅原生会话')
    await api.session(identity).sendMessage('分段回复')
    await until(() => !!stream, '模型没有打开可控文字流')
    chunk({ role: 'assistant', reasoning_content: '思考中' })
    await act(async () => { await delay(100) })
    assert.equal(element.querySelector('.sprite-face')!.getAttribute('data-state'), 'running')
    chunk({ content: '第一段正文' })
    await until(() => element.querySelector('.sprite-face')?.getAttribute('data-state') === 'speaking', '收起精灵没收到文字增量')
    await act(async () => element.querySelector<HTMLButtonElement>('.sprite-orb')!.click())
    await until(() => !!element.querySelector('.sprite-head'), '浮窗没有打开')
    assert.equal(subscriptions, 1, '展开不能重复订阅')
    await until(() => element.querySelector('.sprite-face')?.getAttribute('data-state') === 'running', '停字没有回落')
    chunk({ content: '，第二段正文' })
    await until(() => element.querySelector('.sprite-face')?.getAttribute('data-state') === 'speaking', '展开头部没同步说话')
    await act(async () => element.querySelector<HTMLButtonElement>(`button[aria-label="${S.sprite.collapse}"]`)!.click())
    assert.equal(subscriptions, 1)
    chunk({}, 'stop'); stream!.enqueue(encode.encode('data: [DONE]\n\n')); stream!.close(); stream = undefined
    await until(() => element.querySelector('.sprite-face')?.getAttribute('data-state') === 'running', '结束后没有回到主题运行态')
  } finally {
    stream?.close()
    await act(async () => root.unmount()); element.remove(); reduced = false
    server.close(); await service.close(); await rm(dataRoot, { recursive: true, force: true })
  }
})
