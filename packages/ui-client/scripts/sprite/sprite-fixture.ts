/**
 * [INPUT]: 显式临时数据根、真实服务与受控模型线格式
 * [OUTPUT]: 隔离 HTTP/SSE、主窗订阅计数与可逐段推进的模型流；仅用于开发验收
 * [POS]: 只替换 provider 网络，不替换 Controller/Memory/工具；不读正式配置
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { serve } from '@hono/node-server'
import { mkdir } from 'node:fs/promises'
import { createHttpService } from '../../../mastra-service/src/server.ts'
import { acquireServiceLock } from '../../../mastra-service/src/deployment/lock.ts'
import { publishDiscovery, removeDiscovery } from '../../../mastra-service/src/deployment/discovery.ts'
import { fixtureProvider, textReply } from '../../../mastra-service/tests/provider-fixture.ts'

const root = process.argv[2]
if (!root?.startsWith('/tmp/lumen-sprite-')) throw new Error('explicit isolated root required')
await mkdir(root, { recursive: true, mode: 0o700 })
const lock = acquireServiceLock(root)
const fallback = fixtureProvider(() => textReply('验证对话'))
const streams: Record<string, number> = {}
let stream: ReadableStreamDefaultController<Uint8Array> | undefined, subscriptions = 0
const fetch: typeof globalThis.fetch = async (url, init) => {
  const request = JSON.parse(String(init?.body))
  if (!request.stream || !request.tools?.length) return fallback.fetch(url, init)
  return new Response(new ReadableStream({ start(controller) { stream = controller } }), { headers: { 'Content-Type': 'text/event-stream' } })
}
const service = await createHttpService({ dataRoot: root, token: lock.identity, exclusiveStartup: true,
  model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch },
  allowedOrigins: ['tauri://localhost', 'http://tauri.localhost', 'http://localhost:5183'] })
const network = serve({ hostname: '127.0.0.1', port: 0, fetch: async request => {
  const url = new URL(request.url)
  if (url.pathname === '/fixture') {
    if (request.headers.get('authorization') !== `Bearer ${lock.identity}`) return new Response('', { status: 401 })
    if (request.method === 'GET') return Response.json({ subscriptions, streams, streaming: !!stream })
    const step = await request.json() as { content?: string; finish?: boolean; ask?: boolean }
    if (!stream) return new Response('no model stream', { status: 409 })
    const chunk = { id: 'sprite-live', object: 'chat.completion.chunk', created: 1, model: 'test',
      choices: [{ index: 0, delta: step.ask ? { tool_calls: [{ index: 0, id: 'ask-sprite', type: 'function', function: { name: 'ask_user', arguments: JSON.stringify({ question: '下一步继续吗？' }) } }] } : step.content ? { content: step.content } : {}, finish_reason: step.finish ? (step.ask ? 'tool_calls' : 'stop') : null }] }
    stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`))
    if (step.finish) { stream.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); stream.close(); stream = undefined }
    return Response.json({ ok: true })
  }
  if (request.method === 'GET' && url.pathname.endsWith('/stream')) { subscriptions++; streams[url.pathname] = (streams[url.pathname] ?? 0) + 1; process.stdout.write(`subscription ${subscriptions} ${url.pathname}\n`) }
  return service.app.fetch(request)
} })
if (!network.listening) await new Promise<void>(resolve => network.once('listening', resolve))
const address = network.address()
if (!address || typeof address === 'string') throw new Error('no address')
await publishDiscovery(lock, `http://127.0.0.1:${address.port}`)
process.stdout.write(`ready ${address.port}\n`)
async function close() { stream?.close(); network.close(); await service.close(); await removeDiscovery(lock); lock.release(); process.exit(0) }
process.once('SIGTERM', () => { void close() }); process.once('SIGINT', () => { void close() })
