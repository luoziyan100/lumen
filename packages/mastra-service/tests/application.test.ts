/**
 * [INPUT]: 新应用组合根、真实 LibSQL/Workspace 和 provider HTTP 夹具
 * [OUTPUT]: P0 会话隔离、工具回灌、持久化与路径边界的可执行证据
 * [POS]: 验证框架机制能承载产品，不替换内核或存储
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, symlink, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalFilesystem } from '@mastra/core/workspace'
import { createApplication } from '../src/application.ts'
import { fixtureProvider, textReply, toolReply } from './provider-fixture.ts'

const model = (fetch: typeof globalThis.fetch) => ({ baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'research-test', fetch })

test('Controller 写真实文件，下一轮看到工具结果；重开 Memory 不丢消息', { timeout: 25000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-mastra-'))
  const fixture = fixtureProvider(request => request.messages.some(m => m.role === 'tool')
    ? textReply('笔记已写入 notes/result.md')
    : toolReply('write_file', { path: 'notes/result.md', content: '# 论文笔记\n来源：测试材料' }))
  let app = await createApplication({ dataRoot: root, model: model(fixture.fetch) })
  try {
    const session = await app.session('project', 'task')
    session.subscribe(event => {
      if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    })
    await session.sendMessage({ content: '把材料整理为笔记' })
    assert.match(await readFile(join(root, 'projects/project/tasks/task/notes/result.md'), 'utf8'), /论文笔记/)
    assert.ok(fixture.requests.some(r => r.messages.some(m => m.role === 'tool')))
    const before = await session.thread.listMessages({ threadId: 'project:task' })
    assert.ok(before.length >= 2)
    await app.close()
    app = await createApplication({ dataRoot: root, model: model(fixture.fetch) })
    const restored = await app.session('project', 'task')
    const after = await restored.thread.listMessages({ threadId: 'project:task' })
    assert.deepEqual(after.map(m => m.id), before.map(m => m.id))
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('两个 Session 的历史与事件隔离', { timeout: 25000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-mastra-'))
  const fixture = fixtureProvider(() => textReply('收到'))
  const app = await createApplication({ dataRoot: root, model: model(fixture.fetch) })
  try {
    const a = await app.session('project', 'alpha'), b = await app.session('project', 'beta')
    assert.notEqual(a, b)
    assert.equal(await app.session('project', 'alpha'), a)
    await Promise.all([a.sendMessage({ content: 'ALPHA_PRIVATE' }), b.sendMessage({ content: 'BETA_PRIVATE' })])
    const alpha = JSON.stringify(await a.thread.listMessages({ threadId: 'project:alpha' }))
    const beta = JSON.stringify(await b.thread.listMessages({ threadId: 'project:beta' }))
    assert.match(alpha, /ALPHA_PRIVATE/); assert.doesNotMatch(alpha, /BETA_PRIVATE/)
    assert.match(beta, /BETA_PRIVATE/); assert.doesNotMatch(beta, /ALPHA_PRIVATE/)
    await assert.rejects(app.session('../escape', 'task'), /Invalid/)
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('框架文件系统拒绝目录和软链逃逸', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-mastra-'))
  const fs = new LocalFilesystem({ basePath: join(root, 'workspace'), contained: true })
  try {
    await fs.init()
    await writeFile(join(root, 'secret'), 'private')
    await symlink(join(root, 'secret'), join(root, 'workspace/link'))
    await assert.rejects(fs.readFile('../secret'))
    await assert.rejects(fs.readFile('link'))
    await fs.writeFile('notes/result.md', 'allowed')
    assert.equal(await fs.readFile('notes/result.md', { encoding: 'utf8' }), 'allowed')
  } finally { await fs.destroy(); await rm(root, { recursive: true, force: true }) }
})

test('受限子 Agent 独立执行并将结果返回父 Agent', { timeout: 25000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-mastra-'))
  let childSeen = false
  const fixture = fixtureProvider(request => {
    if (request.messages.some(m => m.role === 'system' && String(m.content).includes('只读材料'))) {
      childSeen = true
      assert.ok(request.tools?.some(t => t.function.name === 'read_file'))
      assert.ok(!request.tools?.some(t => t.function.name === 'write_file'))
      return textReply('CHILD_EVIDENCE: 方法对照缺失')
    }
    if (request.messages.some(m => m.role === 'tool')) return textReply('根据专家证据补充方法对照')
    return toolReply('agent-reader', { prompt: '分析论文方法' })
  })
  const app = await createApplication({ dataRoot: root, model: model(fixture.fetch) })
  try {
    const session = await app.session('project', 'parent')
    session.subscribe(event => {
      if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    })
    await session.sendMessage({ content: '委派专家分析论文方法' })
    assert.ok(childSeen)
    assert.ok(fixture.requests.some(r => r.messages.some(m => m.role === 'tool' && JSON.stringify(m.content).includes('CHILD_EVIDENCE'))))
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('ask_user 原生挂起可响应，答案进入同一对话', { timeout: 25000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-mastra-'))
  const fixture = fixtureProvider(request => request.messages.some(m => m.role === 'tool')
    ? textReply('按方法章节继续') : toolReply('ask_user', { question: '重点看什么章节？' }))
  const app = await createApplication({ dataRoot: root, model: model(fixture.fetch) })
  try {
    const session = await app.session('project', 'ask')
    let suspendedId: string | undefined
    session.subscribe(event => {
      if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
      if (event.type === 'tool_suspended') suspendedId = event.toolCallId
    })
    await session.sendMessage({ content: '帮我读论文' })
    assert.ok(suspendedId)
    await session.respondToToolSuspension({ toolCallId: suspendedId, resumeData: '方法章节' })
    const history = JSON.stringify(await session.thread.listMessages({ threadId: 'project:ask' }))
    assert.match(history, /方法章节/)
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('取消信号到达实际 provider 请求，取消后可继续', { timeout: 25000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-mastra-'))
  let entered!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  let aborted = false, block = true
  const fixture = fixtureProvider(async (_request, signal) => {
    if (!block) return textReply('继续成功')
    entered()
    await new Promise<void>((_resolve, reject) => {
      const abort = () => { aborted = true; reject(new DOMException('Cancelled', 'AbortError')) }
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
    })
    return textReply('不应出现')
  })
  const app = await createApplication({ dataRoot: root, model: model(fixture.fetch) })
  try {
    const session = await app.session('project', 'cancel')
    const running = session.sendMessage({ content: '长时间任务' })
    await started
    session.abort()
    await running.catch(error => { assert.match(String(error), /abort|cancel/i) })
    assert.ok(aborted)
    block = false
    await session.sendMessage({ content: '继续' })
    assert.match(JSON.stringify(await session.thread.listMessages({ threadId: 'project:cancel' })), /继续成功/)
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})


test('并发打开同一任务只有一个会话；退出等待模型取消且拒绝新会话', { timeout: 25000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-shutdown-'))
  let entered!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  let aborted = false
  const fixture = fixtureProvider(async (_request, signal) => {
    entered()
    await new Promise<void>((_resolve, reject) => {
      const abort = () => { aborted = true; reject(new DOMException('Cancelled', 'AbortError')) }
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
    })
    return textReply('不应持久化')
  })
  const app = await createApplication({ dataRoot: root, model: model(fixture.fetch) })
  try {
    const sessions = await Promise.all(Array.from({ length: 12 }, () => app.session('project', 'same')))
    assert.ok(sessions.every(session => session === sessions[0]))
    const running = sessions[0]!.sendMessage({ content: '长运行' }).catch(error => {
      assert.match(String(error), /abort|cancel/i)
    })
    await started
    const closing = app.close()
    assert.equal(app.close(), closing)
    await assert.rejects(app.session('project', 'late'), /closed/)
    await closing
    await running
    assert.ok(aborted)
    const reopened = await createApplication({ dataRoot: root, model: model(fixtureProvider(() => textReply('恢复')).fetch) })
    try {
      const restored = await reopened.session('project', 'same')
      const history = JSON.stringify(await restored.thread.listMessages({ threadId: 'project:same' }))
      assert.match(history, /长运行/)
      assert.doesNotMatch(history, /不应持久化/)
      await restored.sendMessage({ content: '继续' })
    } finally { await reopened.close() }
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})


test('只读子 Agent 发出未授权写调用也不能落盘', { timeout: 25000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-reader-'))
  let attempted = false, rejected = false
  const fixture = fixtureProvider(request => {
    const child = request.messages.some(m => m.role === 'system' && String(m.content).includes('只读材料'))
    if (child && !attempted) {
      attempted = true
      return toolReply('write_file', { path: 'forbidden.md', content: '越权' }, 'child-write')
    }
    if (child) {
      rejected = request.messages.some(m => m.role === 'tool')
      return textReply('写入被拒绝，返回只读分析')
    }
    if (request.messages.some(m => m.role === 'tool')) return textReply('研究完成')
    return toolReply('agent-reader', { prompt: '分析材料' })
  })
  const app = await createApplication({ dataRoot: root, model: model(fixture.fetch) })
  try {
    const session = await app.session('project', 'readonly')
    session.subscribe(event => {
      if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    })
    await session.sendMessage({ content: '委派分析' })
    assert.ok(attempted)
    assert.ok(rejected)
    await assert.rejects(access(join(root, 'projects/project/tasks/readonly/forbidden.md')))
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})
