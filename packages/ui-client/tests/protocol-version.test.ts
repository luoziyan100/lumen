/**
 * [INPUT]: protocol/version.ts
 * [OUTPUT]: 旧 hello/portfile 无字段视为 0;当前代数匹配
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PROTOCOL_VERSION, isProtocolCurrent, protocolVersionOf } from '../../agent-service/src/protocol/version.ts'

test('protocolVersionOf: 缺字段 / 非数字 → 0', () => {
  assert.equal(protocolVersionOf(undefined), 0)
  assert.equal(protocolVersionOf({ type: 'hello', demo: false }), 0)
  assert.equal(protocolVersionOf({ protocolVersion: '1' }), 0)
  assert.equal(protocolVersionOf({ protocolVersion: 1 }), 1)
})

test('isProtocolCurrent: 只认当前代数', () => {
  assert.equal(isProtocolCurrent({ protocolVersion: PROTOCOL_VERSION }), true)
  assert.equal(isProtocolCurrent({}), false)
  assert.equal(isProtocolCurrent({ protocolVersion: 0 }), false)
})
