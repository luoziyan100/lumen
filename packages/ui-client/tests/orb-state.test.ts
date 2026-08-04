/**
 * [INPUT]: orbStateFromTool / ORB_THINKING
 * [OUTPUT]: 工具名 → OrbState 映射不变式
 * [POS]: ui-client 测试;锁过程指示器状态表
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ORB_THINKING, orbStateFromTool } from '../src/orbState.ts'

describe('orbStateFromTool', () => {
  it('检索类 → searching', () => {
    for (const name of ['search_papers', 'openalex_search', 'search_web', 'web_search', 'grep']) {
      assert.equal(orbStateFromTool(name), 'searching', name)
    }
  })

  it('run_code → solving', () => {
    assert.equal(orbStateFromTool('run_code'), 'solving')
  })

  it('ask_user → listening', () => {
    assert.equal(orbStateFromTool('ask_user'), 'listening')
  })

  it('写盘 → composing', () => {
    assert.equal(orbStateFromTool('write_file'), 'composing')
    assert.equal(orbStateFromTool('edit_file'), 'composing')
  })

  it('抓取/PDF → weaving', () => {
    assert.equal(orbStateFromTool('fetch_url'), 'weaving')
    assert.equal(orbStateFromTool('read_url'), 'weaving')
    assert.equal(orbStateFromTool('extract_pdf'), 'weaving')
  })

  it('读盘/列目录 → working', () => {
    for (const name of ['read_file', 'list_files', 'list_dir', 'glob']) {
      assert.equal(orbStateFromTool(name), 'working', name)
    }
  })

  it('未知与空串 → working', () => {
    assert.equal(orbStateFromTool('mystery_tool'), 'working')
    assert.equal(orbStateFromTool(''), 'working')
    assert.equal(orbStateFromTool('   '), 'working')
  })
})

describe('ORB_THINKING', () => {
  it('等待态固定 breathing', () => {
    assert.equal(ORB_THINKING, 'breathing')
  })
})
