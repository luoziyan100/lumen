/**
 * [INPUT]: composerAccept
 * [OUTPUT]: node:test —— 白名单过滤可观测契约
 * [POS]: 拖放/点选共用过滤的回归钉;不替代 Tauri 壳层 dragDropEnabled 互斥问题
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterComposerFiles, dragHasFiles, COMPOSER_ACCEPT } from '../src/composerAccept.ts'

test('filterComposerFiles:只放行白名单扩展名', () => {
  const files = [
    new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' }),
    new File([new Uint8Array([1])], 'b.exe', { type: 'application/octet-stream' }),
    new File([new Uint8Array([1])], 'note.MD', { type: 'text/markdown' }),
    new File([new Uint8Array([1])], 'noext', { type: 'text/plain' }),
  ]
  const ok = filterComposerFiles(files)
  assert.deepEqual(ok.map((f) => f.name), ['a.pdf', 'note.MD'])
})

test('COMPOSER_ACCEPT 含 pdf', () => {
  assert.match(COMPOSER_ACCEPT, /\.pdf/)
})

test('dragHasFiles:识别 Files 类型', () => {
  const dt = { types: ['Files', 'text/uri-list'] } as DataTransfer
  assert.equal(dragHasFiles(dt), true)
  assert.equal(dragHasFiles({ types: ['text/plain'] } as DataTransfer), false)
  assert.equal(dragHasFiles(null), false)
})
