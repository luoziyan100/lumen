/**
 * 上传知情附言 + 当前稿附言:纯函数契约
 * (doc/upload-awareness.md S4;briefs/active/artifact-loop-P0.md)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatActivePathAnnex,
  formatUploadAnnex,
  hintForUpload,
  isBindableActivePath,
  parseUploads,
  pathFromToolArgs,
  sanitizeActivePath,
  userContentForModel,
} from '../../src/runtime/upload-awareness.ts'

test('hint:pdf / docx 抽出 / zip / html', () => {
  assert.match(hintForUpload({ name: 'a.pdf', path: 'papers/a.pdf' }), /extract_pdf/)
  assert.match(
    hintForUpload({ name: 'a.docx', path: 'uploads/a.docx', extractPath: 'docs/a.md' }),
    /docs\/a\.md/,
  )
  assert.match(hintForUpload({ name: 'x.zip', path: 'uploads/x.zip' }), /压缩包|未做文本抽取/)
  assert.match(hintForUpload({ name: 'p.html', path: 'docs/p.html' }), /read_file/)
})

test('formatUploadAnnex 含全部路径;空数组为空串', () => {
  assert.equal(formatUploadAnnex([]), '')
  const annex = formatUploadAnnex([
    { name: 'a.pdf', path: 'papers/a.pdf' },
    { name: 'b.zip', path: 'uploads/b.zip' },
  ])
  assert.match(annex, /本回合上传的附件/)
  assert.match(annex, /papers\/a\.pdf/)
  assert.match(annex, /uploads\/b\.zip/)
})

test('userContentForModel:仅附件 / 正文+附件 / 无附件', () => {
  const u = [{ name: 'a.pdf', path: 'papers/a.pdf' }]
  assert.match(userContentForModel('', u), /papers\/a\.pdf/)
  assert.match(userContentForModel('看看这个', u), /^看看这个\n\n# 本回合/)
  assert.equal(userContentForModel('hi', []), 'hi')
})

test('parseUploads 容错', () => {
  assert.deepEqual(parseUploads(null), [])
  assert.deepEqual(parseUploads([{ path: 'papers/a.pdf', name: 'a.pdf' }]), [
    { name: 'a.pdf', path: 'papers/a.pdf' },
  ])
  assert.deepEqual(parseUploads([{ path: 'x', extractPath: 'docs/x.md' }]), [
    { name: 'x', path: 'x', extractPath: 'docs/x.md' },
  ])
})

test('sanitizeActivePath:可绑 drafts/notes;拒 PDF HTML shared cache 逃逸', () => {
  assert.equal(sanitizeActivePath('drafts/综述.md'), 'drafts/综述.md')
  assert.equal(sanitizeActivePath('notes/a.txt'), 'notes/a.txt')
  assert.equal(sanitizeActivePath('docs/a.md'), 'docs/a.md')
  assert.equal(sanitizeActivePath('papers/a.pdf'), null)
  // HTML 只开不绑:预览 ≠ 当前稿
  assert.equal(sanitizeActivePath('drafts/page.html'), null)
  assert.equal(sanitizeActivePath('notes/x.htm'), null)
  assert.equal(sanitizeActivePath('shared/notes/x.md'), null)
  assert.equal(sanitizeActivePath('cache/x.md'), null)
  assert.equal(sanitizeActivePath('../etc/passwd'), null)
  assert.equal(sanitizeActivePath('/abs/x.md'), null)
  assert.equal(sanitizeActivePath(null), null)
  assert.ok(isBindableActivePath('drafts/a.md'))
  assert.equal(isBindableActivePath('papers/a.pdf'), false)
  assert.equal(isBindableActivePath('x.html'), false)
})

test('formatActivePathAnnex + userContentForModel 合并', () => {
  assert.equal(formatActivePathAnnex('papers/a.pdf'), '')
  assert.match(formatActivePathAnnex('drafts/a.md'), /当前稿/)
  assert.match(formatActivePathAnnex('drafts/a.md'), /drafts\/a\.md/)
  const both = userContentForModel('改第二节', {
    uploads: [{ name: 'a.pdf', path: 'papers/a.pdf' }],
    activePath: 'drafts/a.md',
  })
  assert.match(both, /^改第二节\n\n# 本回合/)
  assert.match(both, /# 当前稿/)
  assert.match(both, /drafts\/a\.md/)
  assert.equal(userContentForModel('hi', { activePath: null }), 'hi')
})

test('pathFromToolArgs 别名', () => {
  assert.equal(pathFromToolArgs({ path: 'drafts/a.md' }), 'drafts/a.md')
  assert.equal(pathFromToolArgs({ file_name: 'notes/b.md' }), 'notes/b.md')
  assert.equal(pathFromToolArgs({}), null)
})
