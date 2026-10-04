/**
 * [INPUT]: 产品文件 HTTP、真实 Mastra 工具循环与 contained LocalFilesystem
 * [OUTPUT]: 共享材料、跨会话记忆、模型工具格式兼容与本地文件名约束的行为证据
 * [POS]: 证明范围选择改变真实文件根，模型复制资料不修改原件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHttpService } from '../src/server.ts'
import { createMemoryTools } from '../src/workspace/memory.ts'
import { fixtureProvider, textReply, toolReply } from './provider-fixture.ts'

test('项目资料跨会话共享、记忆进入同项目上下文，复制和范围读取不越界', { timeout: 90000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-project-files-'))
  const external = await realpath(await mkdtemp(join(tmpdir(), 'lumen-source-files-')))
  const fixture = fixtureProvider(request => {
    for (const tool of request.tools ?? []) {
      if (['read_memory', 'write_memory'].includes(tool.function.name)) assert.doesNotMatch(JSON.stringify(tool.function.parameters), /\\p\{[LN]\}/)
    }
    const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
    const turn = request.messages.slice(lastUser)
    if (turn.some(message => message.role === 'tool')) return textReply('已处理项目文件')
    if (JSON.stringify(turn).includes('记住')) return toolReply('write_memory', { name: 'MEMORY.md', content: '引用必须包含页码。项目核对码 PROJECT-P-41。' })
    return toolReply('copy_project_file', { source: 'source.txt', destination: 'library/copied.txt' })
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
  const scope = (projectId: string, taskId: string, kind: string) => `projectId=${projectId}&taskId=${taskId}&scope=${kind}`
  try {
    for (const project of ['p', 'q']) {
      await json('/projects', 'POST', { id: project, name: project }, 201)
      for (const task of ['a', 'b']) await json(`/projects/${project}/sessions`, 'POST', { taskId: task }, 201)
    }
    const form = new FormData()
    form.set('file', new File(['共享原件，页码 7，证据 SHARED-23'], 'source.txt', { type: 'text/plain' }))
    const upload = await service.app.request(`/lumen/uploads?${scope('p', 'a', 'shared')}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    assert.equal(upload.status, 200)
    assert.equal((await upload.json()).path, 'source.txt')
    const shared = await json(`/files?${scope('p', 'b', 'shared')}&path=source.txt`)
    assert.match(shared.content, /SHARED-23/)
    assert.equal((await json(`/assets?${scope('q', 'a', 'shared')}`)).entries.length, 0)
    const first = await service.application.session('p', 'a')
    await first.sendMessage({ content: '记住项目约定' })
    assert.match(await readFile(join(dataRoot, 'projects/p/memory/MEMORY.md'), 'utf8'), /PROJECT-P-41/)
    const second = await service.application.session('p', 'b')
    await second.sendMessage({ content: '复制共享材料到当前研究' })
    assert.match(JSON.stringify(fixture.requests.at(-1)), /PROJECT-P-41/)
    assert.match(JSON.stringify(fixture.requests.at(-1)), /library\/copied.txt/)
    const copied = await json(`/files?${scope('p', 'b', 'task')}&path=library/copied.txt`)
    assert.equal(copied.content, shared.content)
    await json('/files', 'POST', { projectId: 'p', taskId: 'b', path: 'library/copied.txt', content: '任务内修改' })
    assert.equal((await json(`/files?${scope('p', 'a', 'shared')}&path=source.txt`)).content, shared.content)
    const readonly = await service.application.projectFiles('p', 'shared', true)
    await assert.rejects(() => readonly.writeFile('source.txt', '不允许修改'))
    const foreign = await service.application.session('q', 'a')
    await foreign.sendMessage({ content: '复制共享材料' })
    assert.doesNotMatch(JSON.stringify(fixture.requests.at(-1)), /PROJECT-P-41|SHARED-23/)
    await assert.rejects(() => readFile(join(dataRoot, 'projects/q/tasks/a/library/copied.txt')))
    await symlink(join(dataRoot, 'projects/p/shared/source.txt'), join(dataRoot, 'projects/q/shared/escape.txt'))
    await json(`/files?${scope('q', 'a', 'shared')}&path=escape.txt`, 'GET', undefined, 500)
    await json(`/files?${scope('q', 'a', 'task')}&path=../../../p/shared/source.txt`, 'GET', undefined, 500)
    await json(`/assets?${scope('missing', 'a', 'shared')}`, 'GET', undefined, 404)
    assert.equal((await json(`/assets?${scope('q', 'a', 'source')}`)).unbound, true)
    await writeFile(join(external, 'bound.txt'), '外部只读证据 SOURCE-55')
    await writeFile(join(dataRoot, 'projects/q/source.json'), JSON.stringify({ version: 1, path: external, readOnly: true }), { mode: 0o600 })
    assert.match((await json(`/files?${scope('q', 'a', 'source')}&path=bound.txt`)).content, /SOURCE-55/)
    const source = await service.application.projectFiles('q', 'source')
    await assert.rejects(() => source.writeFile('bound.txt', '不能覆盖原件'))
    await json(`/uploads?${scope('q', 'a', 'source')}`, 'POST', { file: 'ignored' }, 403)
    assert.match(await readFile(join(external, 'bound.txt'), 'utf8'), /SOURCE-55/)
  } finally { await service.close(); await rm(dataRoot, { recursive: true, force: true }); await rm(external, { recursive: true, force: true }) }
})

test('模型工具格式兼容不放宽记忆文件的本地验证，中文名称可用而路径仍拒绝', async () => {
  const tools = createMemoryTools(async () => { throw new Error('Schema checks must not access files') })
  for (const tool of Object.values(tools)) {
    for (const name of ['MEMORY.md', '研究约定.md', '🧪.md', '', '../outside.md', 'a/b.md', 'a\\b.md', '/etc/passwd', 'a..md', '.hidden', 'a'.repeat(121)]) {
      const valid = name === 'MEMORY.md' || name === '研究约定.md'
      const result = await tool.inputSchema!['~standard'].validate({ name, content: '项目事实' })
      assert.equal(!result.issues, valid, name)
    }
  }
})
