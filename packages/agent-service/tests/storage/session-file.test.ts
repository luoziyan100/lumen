import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { appendSessionEntry, readSession } from '../../src/storage/session-file.ts'

async function tempDir(t: TestContext): Promise<string> {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-sess-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  return base
}

test('session jsonl append-only 往返', async (t) => {
  const dir = await tempDir(t)
  const taskId = 'task-1'
  appendSessionEntry(dir, { type: 'session_start', task_id: taskId, timestamp: 't0', user_text: '今天有什么论文', project_id: 'p' })
  appendSessionEntry(dir, { type: 'user', task_id: taskId, timestamp: 't1', content: '今天有什么论文' })
  appendSessionEntry(dir, { type: 'assistant', task_id: taskId, timestamp: 't2', content: '我先检索', tool_calls: [{ name: 'search' }] })
  appendSessionEntry(dir, { type: 'tool_result', task_id: taskId, timestamp: 't3', tool_call_id: 'c1', tool: 'search', content: 'RESULT' })
  appendSessionEntry(dir, { type: 'session_end', task_id: taskId, timestamp: 't4', status: 'done', duration_ms: 1234 })

  const entries = readSession(dir, taskId)
  assert.equal(entries.length, 5)
  assert.equal(entries[0].type, 'session_start')
  assert.equal(entries[3].type, 'tool_result')
  assert.equal((entries[3] as { content: string }).content, 'RESULT')
  assert.equal(entries[4].type, 'session_end')
})

test('readSession 对不存在的会话返回空', async (t) => {
  const dir = await tempDir(t)
  assert.deepEqual(readSession(dir, 'nope'), [])
})
