/**
 * [INPUT]: 真实临时项目/外部目录、Hono 组合路由、项目目录与只读文件系统
 * [OUTPUT]: 外部资料绑定 CRUD、非法元文件拒绝及内部时间恢复隔离证明
 * [POS]: 产品目录边界回归；不操作用户资料，不启动旧服务或模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chmod, link, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { Memory } from '@mastra/memory'
import { LibSQLStore } from '@mastra/libsql'
import { CatalogError, createCatalog } from '../../src/catalog/catalog.ts'
import { ProjectStore } from '../../src/catalog/projects.ts'
import { catalogRoutes } from '../../src/catalog/routes.ts'
import { projectSourceRoutes } from '../../src/catalog/source-routes.ts'
import { projectFilesystem } from '../../src/workspace/workspace.ts'
import { readSourceBinding, removeSourceBinding, setSourceBinding, sourcePath, SourceUnavailable } from '../../src/workspace/source.ts'

async function fixture(changed?: (projectId: string) => void | Promise<void>, beforeChange?: () => void | Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'lumen-project-source-'))
  const dataRoot = join(root, 'data'), first = join(root, 'first'), second = join(root, 'second')
  await Promise.all([dataRoot, first, second].map(path => mkdir(path, { mode: 0o700 })))
  await writeFile(join(first, 'paper.txt'), '第一份原件')
  await writeFile(join(second, 'paper.txt'), '第二份原件')
  const storage = new LibSQLStore({ id: 'source-test', url: `file:${join(dataRoot, 'mastra.sqlite')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false } })
  const catalog = createCatalog(dataRoot, memory)
  await catalog.createProject('资料研究', 'p')
  const app = new Hono().route('/lumen', catalogRoutes(catalog)).route('/lumen', projectSourceRoutes(catalog, { dataRoot, beforeChange, changed }))
  async function request(method: string, path: string, body?: unknown) {
    return app.request(`/lumen${path}`, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  }
  return { root, dataRoot, first, second, catalog, request,
    async close() { await catalog.close(); await storage.close(); await rm(root, { recursive: true, force: true }) } }
}

test('新项目可显式绑定、重绑和移除，原件只读且保存后通知应用失效缓存', async () => {
  const notified: string[] = []
  const context = await fixture(projectId => { notified.push(projectId) })
  try {
    const endpoint = '/projects/p/source'
    assert.deepEqual(await (await context.request('GET', endpoint)).json(), { path: null, readOnly: true })
    const alias = join(context.root, 'selected-alias')
    await symlink(context.first, alias)
    const saved = await context.request('PATCH', endpoint, { path: alias })
    assert.equal(saved.status, 200)
    assert.deepEqual(await saved.json(), { path: await realpath(context.first), readOnly: true })
    const path = join(context.dataRoot, 'projects/p/source.json')
    assert.equal((await stat(path)).mode & 0o777, 0o600)
    const first = await projectFilesystem(context.dataRoot, 'p', 'source')
    assert.equal(String(await first.readFile('paper.txt', { encoding: 'utf8' })), '第一份原件')
    await assert.rejects(() => first.writeFile('paper.txt', '不允许覆盖'))
    const updated = await context.request('PATCH', endpoint, { path: context.second })
    assert.equal(updated.status, 200)
    const second = await projectFilesystem(context.dataRoot, 'p', 'source')
    assert.equal(String(await second.readFile('paper.txt', { encoding: 'utf8' })), '第二份原件')
    assert.deepEqual(await (await context.request('PATCH', endpoint, { path: null })).json(), { path: null, readOnly: true })
    await assert.rejects(() => sourcePath(join(context.dataRoot, 'projects/p')), SourceUnavailable)
    assert.deepEqual(await (await context.request('GET', endpoint)).json(), { path: null, readOnly: true })
    assert.deepEqual(notified, ['p', 'p', 'p'])
    assert.equal(await readFile(join(context.first, 'paper.txt'), 'utf8'), '第一份原件')
    assert.equal(await readFile(join(context.second, 'paper.txt'), 'utf8'), '第二份原件')
    assert.deepEqual(await readdir(join(context.dataRoot, 'projects/p')), [])
  } finally { await context.close() }
})

test('缺失项目和非法请求不创建绑定，失效外部目录仍可查看和移除配置', async () => {
  const context = await fixture()
  try {
    for (const path of ['relative', join(context.first, 'paper.txt'), join(context.root, 'missing')])
      assert.equal((await context.request('PATCH', '/projects/p/source', { path })).status, 400)
    assert.equal((await context.request('PATCH', '/projects/missing/source', { path: context.first })).status, 404)
    assert.equal((await context.request('GET', '/projects/missing/source')).status, 404)
    assert.equal((await context.request('PATCH', '/projects/p/source', { path: context.first, readOnly: false })).status, 400)
    assert.equal((await context.request('PATCH', '/projects/p/source', {})).status, 400)
    await assert.rejects(stat(join(context.dataRoot, 'projects/missing')), { code: 'ENOENT' })
    await context.request('PATCH', '/projects/p/source', { path: context.first })
    await rm(context.first, { recursive: true })
    assert.equal((await (await context.request('GET', '/projects/p/source')).json()).path, await realpath(context.root).then(root => join(root, 'first')))
    await assert.rejects(() => sourcePath(join(context.dataRoot, 'projects/p')), /不存在/)
    assert.equal((await context.request('PATCH', '/projects/p/source', { path: null })).status, 200)
  } finally { await context.close() }
})

test('软链/硬链接/公开权限元文件不能被读取、改写或移除，外部文件保持不变', async () => {
  const context = await fixture()
  try {
    const project = join(context.dataRoot, 'projects/p')
    await mkdir(project, { recursive: true, mode: 0o700 })
    const target = join(project, 'source.json'), outside = join(context.root, 'outside.json')
    const original = JSON.stringify({ version: 1, path: await realpath(context.first), readOnly: true })
    await writeFile(outside, original, { mode: 0o600 })
    await symlink(outside, target)
    for (const method of ['GET', 'PATCH']) assert.equal((await context.request(method, '/projects/p/source', method === 'PATCH' ? { path: context.second } : undefined)).status, 409)
    await assert.rejects(() => removeSourceBinding(project))
    await rm(target)
    await link(outside, target)
    await assert.rejects(() => setSourceBinding(project, context.second), /链接/)
    await assert.rejects(() => removeSourceBinding(project), /链接/)
    await rm(target)
    await writeFile(target, original, { mode: 0o644 })
    await assert.rejects(() => readSourceBinding(project), /私有/)
    await chmod(target, 0o600)
    await writeFile(target, '{malformed')
    assert.equal((await context.request('GET', '/projects/p/source')).status, 409)
    assert.equal((await context.request('PATCH', '/projects/p/source', { path: context.second })).status, 200)
    assert.equal(await readFile(outside, 'utf8'), original)
  } finally { await context.close() }
})

test('保存后通知失败明确报告已落盘；同项目请求等待前一次通知结束', async () => {
  let release!: () => void
  let entered!: () => void
  const firstEntered = new Promise<void>(done => { entered = done })
  const barrier = new Promise<void>(done => { release = done })
  let count = 0
  const context = await fixture(async () => { if (++count === 1) { entered(); await barrier } else throw new Error('Synthetic invalidation failure') })
  try {
    const first = context.request('PATCH', '/projects/p/source', { path: context.first })
    await firstEntered
    const second = context.request('PATCH', '/projects/p/source', { path: context.second })
    assert.equal((await readSourceBinding(join(context.dataRoot, 'projects/p'))).path, await realpath(context.first))
    release()
    assert.equal((await first).status, 200)
    const failed = await second
    assert.equal(failed.status, 500)
    const result = await failed.json()
    assert.equal(result.saved, true)
    assert.equal(result.source.path, await realpath(context.second))
    assert.equal((await readSourceBinding(join(context.dataRoot, 'projects/p'))).path, await realpath(context.second))
  } finally { release(); await context.close() }
})

test('项目历史时间只能经内部恢复方法写入，公共创建/更新不能伪造时间', async () => {
  const context = await fixture()
  try {
    const historical = { createdAt: '2020-01-02T03:04:05.000Z', updatedAt: '2020-03-04T05:06:07.000Z' }
    assert.equal((await context.request('POST', '/projects', { name: '不可伪造', ...historical })).status, 400)
    assert.equal((await context.request('PATCH', '/projects/p', historical)).status, 400)
    const store = new ProjectStore(context.dataRoot)
    try {
      store.restoreTimestamps('p', historical)
      assert.throws(() => store.restoreTimestamps('p', { ...historical, createdAt: 'invalid' }), /valid dates/)
      assert.throws(() => store.restoreTimestamps('unknown', historical), /unknown project/)
    } finally { store.close() }
    const project = await (await context.request('GET', '/projects/p')).json()
    assert.equal(project.createdAt, historical.createdAt)
    assert.equal(project.updatedAt, historical.updatedAt)
  } finally { await context.close() }
})

test('运行限制在输入和项目校验之后、写文件之前生效，不触发保存后通知', async () => {
  let checked = 0, notified = 0
  const context = await fixture(() => { notified++ }, async () => { checked++; throw new CatalogError('研究尚未结束', 409) })
  try {
    assert.equal((await context.request('PATCH', '/projects/missing/source', { path: context.first })).status, 404)
    assert.equal((await context.request('PATCH', '/projects/p/source', {})).status, 400)
    assert.equal(checked, 0)
    assert.equal((await context.request('PATCH', '/projects/p/source', { path: context.first })).status, 409)
    assert.equal(checked, 1)
    assert.equal(notified, 0)
    await assert.rejects(stat(join(context.dataRoot, 'projects/p/source.json')), { code: 'ENOENT' })
  } finally { await context.close() }
})
