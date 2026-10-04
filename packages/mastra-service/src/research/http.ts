/**
 * [INPUT]: Fetch 网络能力与调用取消信号
 * [OUTPUT]: researchHttp：有界字节响应，GET 退避重试
 * [POS]: 研究网络唯一入口，不携带模型凭证，不重试 POST 或已取消请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { setTimeout } from 'node:timers/promises'

const MAX_BYTES = 25 * 1024 * 1024
const RETRYABLE = new Set([429, 500, 502, 503, 504])

async function readBounded(response: Response): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) {
    await response.body?.cancel()
    throw new Error('Research response exceeds 25 MB')
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_BYTES) throw new Error('Research response exceeds 25 MB')
      chunks.push(chunk.value)
    }
  } finally { await reader.cancel(); reader.releaseLock() }
  return Buffer.concat(chunks)
}

export function researchHttp(fetchImpl: typeof fetch = fetch) {
  return async (source: string, init: RequestInit = {}) => {
    const url = new URL(source)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Expected an HTTP(S) URL without credentials')
    const signal = AbortSignal.any([AbortSignal.timeout(30000), ...(init.signal ? [init.signal] : [])])
    const attempts = !init.method || init.method === 'GET' ? 3 : 1
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted()
      const response = await fetchImpl(url, { ...init, headers: { 'user-agent': 'Lumen Research', ...init.headers }, signal }).catch(() => {
        signal.throwIfAborted()
        throw new Error('Research network request failed')
      })
      if (RETRYABLE.has(response.status) && attempt + 1 < attempts) {
        await response.body?.cancel()
        await setTimeout(300 * 2 ** attempt, undefined, { signal })
        continue
      }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`Research request failed: HTTP ${response.status}`) }
      return { bytes: await readBounded(response), contentType: response.headers.get('content-type') ?? '', url: response.url || source }
    }
  }
}
export type ResearchHttp = ReturnType<typeof researchHttp>
