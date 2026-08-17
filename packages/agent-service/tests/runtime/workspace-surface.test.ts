/**
 * 工作区展示面:目录即声明。夹具抄 2026-08-17 四会话病例。
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { FsWorkspace } from '../../src/workspace/fs-workspace.ts'
import { isWorkspaceSurfacePath, listWorkspaceAssets } from '../../src/runtime/assets.ts'

test('isWorkspaceSurfacePath:病例路径全拒,交付路径全收', () => {
  const hidden = [
    'library/README.md',
    'workers/sub-x/cache/y.md',
    'workers/sub-x/notes/z.md',
    'drafts/todo.md',
    'Library/Caches/a.md',
    'cache/paper-extract.md',
    'notes/foo/cache/raw.md',
    'scratch/run-1.py',
    'notes/search-123.md',
    'reports/out.html',
  ]
  for (const p of hidden) assert.equal(isWorkspaceSurfacePath(p), false, p)

  const shown = [
    'notes/a.md',
    'papers/b.pdf',
    'docs/c.md',
    'uploads/d.docx',
    '报告.md',
    'cover.png',
    'drafts/review.md',
    'images/fig.PNG',
    'shared/papers/x.pdf',
    'shared/docs/note.md',
  ]
  for (const p of shown) assert.equal(isWorkspaceSurfacePath(p), true, p)
})

test('listWorkspaceAssets:library 挂载 + 子代条带不上墙', async (t: TestContext) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-surface-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const sessionRoot = path.join(base, 'session')
  const sharedRoot = path.join(base, 'shared')
  const libraryRoot = path.join(base, 'src-folder')
  await mkdir(path.join(libraryRoot, 'notes'), { recursive: true })
  await writeFile(path.join(libraryRoot, 'README.md'), '# repo')
  await writeFile(path.join(libraryRoot, 'notes', 'src.md'), '源码笔记')

  const session = new FsWorkspace({ root: sessionRoot, sharedRoot, libraryRoot })
  const projectRoot = new FsWorkspace({ root: path.join(base, 'project') })

  await session.writeFile('workers/sub-x/cache/y.md', 'raw')
  await session.writeFile('workers/sub-x/notes/z.md', 'child note')
  await session.writeFile('drafts/todo.md', '- [ ] x')
  await session.writeFile('Library/Caches/a.md', 'pyc-adjacent')
  await session.writeFile('notes/a.md', 'user note')
  await session.writeFile('papers/b.pdf', '%PDF')
  await session.writeFile('docs/c.md', 'doc')
  await session.writeBytes('uploads/d.docx', new Uint8Array([1, 2]))
  await session.writeFile('报告.md', '# 报告')
  await session.writeBytes('hero.png', new Uint8Array([0x89, 0x50]))
  await session.writeFile('drafts/review.md', '# 综述')
  await projectRoot.writeBytes('shared/papers/shared.pdf', new Uint8Array([0x25, 0x50]))

  const assets = await listWorkspaceAssets({ taskId: 't', projectRoot, session })
  const paths = assets.map((a) => a.path).sort()
  assert.ok(paths.includes('notes/a.md'))
  assert.ok(paths.includes('papers/b.pdf'))
  assert.ok(paths.includes('docs/c.md'))
  assert.ok(paths.includes('uploads/d.docx'))
  assert.ok(paths.includes('报告.md'))
  assert.ok(paths.includes('hero.png'))
  assert.ok(paths.includes('drafts/review.md'))
  assert.ok(paths.includes('shared/papers/shared.pdf'))
  assert.ok(!paths.some((p) => p.startsWith('library/') || p.includes('/library/')), String(paths))
  assert.ok(!paths.some((p) => p.startsWith('workers/')), String(paths))
  assert.ok(!paths.includes('drafts/todo.md'))
  assert.ok(!paths.some((p) => p.startsWith('Library/')), String(paths))
})
