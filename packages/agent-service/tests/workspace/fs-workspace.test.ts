import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { FsWorkspace, SandboxError, globToRegExp } from '../../src/workspace/fs-workspace.ts'

async function makeWorkspace(t: TestContext): Promise<{ base: string; root: string; library: string; ws: FsWorkspace }> {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-ws-'))
  const root = path.join(base, 'workspace')
  const library = path.join(base, 'library')
  await mkdir(root, { recursive: true })
  await mkdir(library, { recursive: true })
  t.after(() => rm(base, { recursive: true, force: true }))
  return { base, root, library, ws: new FsWorkspace({ root, libraryRoot: library }) }
}

test('write → read 往返，自动创建父目录', async (t) => {
  const { ws } = await makeWorkspace(t)
  await ws.writeFile('notes/sub/x.md', 'hello 世界')
  assert.equal(await ws.readFile('notes/sub/x.md'), 'hello 世界')
})

test('editFile：唯一匹配替换；未找到 / 非唯一报错', async (t) => {
  const { ws } = await makeWorkspace(t)
  await ws.writeFile('a.txt', 'foo bar baz')
  await ws.editFile('a.txt', 'bar', 'BAR')
  assert.equal(await ws.readFile('a.txt'), 'foo BAR baz')
  await assert.rejects(() => ws.editFile('a.txt', 'nope', 'x'), /未找到/)
  await ws.writeFile('b.txt', 'x x x')
  await assert.rejects(() => ws.editFile('b.txt', 'x', 'y'), /唯一/)
})

test('listDir 区分文件与目录', async (t) => {
  const { ws } = await makeWorkspace(t)
  await ws.writeFile('notes/a.md', '1')
  await ws.writeFile('top.txt', '2')
  const entries = await ws.listDir('')
  const names = entries.map((e) => `${e.type}:${e.name}`).sort()
  assert.deepEqual(names, ['dir:notes', 'file:top.txt'])
})

test('grep 跨嵌套文件命中，返回虚拟路径', async (t) => {
  const { ws } = await makeWorkspace(t)
  await ws.writeFile('notes/a.md', '第一行\n扩散模型 diffusion\n第三行')
  await ws.writeFile('drafts/b.md', '无关内容')
  const hits = await ws.grep('diffusion')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].path, 'notes/a.md')
  assert.equal(hits[0].line, 2)
})

test('grep path 指向单个文件也能命中（回归：walkFiles 对文件 readdir 抛 ENOTDIR 曾静默返回空）', async (t) => {
  const { ws } = await makeWorkspace(t)
  await ws.writeFile('paper.txt', 'intro 部分\n中间有 challenge 关键词\n结尾')
  const viaFile = await ws.grep('challenge', { path: 'paper.txt' })
  const viaDir = await ws.grep('challenge')
  assert.equal(viaFile.length, 1, 'grep path=文件 必须能命中（这正是 Soul Computing 任务里三次无匹配的根因）')
  assert.equal(viaDir.length, 1)
  assert.equal(viaFile[0].path, 'paper.txt')
})

test('grep 命中返回字符偏移，长行截断到匹配上下文（模拟无换行 PDF）', async (t) => {
  const { ws } = await makeWorkspace(t)
  const filler = 'x'.repeat(1000)
  const body = `${filler} CORE_CHALLENGES_HERE ${filler}` // 整段无换行，关键词在中段
  await ws.writeFile('full.txt', body)
  const hits = await ws.grep('CORE_CHALLENGES_HERE')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].charOffset, body.indexOf('CORE_CHALLENGES_HERE'), 'charOffset 必须指向匹配处')
  assert.ok(hits[0].text.length < body.length, '长行必须被截断，不灌爆上下文')
  assert.match(hits[0].text, /CORE_CHALLENGES_HERE/, '截断窗口必须含匹配词')
})

test('glob 支持 ** 与 *', async (t) => {
  const { ws } = await makeWorkspace(t)
  await ws.writeFile('notes/a.md', '1')
  await ws.writeFile('notes/sub/b.md', '2')
  await ws.writeFile('c.txt', '3')
  assert.deepEqual(await ws.glob('**/*.md'), ['notes/a.md', 'notes/sub/b.md'])
  assert.deepEqual(await ws.glob('*.txt'), ['c.txt'])
})

test('沙箱：拒绝 .. 越界与绝对路径', async (t) => {
  const { ws } = await makeWorkspace(t)
  await assert.rejects(() => ws.readFile('../escape.txt'), SandboxError)
  await assert.rejects(() => ws.writeFile('../../evil.txt', 'x'), SandboxError)
  await assert.rejects(() => ws.readFile('/etc/passwd'), SandboxError)
})

test('沙箱：library/ 可读不可写', async (t) => {
  const { ws, library } = await makeWorkspace(t)
  await writeFile(path.join(library, 'paper.txt'), 'PAPER_BODY')
  assert.equal(await ws.readFile('library/paper.txt'), 'PAPER_BODY')
  await assert.rejects(() => ws.writeFile('library/x.txt', 'nope'), SandboxError)
})

test('沙箱：符号链接逃逸被拒', async (t) => {
  const { ws, base, root } = await makeWorkspace(t)
  const outside = path.join(base, 'secret.txt')
  await writeFile(outside, 'TOPSECRET')
  await symlink(outside, path.join(root, 'link.txt'))
  await assert.rejects(() => ws.readFile('link.txt'), SandboxError)
})

test('globToRegExp 单元', () => {
  assert.match('notes/a.md', globToRegExp('**/*.md'))
  assert.match('a.md', globToRegExp('**/*.md'))
  assert.doesNotMatch('notes/a.txt', globToRegExp('**/*.md'))
  assert.match('x.txt', globToRegExp('*.txt'))
  assert.doesNotMatch('notes/x.txt', globToRegExp('*.txt'))
})
