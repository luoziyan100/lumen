/**
 * 上传知情附言:纯函数契约(doc/upload-awareness.md S4)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatUploadAnnex,
  hintForUpload,
  parseUploads,
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
