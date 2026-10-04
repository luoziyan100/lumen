/**
 * [INPUT]: 真实 Mastra/LibSQL/Hono 与官方 SDK，经本机 HTTP/SSE；仅模型网络可控
 * [OUTPUT]: SessionFeed 现存会话恢复、隔离/并发刷新/断线/分页，以及主子用量在真实 SSE 与 Progress 中的证据；运行错误跨终态补取保留，连接恢复独立清错
 * [POS]: 新客户端恢复契约；网络延迟与断开作用于真实响应，不伪造框架事件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { serve } from '@hono/node-server'
import type { MastraDBMessage } from '@mastra/client-js'
import { createHttpService } from '../../mastra-service/src/server.ts'
import { fixtureProvider, textReply, toolReply } from '../../mastra-service/tests/provider-fixture.ts'
import { LumenApi } from '../src/mastra/data/client.ts'
import { SessionFeed, mergeMessages, messageRole, messageText } from '../src/mastra/data/feed.ts'

function gate() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

async function until(check: () => boolean, explanation: string) {
  const deadline = Date.now() + 8000
  while (!check()) {
    if (Date.now() > deadline) throw new Error(explanation)
    await delay(10)
  }
}

function transcript(feed: SessionFeed) {
  return feed.getSnapshot().messages.map(messageText).join('\n')
}

test('消息合并对顺序稳定的流式增量走追加/替换快路径，乱序历史仍按时间排序', () => {
  const message = (id: string, createdAt: number): MastraDBMessage => ({ id, role: 'assistant', threadId: 'p:t', resourceId: 'p:t', createdAt: new Date(createdAt), content: { format: 2, parts: [{ type: 'text', text: id }] } })
  const first = message('a', 1), second = message('b', 2)
  const appended = mergeMessages([first], [second])
  assert.deepEqual(appended.map(item => item.id), ['a', 'b'])
  assert.equal(appended[0], first)
  const updated = message('b', 2), replaced = mergeMessages(appended, [updated])
  assert.equal(replaced[0], first); assert.equal(replaced[1], updated)
  const older = message('older', 0), reordered = mergeMessages(appended, [older])
  assert.deepEqual(reordered.map(item => item.id), ['older', 'a', 'b'])
})

function streamingProvider() {
  const started = gate()
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined
  let closed = false
  const emit = (delta: unknown, finish_reason: string | null = null) => {
    const chunk = { id: 'feed-stream', created: 1, model: 'test', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }], ...(finish_reason ? { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } } : {}) }
    stream!.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`))
  }
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).stream, true)
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      stream = controller
      const abort = () => { if (!closed) { closed = true; controller.error(new DOMException('Cancelled', 'AbortError')) } }
      if (init?.signal?.aborted) abort(); else init?.signal?.addEventListener('abort', abort, { once: true })
      emit({ role: 'assistant', content: '' }); started.resolve()
    } }), { headers: { 'Content-Type': 'text/event-stream' } })
  }
  return { fetch, started: started.promise, push: (text: string) => emit({ content: text }), finish: () => {
    if (closed || !stream) return
    emit({}, 'stop'); stream.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); stream.close(); closed = true
  } }
}

async function environment(modelFetch = fixtureProvider(() => textReply('模型回复')).fetch) {
  const root = await mkdtemp(join(tmpdir(), 'lumen-feed-'))
  const token = 'test-only-session-feed-token-at-least-24'
  const service = await createHttpService({ dataRoot: root, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: modelFetch } })
  let successor: ReturnType<typeof serve> | undefined
  const requests: URL[] = []
  const feeds: SessionFeed[] = []
  const streams = new Set<() => void>()
  const network: { before?: (url: URL) => Promise<void>; after?: (url: URL, response: Response) => Promise<Response> } = {}
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: async request => {
    const url = new URL(request.url); requests.push(url)
    await network.before?.(url)
    const original = await service.app.fetch(request)
    const response = network.after ? await network.after(url, original) : original
    if (!url.pathname.endsWith('/stream') || !response.body) return response
    const reader = response.body.getReader()
    let active = true, drop!: () => void
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        drop = () => { if (!active) return; active = false; controller.close(); streams.delete(drop); void reader.cancel().catch(() => {}) }
        streams.add(drop)
        void (async () => {
          try { while (active) { const result = await reader.read(); if (!active) return; if (result.done) { drop(); return }; controller.enqueue(result.value) } }
          catch (error) { if (active) { active = false; streams.delete(drop); controller.error(error) } }
        })()
      },
      cancel() { active = false; streams.delete(drop); return reader.cancel() },
    })
    return new Response(body, { status: response.status, headers: response.headers })
  } })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const api = new LumenApi({ baseUrl: `http://127.0.0.1:${address.port}`, token })
  await api.request('/lumen/projects', 'POST', { id: 'p', name: 'Feed project' })
  return { api, service, network, requests, dropStreams: () => { for (const drop of [...streams]) drop() },
    async feed(taskId: string) { await api.request('/lumen/projects/p/sessions', 'POST', { taskId }); const feed = new SessionFeed(api, { projectId: 'p', taskId }); feeds.push(feed); return feed },
    async rehost() {
      for (const drop of [...streams]) drop()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      successor = serve({ hostname: '127.0.0.1', port: 0, fetch: service.app.fetch })
      if (!successor.listening) await new Promise<void>(resolve => successor!.once('listening', resolve))
      const address = successor.address(); assert.ok(address && typeof address !== 'string')
      return new LumenApi({ baseUrl: `http://127.0.0.1:${address.port}`, token })
    },
    async close() {
      for (const feed of feeds) feed.close()
      for (const drop of [...streams]) drop()
      if (successor) {
        successor.closeAllConnections()
        await new Promise<void>((resolve, reject) => successor!.close(error => error ? reject(error) : resolve()))
      }
      if (server.listening) {
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      }
      await service.close(); await rm(root, { recursive: true, force: true })
    },
  }
}

test('CT-MASTRA-FEED-001: 切任务后迟到快照不能更新已关闭订阅或污染另一任务', { timeout: 25000 }, async () => {
  const env = await environment(fixtureProvider(request => textReply(JSON.stringify(request.messages).includes('任务B') ? 'B的答案' : 'A的答案')).fetch)
  const captured = gate(), release = gate()
  let startA: Promise<void> | undefined
  try {
    env.network.after = async (url, response) => {
      if (url.pathname !== '/lumen/snapshot' || url.searchParams.get('taskId') !== 'a') return response
      const body = await response.text(); captured.resolve(); await release.promise
      return new Response(body, { status: response.status, headers: response.headers })
    }
    const a = await env.feed('a'), b = await env.feed('b')
    let aUpdates = 0
    a.subscribe(() => { aUpdates++ })
    startA = a.start(); await captured.promise
    a.close(); const closedUpdates = aUpdates, closedView = a.getSnapshot()
    await b.start(); await b.send('任务B')
    await until(() => transcript(b).includes('B的答案') && transcript(b).includes('任务B'), 'B 未补全真实消息').catch(async error => {
      throw new Error(JSON.stringify({ displayed: b.getSnapshot(), persisted: await b.session.listMessages('p:b') }), { cause: error })
    })
    release.resolve(); await startA
    assert.equal(aUpdates, closedUpdates)
    assert.equal(a.getSnapshot(), closedView)
    assert.doesNotMatch(transcript(b), /A的答案/)
    assert.equal(b.identity.taskId, 'b')
    assert.equal(b.getSnapshot().messages.filter(message => messageRole(message) === 'user').length, 1)
    await b.refresh()
    assert.ok(b.getSnapshot().messages.some(message => messageRole(message) === 'user' && messageText(message) === '任务B'))
  } finally { release.resolve(); await startA; await env.close() }
})

test('CT-MASTRA-FEED-002: 旧快照等待期间产生的真实 SSE 文本与运行状态不丢失', { timeout: 25000 }, async () => {
  const provider = streamingProvider(), env = await environment(provider.fetch)
  const captured = gate(), release = gate()
  let refreshing: Promise<void> | undefined
  try {
    const feed = await env.feed('refresh'); await feed.start()
    let once = true
    env.network.after = async (url, response) => {
      if (url.pathname !== '/lumen/snapshot' || !once) return response
      once = false; const body = await response.text(); captured.resolve(); await release.promise
      return new Response(body, { status: response.status, headers: response.headers })
    }
    refreshing = feed.refresh(); await captured.promise
    await env.api.session(feed.identity).sendMessage('刷新期间继续研究')
    await provider.started; provider.push('快照之后到达的正文')
    const session = await env.service.application.session('p', 'refresh')
    await until(() => JSON.stringify(session.displayState.get().currentMessage).includes('快照之后到达的正文'), '服务未处理流文本')
    await delay(30)
    release.resolve(); await refreshing
    await until(() => transcript(feed).includes('快照之后到达的正文'), '刷新吞掉了 SSE 文本')
    assert.equal(feed.getSnapshot().display?.isRunning, true)
    provider.finish()
    await until(() => !feed.getSnapshot().display?.isRunning && transcript(feed).includes('刷新期间继续研究'), '终态没有补取用户消息')
  } finally { release.resolve(); provider.finish(); await refreshing; await env.close() }
})

test('CT-MASTRA-FEED-003: 官方 SSE 重连通过 currentMessage 找回断线期间正文并保持输出', { timeout: 25000 }, async () => {
  const provider = streamingProvider(), env = await environment(provider.fetch)
  const reconnect = gate(), permitReconnect = gate()
  let seenStreams = 0
  try {
    env.network.before = async url => {
      if (!url.pathname.endsWith('/stream')) return
      if (++seenStreams > 1) { reconnect.resolve(); await permitReconnect.promise }
    }
    const feed = await env.feed('reconnect'); await feed.start()
    await env.api.session(feed.identity).sendMessage('持续生成')
    await provider.started; provider.push('连接前缀。')
    await until(() => transcript(feed).includes('连接前缀。'), '没有收到初始 SSE')
    env.dropStreams()
    provider.push('断线期间正文。')
    const session = await env.service.application.session('p', 'reconnect')
    await until(() => JSON.stringify(session.displayState.get().currentMessage).includes('断线期间正文。'), '模型流没有跨断线继续运行')
    await reconnect.promise
    assert.doesNotMatch(transcript(feed), /断线期间正文/)
    permitReconnect.resolve()
    await until(() => transcript(feed).includes('断线期间正文。'), '重连遗漏 snapshot.currentMessage')
    assert.equal(feed.getSnapshot().display?.isRunning, true)
    provider.push('重连后正文。'); provider.finish()
    await until(() => transcript(feed).includes('重连后正文。') && transcript(feed).includes('持续生成') && !feed.getSnapshot().display?.isRunning, '重连后会话未正常完成')
    const assistant = feed.getSnapshot().messages.filter(message => message.role === 'assistant')
    assert.equal(assistant.length, 1)
  } finally { permitReconnect.resolve(); provider.finish(); await env.close() }
})

test('CT-MASTRA-FEED-004: 原生 display_state_changed 即使缺少 message 事件也能更新正文', { timeout: 25000 }, async () => {
  const provider = streamingProvider(), env = await environment(provider.fetch)
  try {
    env.network.after = async (url, response) => {
      if (!url.pathname.endsWith('/stream') || !response.body) return response
      let buffer = ''
      const decoder = new TextDecoder(), encoder = new TextEncoder()
      const filter = new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })
        let end: number
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2)
          const data = frame.split('\n').find(line => line.startsWith('data:'))?.slice(5)
          if (!data || !String(JSON.parse(data).type).startsWith('message_')) controller.enqueue(encoder.encode(`${frame}\n\n`))
        }
      } })
      return new Response(response.body.pipeThrough(filter), { status: response.status, headers: response.headers })
    }
    const feed = await env.feed('display'); await feed.start()
    await env.api.session(feed.identity).sendMessage('原生显示状态')
    await provider.started; provider.push('模型仍在输出的回复')
    await until(() => transcript(feed).includes('模型仍在输出的回复'), 'displayState 没有合入正文')
    assert.ok(feed.getSnapshot().display?.currentMessage)
    assert.equal(feed.getSnapshot().display?.isRunning, true)
  } finally { provider.finish(); await env.close() }
})

test('CT-MASTRA-FEED-005: 按页读完超过一千条持久消息，不静默截断历史', { timeout: 25000 }, async () => {
  const env = await environment()
  try {
    const identity = { projectId: 'p', taskId: 'history' }
    await env.api.open(identity)
    const messages: MastraDBMessage[] = Array.from({ length: 1005 }, (_, i) => ({
      id: `history-${String(i).padStart(4, '0')}`, role: i % 2 ? 'assistant' : 'user', threadId: 'p:history', resourceId: 'p:history',
      createdAt: new Date(Date.UTC(2026, 0, 1) + i), content: { format: 2, parts: [{ type: 'text', text: `历史消息 ${i}` }] },
    }))
    await env.service.application.memory.saveMessages({ messages })
    const feed = await env.feed('history'); await feed.start()
    assert.equal(feed.getSnapshot().messages.length, 1005)
    assert.equal(feed.getSnapshot().messages[0]?.id, 'history-0000')
    assert.equal(feed.getSnapshot().messages.at(-1)?.id, 'history-1004')
    const pages = env.requests.filter(url => url.pathname.endsWith('/threads/p%3Ahistory/messages')).map(url => url.searchParams.get('page'))
    assert.deepEqual(pages, ['0', '1', '2', '3', '4', '5'])
  } finally { await env.close() }
})

test('CT-MASTRA-FEED-006: 较旧刷新失败不得覆盖较新恢复成功的连接状态', { timeout: 25000 }, async () => {
  const env = await environment(), captured = gate(), release = gate()
  let older: Promise<void> | undefined
  try {
    const feed = await env.feed('revisions'); await feed.start()
    let once = true
    env.network.after = async (url, response) => {
      if (url.pathname !== '/lumen/snapshot' || !once) return response
      once = false; await response.text(); captured.resolve(); await release.promise
      return Response.json({ error: 'delayed old failure' }, { status: 500 })
    }
    older = feed.refresh(); await captured.promise
    await feed.refresh()
    release.resolve(); await older
    assert.equal(feed.getSnapshot().connected, true)
    assert.equal(feed.getSnapshot().error, null)
  } finally { release.resolve(); await older; await env.close() }
})


test('CT-MASTRA-FEED-007: 切换数据根后过期本地选择不能创建空线程', { timeout: 25000 }, async () => {
  const env = await environment()
  const feed = new SessionFeed(env.api, { projectId: 'p', taskId: 'previous-data-root' })
  try {
    const before = await env.api.sessions('p')
    await feed.start()
    assert.equal(feed.getSnapshot().connected, false)
    assert.ok(feed.getSnapshot().connectionError)
    assert.deepEqual(await env.api.sessions('p'), before)
    assert.equal(env.requests.some(url => url.pathname === '/lumen/sessions'), false)
  } finally { feed.close(); await env.close() }
})

test('CT-MASTRA-FEED-008: 真实委派的主子用量分别展示，原生 SSE 不抹掉派生专家用量', { timeout: 25000 }, async () => {
  register('./helpers/tsx-loader.mjs', import.meta.url)
  const { Progress, ToolActivity } = await import('../src/mastra/views/conversation/Progress.tsx')
  const next = gate(); let mainRequests = 0
  const env = await environment(fixtureProvider(async request => {
    if (!request.tools?.some(tool => tool.function.name === 'agent-reader')) return textReply('专家证据')
    mainRequests++
    if (mainRequests === 1) return toolReply('agent-reader', { prompt: '读取证据' }, 'usage-reader')
    if (mainRequests > 2) await next.promise
    return textReply('主 Agent 汇总')
  }).fetch)
  try {
    const feed = await env.feed('usage'); await feed.start()
    await (await env.service.application.session('p', 'usage')).permissions.setForTool({ toolName: 'agent-reader', policy: 'allow' })
    await feed.send('委派专家读取')
    await until(() => feed.getSnapshot().display?.childTokenUsage?.totalTokens === 16, '派生子用量未恢复到快照')
    const display = feed.getSnapshot().display!
    assert.equal(display.tokenUsage.totalTokens, 32)
    assert.ok(Object.values(display.activeTools).some(tool => tool.status === 'completed'), '原生完成工具仍应保留在快照')
    assert.equal(renderToStaticMarkup(createElement(ToolActivity, { display })), '')
    const activity = renderToStaticMarkup(createElement(ToolActivity, { display: { ...display, activeTools: {
      ...display.activeTools, running: { name: 'extract_pdf', args: {}, status: 'running' },
      streaming: { name: 'grep', args: {}, status: 'streaming_input' }, failed: { name: 'failed_tool', args: {}, status: 'error' },
    } } }))
    assert.match(activity, /extract_pdf/); assert.match(activity, /grep/)
    assert.doesNotMatch(activity, /agent-reader|failed_tool/)
    const children = await env.api.children(feed.identity)
    feed.setChildUsage(children.childTokenUsage!)
    feed.setChildUsage(null)
    assert.equal(feed.getSnapshot().display?.childTokenUsage?.totalTokens, 16)
    const markup = renderToStaticMarkup(createElement(Progress, { display }))
    assert.match(markup, /主 Agent 32 tokens/); assert.match(markup, /子 Agent 16 tokens/); assert.match(markup, /已记录合计 48 tokens/)
    await feed.session.sendMessage('继续核对')
    await until(() => mainRequests > 2 && feed.getSnapshot().display?.isRunning === true, '原生新运行未开始')
    assert.equal(feed.getSnapshot().display?.childTokenUsage?.totalTokens, 16)
    const empty = renderToStaticMarkup(createElement(Progress, { display: { ...display, tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, childTokenUsage: null } }))
    assert.doesNotMatch(empty, /tokens|已记录合计/)
  } finally { next.resolve(); await env.close() }
})


test('CT-MASTRA-FEED-009: 实际换端口后旧 SSE 重试有界，重新发现恢复原会话且旧回调失效', { timeout: 25000 }, async () => {
  const env = await environment()
  const identity = { projectId: 'p', taskId: 'rehost' }
  await env.api.open(identity)
  let discovered: LumenApi | undefined, restored: SessionFeed | undefined, recoveries = 0
  const original = new SessionFeed(env.api, identity, () => {
    recoveries++
    assert.ok(discovered)
    original.close()
    restored = new SessionFeed(discovered, identity)
    void restored.start()
  })
  try {
    await original.start(); await original.send('端口更换前的研究')
    await until(() => transcript(original).includes('模型回复') && !original.getSnapshot().display?.isRunning, '原会话未完成')
    discovered = await env.rehost()
    assert.notEqual(discovered.connection.baseUrl, env.api.connection.baseUrl)
    await until(() => restored?.getSnapshot().connected === true, '旧端点无限重试，没有重新发现')
    assert.equal(recoveries, 1)
    assert.match(transcript(restored!), /端口更换前的研究/)
    original.fail(new Error('已关闭连接的迟到错误'))
    await delay(1100)
    assert.equal(recoveries, 1)
    assert.equal(restored!.getSnapshot().connected, true)
  } finally { original.close(); restored?.close(); await env.close() }
})

test('CT-MASTRA-FEED-010: 模型错误跨终态补取和连接恢复保留，下一轮原生开始后清除', { timeout: 25000 }, async () => {
  const provider = streamingProvider()
  let rejected = true, sawError = false
  const env = await environment(async (url, init) => rejected
    ? Response.json({ error: { message: '模型拒绝了工具参数', type: 'invalid_request_error' } }, { status: 400 })
    : provider.fetch(url, init))
  try {
    const feed = await env.feed('model-error'); await feed.start()
    feed.subscribe(() => { if (feed.getSnapshot().error?.includes('模型拒绝了工具参数')) sawError = true })
    await feed.send('第一次请求')
    await until(() => sawError && !feed.getSnapshot().display?.isRunning, '未收到真实模型失败与结束事件')
    await feed.refresh()
    assert.match(feed.getSnapshot().error ?? '', /模型拒绝了工具参数/)
    assert.equal(feed.getSnapshot().connected, true)

    env.network.after = async (url, response) => url.pathname === '/lumen/snapshot'
      ? Response.json({ error: '快照暂不可读取' }, { status: 503 }) : response
    await assert.rejects(feed.refresh(), /快照暂不可读取/)
    assert.match(feed.getSnapshot().connectionError ?? '', /快照暂不可读取/)
    assert.match(feed.getSnapshot().error ?? '', /模型拒绝了工具参数/)
    env.network.after = undefined
    await feed.refresh()
    assert.equal(feed.getSnapshot().connectionError, null)
    assert.match(feed.getSnapshot().error ?? '', /模型拒绝了工具参数/)

    rejected = false
    await feed.send('在同一会话重新请求'); await provider.started
    await until(() => feed.getSnapshot().display?.isRunning === true, '下一轮没有开始')
    assert.equal(feed.getSnapshot().error, null)
    provider.push('这次正常回复'); provider.finish()
    await until(() => transcript(feed).includes('这次正常回复') && !feed.getSnapshot().display?.isRunning, '下一轮没有正常结束')
  } finally { provider.finish(); await env.close() }
})
