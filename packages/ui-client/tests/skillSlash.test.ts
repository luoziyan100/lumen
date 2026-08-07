/**
 * [INPUT]: skillSlash.parseSlashFilter
 * [OUTPUT]: node:test —— 斜杠 token 解析
 * [POS]: Skills 斜杠 UI 契约
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSlashFilter } from '../src/skillSlash.ts'

test('parseSlashFilter:仅整段 /token', () => {
  assert.equal(parseSlashFilter('/'), '')
  assert.equal(parseSlashFilter('/paper'), 'paper')
  assert.equal(parseSlashFilter('/paper-read'), 'paper-read')
  assert.equal(parseSlashFilter('hello'), null)
  assert.equal(parseSlashFilter('/a b'), null)
  assert.equal(parseSlashFilter(' /x'), null)
})
