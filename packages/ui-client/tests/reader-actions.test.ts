/**
 * [INPUT]: shell/workspaceFile 路径合同 + 阅读器复制资格
 * [OUTPUT]: 钉 shared/session 定根、穿越拒绝、MD/HTML 可复制 PDF 不可
 * [POS]: 锁阅读器打开本地文件的路径与复制合同,与 Rust open_workspace_file 同构
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  readerCanCopy,
  readerCopyText,
  resolveWorkspaceAbsPath,
  sanitizeWorkspaceId,
} from '../src/shell/workspaceFile.ts'

test('sanitizeWorkspaceId matches service: non-word → _, empty → default', () => {
  assert.equal(sanitizeWorkspaceId('p-69953fe6ddd5'), 'p-69953fe6ddd5')
  assert.equal(sanitizeWorkspaceId('../etc'), '___etc')
  assert.equal(sanitizeWorkspaceId(''), 'default')
})

test('resolveWorkspaceAbsPath: session file under sessions/<tid>', () => {
  const p = resolveWorkspaceAbsPath('/Users/x/.lumen', 'p-1', 'SKILL.md', 'task-abc')
  assert.equal(p, '/Users/x/.lumen/workspaces/p-1/sessions/task-abc/SKILL.md')
})

test('resolveWorkspaceAbsPath: shared/* stays on project root', () => {
  const p = resolveWorkspaceAbsPath('/Users/x/.lumen', 'p-1', 'shared/notes/a.md', 'task-abc')
  assert.equal(p, '/Users/x/.lumen/workspaces/p-1/shared/notes/a.md')
})

test('resolveWorkspaceAbsPath: no taskId uses project root', () => {
  const p = resolveWorkspaceAbsPath('/Users/x/.lumen', 'p-1', 'docs/a.md', null)
  assert.equal(p, '/Users/x/.lumen/workspaces/p-1/docs/a.md')
})

test('resolveWorkspaceAbsPath rejects traversal and absolute paths', () => {
  assert.equal(resolveWorkspaceAbsPath('/Users/x/.lumen', 'p-1', '../secrets', 't'), null)
  assert.equal(resolveWorkspaceAbsPath('/Users/x/.lumen', 'p-1', '/etc/passwd', 't'), null)
  assert.equal(resolveWorkspaceAbsPath('/Users/x/.lumen', 'p-1', 'foo/../../x', 't'), null)
})

test('reader copies source for md/html, not pdf', () => {
  assert.equal(readerCanCopy('doc'), true)
  assert.equal(readerCanCopy('html'), true)
  assert.equal(readerCanCopy('pdf'), false)
  assert.equal(readerCopyText('doc', '# hi'), '# hi')
  assert.equal(readerCopyText('html', '<p>x</p>'), '<p>x</p>')
  assert.equal(readerCopyText('pdf', 'bytes'), null)
})
