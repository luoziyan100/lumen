/**
 * [INPUT]: keepLiveConnection
 * [OUTPUT]: 已有可用连接时忽略发现失败，成功发现仍替换令牌
 * [POS]: 桌面根卸载回归；不启动 Tauri
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { keepLiveConnection } from '../src/mastra/data/connection.ts'

const live = { baseUrl: 'http://127.0.0.1:4317', token: 'a'.repeat(64) }

test('探测失败保留已经打开的连接', () => {
  const failed = { ...live, error: '研究服务暂未就绪。可点击重试重新发现服务。' }
  assert.equal(keepLiveConnection(live, failed), live)
})

test('冷启动失败仍然进入错误页', () => {
  const empty = { baseUrl: '', token: '', error: '未发现本机研究服务，请启动 Mastra 服务后重试。' }
  const failed = { baseUrl: '', token: '', error: '研究服务暂未就绪。可点击重试重新发现服务。' }
  assert.deepEqual(keepLiveConnection(empty, failed), failed)
})

test('新的可用发现替换地址和令牌', () => {
  const next = { baseUrl: 'http://127.0.0.1:4318', token: 'b'.repeat(64) }
  assert.deepEqual(keepLiveConnection({ ...live, error: '暂未就绪' }, next), next)
  assert.deepEqual(keepLiveConnection(live, next), next)
})
