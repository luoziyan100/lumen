/**
 * [INPUT]: skillSlash.parseSlashFilter / slashMenuBox
 * [OUTPUT]: node:test —— 斜杠 token 解析 + 浮层视口盒
 * [POS]: Skills 斜杠 UI 契约
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSlashFilter, slashMenuBox } from '../src/composer/skillSlash.ts'

test('parseSlashFilter:仅整段 /token', () => {
  assert.equal(parseSlashFilter('/'), '')
  assert.equal(parseSlashFilter('/paper'), 'paper')
  assert.equal(parseSlashFilter('/paper-read'), 'paper-read')
  assert.equal(parseSlashFilter('hello'), null)
  assert.equal(parseSlashFilter('/a b'), null)
  assert.equal(parseSlashFilter(' /x'), null)
})

test('slashMenuBox:卡顶之上,左右各缩 12', () => {
  const box = slashMenuBox({ left: 100, top: 400, width: 480 }, 800)
  assert.deepEqual(box, { left: 112, width: 456, bottom: 408 })
})
