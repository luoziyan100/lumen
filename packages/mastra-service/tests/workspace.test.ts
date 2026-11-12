/**
 * [INPUT]: 产品文件 HTTP、真实 Mastra 工具循环与 contained LocalFilesystem
 * [OUTPUT]: 同主题共享工作区、两层记忆、资料库引用边界（R15）、模型工具格式兼容与本地文件名约束的行为证据
 * [POS]: 证明主题身份决定真实文件根，引用清单决定能读的材料，路径与软链不能越界
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApplication } from '../src/application.ts'
import { createHttpService } from '../src/server.ts'
import { createMemoryTools } from '../src/workspace/memory.ts'
import { fixtureProvider, textReply, toolReply } from './provider-fixture.ts'
import { ensureTopic } from './topic-fixture.ts'

test('同主题对话共用工作区，记忆分主题与用户两层，材料只认本主题引用（R15），路径不越界', { timeout: 90000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-topic-files-'))
  let itemId = '', calls = 0
  const call = (name: string, args: unknown) => toolReply(name, args, `call-${++calls}`)
  const fixture = fixtureProvider(request => {
    for (const tool of request.tools ?? []) {
      if (['read_memory', 'write_memory'].includes(tool.function.name)) assert.doesNotMatch(JSON.stringify(tool.function.parameters), /\\p\{[LN]\}/)
    }
    const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
    const turn = request.messages.slice(lastUser), said = JSON.stringify(turn[0])
    if (turn.some(message => message.role === 'tool')) return textReply('已处理')
    if (said.includes('记住主题')) return call('write_memory', { scope: 'topic', name: 'MEMORY.md', content: '本主题约定：引用必须包含页码 TOPIC-P-41。' })
    if (said.includes('记住我')) return call('write_memory', { scope: 'you', name: 'MEMORY.md', content: '用户偏好：先给结论 YOU-77。' })
    if (said.includes('写笔记')) return call('write_file', { path: 'notes/shared.md', content: '共享笔记 SHARED-NOTE-9' })
    if (said.includes('读笔记')) return call('read_file', { path: 'notes/shared.md' })
    if (said.includes('列材料')) return call('list_materials', {})
    return call('read_material', { itemId })
  })
  const token = 'workspace-token-at-least-24-characters'
  const service = await createHttpService({ dataRoot, token,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const json = async (path: string, method = 'GET', body?: unknown, expected = 200) => {
    const response = await service.app.request(`/lumen${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
    assert.equal(response.status, expected, await response.clone().text())
    return response.json()
  }
  const scope = (topicId: string, taskId: string, kind: string) => `topicId=${topicId}&taskId=${taskId}&scope=${kind}`
  const lastToolResult = () => JSON.stringify(fixture.requests.at(-1)!.messages.filter(message => message.role === 'tool').at(-1))
  const system = () => fixture.requests.at(-1)!.messages.filter(message => message.role === 'system').map(message => String(message.content)).join('\n')
  try {
    for (const topic of ['p', 'q']) {
      ensureTopic(service, topic)
      for (const task of ['a', 'b']) await json(`/topics/${topic}/sessions`, 'POST', { taskId: task }, 201)
    }
    const form = new FormData()
    form.set('file', new File(['主题原件，页码 7，证据 SHARED-23'], 'source.txt', { type: 'text/plain' }))
    form.set('topicId', 'p')
    const upload = await service.app.request('/lumen/library', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    assert.equal(upload.status, 201)
    itemId = (await upload.json()).item.id

    const first = await service.application.session('p', 'a')
    await first.sendMessage({ content: '记住主题约定' })
    await first.sendMessage({ content: '记住我的偏好' })
    await first.sendMessage({ content: '写笔记' })
    assert.match(await readFile(join(dataRoot, 'topics/p/memory/MEMORY.md'), 'utf8'), /TOPIC-P-41/)
    assert.match(await readFile(join(dataRoot, 'memory/MEMORY.md'), 'utf8'), /YOU-77/)
    assert.match(await readFile(join(dataRoot, 'topics/p/work/notes/shared.md'), 'utf8'), /SHARED-NOTE-9/)

    // ---- 同主题另一段对话：同一个工作区、两层记忆索引都在 ----
    const second = await service.application.session('p', 'b')
    await second.sendMessage({ content: '读笔记' })
    assert.match(lastToolResult(), /SHARED-NOTE-9/)
    assert.match(system(), /TOPIC-P-41/)
    assert.match(system(), /YOU-77/)
    assert.equal((await json(`/files?${scope('p', 'b', 'work')}&path=notes/shared.md`)).content, '共享笔记 SHARED-NOTE-9')
    assert.match((await json(`/files?${scope('p', 'b', 'memory')}&path=MEMORY.md`)).content, /TOPIC-P-41/)
    await second.sendMessage({ content: '读材料' })
    assert.match(lastToolResult(), /SHARED-23/)
    assert.equal((await json('/topics/p/materials')).items[0].readProgress, 1)

    // ---- 别的主题：用户记忆跟着走，主题记忆、笔记和材料都不在 ----
    const foreign = await service.application.session('q', 'a')
    await foreign.sendMessage({ content: '读材料' })
    assert.doesNotMatch(lastToolResult(), /SHARED-23/)
    assert.match(lastToolResult(), /不在这个主题的引用清单里/)
    assert.match(system(), /YOU-77/)
    assert.doesNotMatch(system(), /TOPIC-P-41/)
    await foreign.sendMessage({ content: '列材料' })
    assert.match(lastToolResult(), /items\\":\[\]/)
    await foreign.sendMessage({ content: '读笔记' })
    assert.doesNotMatch(lastToolResult(), /SHARED-NOTE-9/)
    await json(`/files?${scope('q', 'a', 'work')}&path=../../p/work/notes/shared.md`, 'GET', undefined, 500)
    await symlink(join(dataRoot, 'topics/p/work/notes/shared.md'), join(dataRoot, 'topics/q/work/escape.md'))
    await json(`/files?${scope('q', 'a', 'work')}&path=escape.md`, 'GET', undefined, 500)
    await json(`/assets?${scope('missing', 'a', 'work')}`, 'GET', undefined, 404)
    await json(`/assets?${scope('q', 'a', 'shared')}`, 'GET', undefined, 400)
    // ---- 取消引用后，原本能读的主题也读不到了；原件仍在资料库 ----
    await service.app.request(`/lumen/topics/p/materials/${itemId}`, { method: 'DELETE', headers })
    await second.sendMessage({ content: '读材料' })
    assert.match(lastToolResult(), /不在这个主题的引用清单里/)
    assert.equal((await json('/library')).items.length, 1)
  } finally { await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

test('模型工具格式兼容不放宽记忆文件的本地验证，中文名称可用而路径仍拒绝', async () => {
  const tools = createMemoryTools(async () => { throw new Error('Schema checks must not access files') })
  for (const tool of Object.values(tools)) {
    for (const name of ['MEMORY.md', '研究约定.md', '🧪.md', '', '../outside.md', 'a/b.md', 'a\\b.md', '/etc/passwd', 'a..md', '.hidden', 'a'.repeat(121)]) {
      const valid = name === 'MEMORY.md' || name === '研究约定.md'
      const result = await tool.inputSchema!['~standard'].validate({ name, scope: 'topic', content: '主题事实' })
      assert.equal(!result.issues, valid, name)
    }
  }
})

test('主题记忆索引不可读时研究仍运行，模型收到如实的读取失败说明', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-memory-index-'))
  const fixture = fixtureProvider(() => textReply('完成'))
  const application = await createApplication({ dataRoot: root,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch },
  })
  try {
    await mkdir(join(root, 'topics/p/memory/MEMORY.md'), { recursive: true })
    const session = await application.session('p', 'task')
    await session.sendMessage({ content: '你好' })
    assert.equal(fixture.requests.length, 1)
    const system = fixture.requests[0]!.messages.filter(message => message.role === 'system').map(message => String(message.content)).join('\n')
    assert.match(system, /MEMORY\.md 暂时无法读取：.*read_memory/)
    assert.match(JSON.stringify(await application.memory.recall({ threadId: 'p:task', resourceId: 'p:task' })), /完成/)
  } finally { await application.close(); await rm(root, { recursive: true, force: true }) }
})
