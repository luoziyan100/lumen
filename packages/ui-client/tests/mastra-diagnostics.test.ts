/**
 * [INPUT]: 真实 Cases/React DOM、本机 HTTP、Mastra/LibSQL 和确定性模型网络
 * [OUTPUT]: 诊断浏览、持久评估、同 tick 互斥、切会话隔离、失败留稿和离线查看证据
 * [POS]: 桌面诊断的组件及接口纵向回归；只控制网络响应时序，不替换服务或伪造 trace
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { register } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
import { createElement, StrictMode, act } from 'react'
import { JSDOM } from 'jsdom'
import { serve } from '@hono/node-server'
import { createHttpService } from '../../mastra-service/src/server.ts'
import { fixtureProvider, textReply } from '../../mastra-service/tests/provider-fixture.ts'
import { LumenApi, type Identity } from '../src/mastra/data/client.ts'
import { readDiagnosticFile } from '../src/mastra/diagnostics/files.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Text', 'DocumentFragment', 'MutationObserver']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Object.assign(globalThis, { requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), getComputedStyle: dom.window.getComputedStyle.bind(dom.window) })
register('./helpers/tsx-loader.mjs', import.meta.url)
const { createRoot } = await import('react-dom/client')
const { Cases } = await import('../src/mastra/diagnostics/Cases.tsx')

test('诊断界面使用的真实 HTTP 完成查看、标注、编辑、导出和只读回看；热关闭不影响研究', { timeout: 60000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-diag-http-')), token = 'diagnostic-http-token-at-least-24-characters'
  const credential = 'diagnostic-http-provider-secret-691384', fixture = fixtureProvider(() => textReply('DIAG_HTTP_RESULT'))
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: credential, model: 'test', fetch: fixture.fetch } })
  const server = serve({ fetch: service.app.fetch, hostname: '127.0.0.1', port: 0 })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${address.port}`, api = new LumenApi({ baseUrl, token }), a = { projectId: 'p', taskId: 'a' }, b = { projectId: 'p', taskId: 'b' }
  try {
    await api.request('/lumen/projects', 'POST', { id: 'p', name: 'Diagnostics' }); await api.open(a); await api.open(b)
    assert.equal((await fetch(`${baseUrl}/lumen/diagnostics/traces?projectId=p&taskId=a`)).status, 401)
    await (await service.application.session('p', 'a')).sendMessage({ content: '生成诊断记录' }); await service.application.diagnostics.flush()
    const list = await api.traces(a); assert.ok(list.total > 0); assert.equal(list.collectionEnabled, true)
    const trace = await api.trace(a, list.items[0]!.traceId); assert.match(JSON.stringify(trace), /DIAG_HTTP_RESULT/)
    await assert.rejects(api.trace(b, trace.traceId), /Trace 不存在/)
    await assert.rejects(api.traces({ projectId: '../p', taskId: 'a' }), /会话身份无效/)
    const mark = await api.markBadCase(a, { traceId: trace.traceId, kind: 'answer_quality', actual: `Bearer ${credential}`, expected: '完整说明', note: '待调查' })
    const changed = await api.updateBadCase(a, mark.id, { note: '补充说明' })
    assert.equal(changed.expected, '完整说明'); assert.equal(changed.note, '补充说明'); assert.doesNotMatch(changed.actual, new RegExp(credential))
    await assert.rejects(api.updateBadCase(b, mark.id, { note: '跨会话' }), /问题标注不存在/)
    assert.equal((await api.badCases(a)).items[0]!.id, mark.id)
    const exported = await api.exportDiagnostics(a), requests = fixture.requests.length
    for (const value of [credential, token]) assert.ok(!exported.content.includes(value))
    const inspected = await api.readRecorded(await readDiagnosticFile(new File([exported.content], 'record.json')))
    assert.equal(inspected.executionPerformed, false); assert.equal(inspected.sourceAuthenticated, false); assert.equal(inspected.checksumVerified, true)
    assert.equal(fixture.requests.length, requests, '回看不得产生模型执行')
    const changedPack = JSON.parse(exported.content); changedPack.payload.resourceId = 'wrong:resource'
    await assert.rejects(api.readRecorded(JSON.stringify(changedPack)), /完整性/)
    await assert.rejects(readDiagnosticFile(new File(['x'.repeat(8 * 1024 * 1024 + 1)], 'large.json')), /8 MiB/)
    await assert.rejects(api.readRecorded('x'.repeat(8 * 1024 * 1024 + 1)), /8 MiB/)
    assert.equal((await api.updateSettings({ collectExecEvidence: false })).collectExecEvidence, false)
    await (await service.application.session('p', 'b')).sendMessage({ content: '关闭采集仍可研究' }); await service.application.diagnostics.flush()
    const off = await api.traces(b); assert.equal(off.total, 0); assert.equal(off.collectionEnabled, false)
    assert.ok(fixture.requests.length > requests)
    assert.ok((await api.traces(a)).total > 0, '关闭采集不删除历史记录')
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await service.close(); await rm(dataRoot, { recursive: true, force: true })
  }
})

function gate() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

async function until(check: () => boolean, message: string) {
  const limit = Date.now() + 8000
  while (!check()) {
    if (Date.now() > limit) throw new Error(message)
    await act(async () => { await delay(10) })
  }
}

async function caseEnvironment(prefix: string) {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-diag-ui-')), token = 'diagnostic-ui-token-at-least-24-characters'
  const fixture = fixtureProvider(() => textReply('DIAG_UI_RESULT'))
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const network: { before?: (request: Request) => Promise<Response | void> } = {}, requests: Array<{ url: URL; method: string }> = []
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: async request => {
    requests.push({ url: new URL(request.url), method: request.method })
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
  return { api, a, b, service, fixture, network, requests, element,
    async select(identity: Identity, revision = 0) {
      await act(async () => { root.render(createElement(StrictMode, {}, createElement(Cases, { api, identity, revision }))) })
    },
    async choose(actual: string) {
      await until(() => [...element.querySelectorAll('aside button')].some(button => button.textContent?.includes(actual)), '标注列表未载入')
      const button = [...element.querySelectorAll<HTMLButtonElement>('aside button')].find(button => button.textContent?.includes(actual))!
      await act(async () => { button.click() })
    },
    button(label: string) {
      const button = [...element.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === label)
      assert.ok(button, `缺少按钮 ${label}`); return button
    },
    async click(label: string, times = 1) {
      const button = this.button(label)
      await act(async () => { for (let i = 0; i < times; i++) button.click() })
    },
    async text(label: string, value: string) {
      const input = element.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`)!
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
      assert.equal(input.value, value)
    },
    async save(times = 1) {
      await act(async () => { for (let i = 0; i < times; i++) element.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })) })
    },
    async cases(identity: Identity) {
      let value!: Awaited<ReturnType<LumenApi['badCases']>>
      await act(async () => { value = await api.badCases(identity) }); return value
    },
    async close() {
      await act(async () => root.unmount()); element.remove()
      server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      await service.close(); await rm(dataRoot, { recursive: true, force: true })
    },
  }
}

test('诊断标注同 tick 仅评估一次，缺证据显示无法运行；结果刷新后仍保留', { timeout: 30000 }, async () => {
  const env = await caseEnvironment('diag-unavailable'), started = gate(), release = gate()
  try {
    const marked = await env.api.markBadCase(env.a, { kind: 'evidence_missing', actual: '没有记录的观察', expected: '应有完整来源', note: '不能丢的标注' })
    env.network.before = async request => { if (new URL(request.url).pathname.endsWith('/evaluate')) { started.resolve(); await release.promise } }
    await env.select(env.a); await env.choose(marked.actual); await env.click('录制回放', 2); await started.promise
    assert.equal(env.requests.filter(item => item.url.pathname.endsWith('/evaluate')).length, 1)
    release.resolve()
    await until(() => env.element.textContent!.includes('无法运行：证据不可用'), '缺证据没有展示为无法运行')
    assert.match(env.element.textContent!, /未作判断/); assert.doesNotMatch(env.element.textContent!, /运行已完成/)
    assert.equal(env.fixture.requests.length, 0, '录制回放缺证据不可调用真实模型')
    const saved = (await env.cases(env.a)).items[0]!
    assert.equal(saved.note, marked.note); assert.equal(saved.lastEvaluation?.execution, 'unavailable')
    await env.select(env.b); await env.select(env.a); await env.choose(marked.actual)
    assert.match(env.element.textContent!, /无法运行：证据不可用/)
    await act(async () => { await assert.rejects(env.api.evaluateBadCase(env.b, marked.id, 'recorded'), /问题标注不存在/) })
  } finally { release.resolve(); await env.close() }
})

test('诊断评估不读取未保存标注，失败留稿；重试由当前模型运行并持久显示文本判断', { timeout: 60000 }, async () => {
  const env = await caseEnvironment('diag-live')
  try {
    await (await env.service.application.session(env.a.projectId, env.a.taskId)).sendMessage({ content: '生成供验证的答复' })
    await env.service.application.diagnostics.flush()
    const traceId = (await env.api.traces(env.a)).items[0]!.traceId
    const marked = await env.api.markBadCase(env.a, { traceId, actual: 'DIAG_UI_RESULT', expected: 'DIAG_UI_RESULT', note: '原标注' })
    await env.select(env.a); await env.choose(marked.actual)
    assert.match(env.element.textContent!, /当前模型发送一次无工具请求，可能产生费用/)
    const recordedCount = env.fixture.requests.length
    await env.click('录制回放'); await until(() => !!env.element.querySelector('.md-evaluation-result'), '录制回放未返回')
    assert.match(env.element.textContent!, /运行已完成/); assert.match(env.element.textContent!, /预期文本匹配/)
    assert.equal(env.fixture.requests.length, recordedCount, '录制回放不得请求外部模型')
    await env.text('补充说明', '用户的新补充')
    assert.equal(env.button('重新评估').disabled, true); assert.equal(env.button('录制回放').disabled, true)
    await env.save(2); await until(() => env.element.textContent!.includes('已保存'), '保存未完成')
    assert.equal(env.element.querySelector('.md-evaluation-result'), null, '修改标注后不能继续展示旧判断')
    assert.equal(env.requests.filter(item => item.method === 'PATCH' && item.url.pathname.endsWith(marked.id)).length, 1)
    env.network.before = async request => new URL(request.url).pathname.endsWith('/evaluate') ? Response.json({ error: '临时网络失败' }, { status: 503 }) : undefined
    await env.click('重新评估'); await until(() => env.element.textContent!.includes('临时网络失败'), '未显示运行失败')
    assert.equal(env.element.querySelector<HTMLTextAreaElement>('textarea[aria-label="补充说明"]')!.value, '用户的新补充')
    assert.equal((await env.cases(env.a)).items[0]!.note, '用户的新补充')
    env.network.before = undefined
    const count = env.fixture.requests.length
    await env.click('重新评估'); await until(() => !!env.element.querySelector('.md-evaluation-result'), '真实模型评估未返回')
    assert.match(env.element.textContent!, /运行已完成/)
    assert.match(env.element.textContent!, /预期文本匹配/)
    assert.equal(env.fixture.requests.length, count + 1, '当前模型评估只发出一次请求')
    assert.ok(!env.fixture.requests.at(-1)!.tools?.length, '评估不能授予工具')
    const saved = (await env.cases(env.a)).items[0]!
    assert.equal(saved.lastEvaluation?.mode, 'live'); assert.equal(saved.lastEvaluation?.judgment, 'matched')
    await env.select(env.b); await env.select(env.a); await env.choose(marked.actual)
    assert.match(env.element.textContent!, /运行已完成/); assert.match(env.element.textContent!, /预期文本匹配/)
  } finally { await env.close() }
})

test('诊断评估期间切换同名任务的项目，迟到结果不覆盖新标注或草稿', { timeout: 30000 }, async () => {
  const env = await caseEnvironment('diag-isolation'), started = gate(), release = gate()
  try {
    const first = await env.api.markBadCase(env.a, { actual: 'A 的观察', expected: 'A 的预期' })
    const second = await env.api.markBadCase(env.b, { actual: 'B 的观察', expected: 'B 的预期', note: 'B 原稿' })
    env.network.before = async request => { if (new URL(request.url).pathname.endsWith('/evaluate')) { started.resolve(); await release.promise } }
    await env.select(env.a); await env.choose(first.actual); await env.click('录制回放'); await started.promise
    await env.select(env.b); await env.choose(second.actual); await env.text('补充说明', 'B 不可覆盖的草稿')
    release.resolve()
    await until(() => env.requests.filter(item => item.url.pathname.endsWith('/evaluate')).length === 1, '缺少评估请求')
    let completed = false
    for (let attempt = 0; attempt < 100 && !completed; attempt++) {
      await act(async () => { await delay(10); completed = !!(await env.api.badCases(env.a)).items[0]!.lastEvaluation })
    }
    assert.ok(completed, '原会话评估未保存')
    assert.equal(env.element.querySelector<HTMLTextAreaElement>('textarea[aria-label="实际表现"]')!.value, 'B 的观察')
    assert.equal(env.element.querySelector<HTMLTextAreaElement>('textarea[aria-label="补充说明"]')!.value, 'B 不可覆盖的草稿')
    assert.doesNotMatch(env.element.textContent!, /上次结果|无法运行：证据不可用/)
    assert.equal((await env.cases(env.b)).items[0]!.lastEvaluation, undefined)
  } finally { release.resolve(); await env.close() }
})
