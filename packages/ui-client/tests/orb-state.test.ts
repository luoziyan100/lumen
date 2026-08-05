/**
 * [INPUT]: orbStateFromTool / orbStateFromSteps / ORB_THINKING
 * [OUTPUT]: 工具名 → OrbState 映射不变式;过程步焦点态
 * [POS]: ui-client 测试;锁过程指示器状态表
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ORB_THINKING, orbStateFromSteps, orbStateFromTool } from '../src/orbState.ts'

describe('orbStateFromTool', () => {
  it('检索类 → searching', () => {
    for (const name of [
      'search_papers', 'openalex_search', 'search_web', 'web_search', 'grep', 'glob', 'get_citations',
    ]) {
      assert.equal(orbStateFromTool(name), 'searching', name)
    }
  })

  it('run_code → solving', () => {
    assert.equal(orbStateFromTool('run_code'), 'solving')
  })

  it('感知输入 → listening', () => {
    assert.equal(orbStateFromTool('ask_user'), 'listening')
    assert.equal(orbStateFromTool('look_at_image'), 'listening')
  })

  it('写盘/写记忆 → composing', () => {
    assert.equal(orbStateFromTool('write_file'), 'composing')
    assert.equal(orbStateFromTool('edit_file'), 'composing')
    assert.equal(orbStateFromTool('write_memory'), 'composing')
  })

  it('抓取/PDF → weaving', () => {
    assert.equal(orbStateFromTool('fetch_url'), 'weaving')
    assert.equal(orbStateFromTool('read_url'), 'weaving')
    assert.equal(orbStateFromTool('extract_pdf'), 'weaving')
  })

  it('读记忆 → connecting', () => {
    assert.equal(orbStateFromTool('read_memory'), 'connecting')
  })

  it('读盘/列目录 → working', () => {
    for (const name of ['read_file', 'list_files', 'list_dir']) {
      assert.equal(orbStateFromTool(name), 'working', name)
    }
  })

  it('未知与空串 → working', () => {
    assert.equal(orbStateFromTool('mystery_tool'), 'working')
    assert.equal(orbStateFromTool(''), 'working')
    assert.equal(orbStateFromTool('   '), 'working')
  })
})

describe('orbStateFromSteps', () => {
  it('取最后一个未完成步的工具态', () => {
    assert.equal(
      orbStateFromSteps([
        { name: 'read_file', done: true },
        { name: 'grep', done: false },
      ]),
      'searching',
    )
  })

  it('全完成则取末步态(不回落 breathing)', () => {
    assert.equal(
      orbStateFromSteps([
        { name: 'read_file', done: true },
        { name: 'grep', done: true },
      ]),
      'searching',
    )
  })

  it('空步 → working', () => {
    assert.equal(orbStateFromSteps([]), 'working')
  })
})

describe('ORB_THINKING', () => {
  it('等待态固定 breathing(与工具态分离)', () => {
    assert.equal(ORB_THINKING, 'breathing')
  })
})
