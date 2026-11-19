/**
 * [INPUT]: the real StudioApp and sprite Composer, React DOM, a real HTTP service with the Mastra Controller, a deterministic model; the test holds the conversation's reconnect request
 * [OUTPUT]: regression evidence that a send typed while the sprite's conversation reconnects after the first message is shown as waiting, then sent once connected (never dropped)
 * [POS]: Composer mechanism acceptance next to sediment.test.ts; the controllable model proves mechanism only; no WebKit coverage claimed
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
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
import { fixtureProvider, textReply, type ProviderRequest } from '../../mastra-service/tests/provider-fixture.ts'
import { ensureTopic } from '../../mastra-service/tests/topic-fixture.ts'
import { LumenApi } from '../src/mastra/data/client.ts'
import { zh } from './helpers/zh.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element', 'Node', 'NodeFilter', 'Text', 'DocumentFragment', 'MutationObserver', 'localStorage', 'getComputedStyle', 'navigator']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } })
Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollTo', { configurable: true, value(this: HTMLElement, options: ScrollToOptions) { this.scrollTop = Number(options?.top ?? 0) } })
after(() => dom.window.close())
register('./helpers/tsx-loader.mjs', import.meta.url)
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(specifier, context, next) { if (specifier.endsWith('?url')) return { url: 'data:text/javascript,export default "test-worker-url"', shortCircuit: true }; return next(specifier, context) } export async function load(url, context, next) { const result = await next(url, context); if (url.endsWith('/WidgetFrame.tsx')) return { ...result, source: String(result.source).replaceAll('import.meta.env.BASE_URL', JSON.stringify('/')) }; return result }`), import.meta.url)
const { createRoot } = await import('react-dom/client')
const { StudioApp } = await import('../src/mastra/studio/StudioApp.tsx')

const token = 'ui-sprite-send-token-at-least-24-characters'
const lastUserText = (request: ProviderRequest) => JSON.stringify(request.messages[request.messages.map(message => message.role).lastIndexOf('user')])
async function until(check: () => boolean | Promise<boolean>, message: string, ms = 20000) {
  const limit = Date.now() + ms
  while (!await check()) {
    if (Date.now() > limit) throw new Error(message)
    await delay(20)
  }
}

test('精灵对话重连期间的发送：显示「连上后发送」，连上即发，不丢', { timeout: 60000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-ui-sprite-send-'))
  const fixture = fixtureProvider(() => textReply('好'))
  const asked = (words: string) => fixture.requests.some(request => lastUserText(request).includes(words))
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  // ---- The conversation feed's first request on (re)connect is GET …/sessions/:taskId; hold it to keep the sprite in 「连接中」 ----
  let release: () => void = () => {}
  const held = new Promise<void>(resolve => { release = resolve })
  let holding = false
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: async request => {
    if (holding && request.method === 'GET' && /\/lumen\/topics\/[^/]+\/sessions\/[^/]+$/.test(new URL(request.url).pathname)) await held
    return service.app.fetch(request)
  } })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const connection = { baseUrl: `http://127.0.0.1:${address.port}`, token }
  const api = new LumenApi(connection)
  ensureTopic(service, 'attn', '注意力为什么能对齐')
  localStorage.clear()
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const $ = <T extends Element = HTMLElement>(selector: string) => element.querySelector<T & HTMLElement>(selector)
  const say = async (message: string) => {
    const input = $<HTMLTextAreaElement>('.sprite textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(input, message)
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    await act(async () => $('.sprite form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
  }
  try {
    await act(async () => root.render(createElement(StudioApp, { connection })))
    await until(() => !![...element.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === zh.studio.sprite.open), '精灵入口没有出现')
    await act(async () => [...element.querySelectorAll<HTMLButtonElement>('button')].find(item => item.getAttribute('aria-label') === zh.studio.sprite.open)!.click())
    await until(() => !!$('.sprite textarea'), '精灵没有展开')
    holding = true
    await say('第一句')
    // ---- The first turn is over on the service, while the sprite's conversation is still reconnecting ----
    await until(() => asked('第一句'), '第一句没有到模型')
    await until(async () => (await api.sessions('attn')).items.every(item => !item.running && !item.waiting), '第一轮服务端还在运行')
    await until(() => !$('.sprite-welcome') && !!$('.sprite .mw-connection'), '精灵应停在「连接中」')
    await say('第二句')
    await until(() => $('.sprite .composer-foot [role=status]')?.textContent === zh.chat.sendOnConnect, '连接中的发送要显示「连上后发送」')
    assert.equal(asked('第二句'), false, '连上之前不发')
    assert.equal($<HTMLTextAreaElement>('.sprite textarea')!.value, '第二句', '字还在输入框里')
    // ---- Connected: the waiting send goes out by itself ----
    holding = false; release()
    await until(() => asked('第二句'), '连上后第二句没有发出')
    await until(() => $<HTMLTextAreaElement>('.sprite textarea')!.value === '', '发出后输入框清空')
    await until(() => !$('.sprite .composer-foot [role=status]'), '发出后不再显示等待')
  } finally {
    release()
    await act(async () => root.unmount())
    element.remove()
    await service.close(); server.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})
