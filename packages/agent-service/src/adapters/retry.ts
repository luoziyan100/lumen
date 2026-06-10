/**
 * [OUTPUT]: postJsonWithRetry / HttpStatusError —— 带单次超时与指数退避的 JSON POST
 * [POS]: adapters 网络缝的可靠性层（claude/openai transport 共用）
 *
 * 语义：
 * - 可重试：网络错误、单次尝试超时、408/429/5xx/529 —— 后台长任务不能被一次抖动杀死
 * - 不重试：其余 4xx（请求本身错，重试无意义）
 * - 调用方取消（signal）：立刻生效，不重试、不等退避
 */

export interface RetryOptions {
  /** 总尝试次数（含第一次）。默认 4 */
  maxAttempts?: number
  /** 退避基数（指数翻倍：base, 2base, 4base…）。默认 500ms */
  baseDelayMs?: number
  /** 单次尝试超时。默认 120s —— 防止一个挂死的请求把任务卡成永远 running */
  timeoutMs?: number
  /** 测试注入 */
  fetchImpl?: typeof fetch
}

export class HttpStatusError extends Error {
  readonly status: number

  constructor(status: number, body: string, label: string) {
    super(`${label} failed (${status}): ${body}`)
    this.name = 'HttpStatusError'
    this.status = status
  }
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529])

function abortError(): DOMException {
  return new DOMException('This operation was aborted', 'AbortError')
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function postJsonWithRetry(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  label: string,
  options: RetryOptions = {},
  signal?: AbortSignal,
): Promise<unknown> {
  const maxAttempts = options.maxAttempts ?? 4
  const baseDelayMs = options.baseDelayMs ?? 500
  const timeoutMs = options.timeoutMs ?? 120_000
  const doFetch = options.fetchImpl ?? fetch
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) throw abortError()
    const attemptSignal = AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(timeoutMs),
    ])
    try {
      const response = await doFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: attemptSignal,
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new HttpStatusError(response.status, text, label)
      }
      return await response.json()
    } catch (error) {
      if (signal?.aborted) throw error // 调用方取消：原样抛出（AbortError），不重试
      if (error instanceof HttpStatusError && !RETRYABLE_STATUS.has(error.status)) throw error
      lastError = error // 网络错 / 单次超时(TimeoutError) / 可重试状态码
    }
    if (attempt < maxAttempts - 1) await sleep(baseDelayMs * 2 ** attempt, signal)
  }
  throw lastError
}
