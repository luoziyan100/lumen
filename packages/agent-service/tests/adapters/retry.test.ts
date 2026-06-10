import { test } from 'node:test'
import assert from 'node:assert/strict'
import { postJsonWithRetry, HttpStatusError } from '../../src/adapters/retry.ts'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('重试：529 两次后成功，共 3 次尝试', async () => {
  let calls = 0
  const fetchImpl: typeof fetch = async () => {
    calls += 1
    return calls < 3 ? jsonResponse(529, { error: 'overloaded' }) : jsonResponse(200, { ok: true })
  }
  const result = await postJsonWithRetry('http://x/', {}, {}, 'test', { fetchImpl, baseDelayMs: 1 })
  assert.deepEqual(result, { ok: true })
  assert.equal(calls, 3)
})

test('不重试：400 业务错误直接抛出，只尝试 1 次', async () => {
  let calls = 0
  const fetchImpl: typeof fetch = async () => {
    calls += 1
    return jsonResponse(400, { error: 'bad request' })
  }
  await assert.rejects(
    postJsonWithRetry('http://x/', {}, {}, 'test', { fetchImpl, baseDelayMs: 1 }),
    (error: unknown) => error instanceof HttpStatusError && error.status === 400,
  )
  assert.equal(calls, 1)
})

test('调用方取消：立即生效，不重试', async () => {
  let calls = 0
  const controller = new AbortController()
  const fetchImpl: typeof fetch = (_url, init) => {
    calls += 1
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    })
  }
  const pending = postJsonWithRetry('http://x/', {}, {}, 'test', { fetchImpl, baseDelayMs: 1 }, controller.signal)
  setTimeout(() => controller.abort(), 10)
  await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === 'AbortError')
  assert.equal(calls, 1, '取消后不得再尝试')
})

test('单次超时可重试：挂死的请求被超时打断并重试，次数耗尽后抛出', async () => {
  let calls = 0
  const fetchImpl: typeof fetch = (_url, init) => {
    calls += 1
    return new Promise((_resolve, reject) => {
      // 模拟挂死：永不返回，只响应（超时触发的）abort
      init?.signal?.addEventListener('abort', () => reject((init.signal as AbortSignal).reason as Error), { once: true })
    })
  }
  await assert.rejects(
    postJsonWithRetry('http://x/', {}, {}, 'test', { fetchImpl, baseDelayMs: 1, timeoutMs: 20, maxAttempts: 2 }),
  )
  assert.equal(calls, 2, '每次超时算一次尝试，重试到次数耗尽')
})
