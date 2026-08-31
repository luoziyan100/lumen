/**
 * [INPUT]: scrollDebug 缓冲 / 清空 / 导出
 * [OUTPUT]: debug 关闭不记;开启后可清空;导出不含正文
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  clearScrollDebugLog,
  formatScrollDebugExport,
  getScrollDebugLog,
  scrollDebugLog,
  setScrollDebug,
} from '../src/scroll/scrollDebug.ts'

describe('scrollDebug buffer', () => {
  it('disabled by default does not record', () => {
    setScrollDebug(false)
    clearScrollDebugLog()
    scrollDebugLog('should-not-record', { note: 'secret-body' })
    assert.equal(getScrollDebugLog().length, 0)
  })

  it('records scalars, clear empties, export has scene and no payload body field', () => {
    setScrollDebug(true)
    clearScrollDebugLog()
    scrollDebugLog('agent-event', {
      trigger: 'text_delta',
      eventId: 'd1',
      contentLength: 12,
      assistantUiId: 'd1',
    })
    assert.equal(getScrollDebugLog().length, 1)
    const text = formatScrollDebugExport('T4')
    assert.match(text, /"scene": "T4"/)
    assert.match(text, /"app": "Lumen"/)
    assert.doesNotMatch(text, /secret/)
    clearScrollDebugLog()
    assert.equal(getScrollDebugLog().length, 0)
    setScrollDebug(false)
  })
})
