/**
 * [OUTPUT]: HttpClient / HttpResponse / fetchHttp —— 可注入的 HTTP 客户端(带退避重试 + UA)
 * [POS]: §5.3 研究桥接的网络缝。生产用 fetch;测试注入 fetchImpl / 罐装响应
 *
 * 退避重试:429/5xx/网络错自动重试(研究工具普遍撞 S2 等的 429 限流——这是止血)。
 * 默认带 User-Agent(很多站点挡无 UA 的请求,导致 403)。调用方取消(signal)立即生效。
 */
export interface HttpResponse {
  status: number
  ok: boolean
  text(): Promise<string>
  json(): Promise<unknown>
  bytes(): Promise<Uint8Array>
}

export interface HttpInit {
  method?: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
}

export type HttpClient = (url: string, init?: HttpInit) => Promise<HttpResponse>

export interface FetchHttpOptions {
  maxAttempts?: number
  baseDelayMs?: number
  userAgent?: string
  fetchImpl?: typeof fetch // 测试注入
}

const RETRYABLE = new Set([429, 500, 502, 503, 504])
const DEFAULT_UA = 'Lumen/0.1 (research agent; mailto:research@lumen.local)'

function abortError(): DOMException {
  return new DOMException('This operation was aborted', 'AbortError')
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const onAbort = (): void => { clearTimeout(timer); reject(abortError()) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function wrap(response: Response): HttpResponse {
  return {
    status: response.status,
    ok: response.ok,
    text: () => response.text(),
    json: () => response.json(),
    bytes: async () => new Uint8Array(await response.arrayBuffer()),
  }
}

export function fetchHttp(opts: FetchHttpOptions = {}): HttpClient {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 4)
  const baseDelayMs = opts.baseDelayMs ?? 600
  const ua = opts.userAgent ?? DEFAULT_UA
  const doFetch = opts.fetchImpl ?? fetch

  return async (url, init) => {
    let lastError: unknown
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (init?.signal?.aborted) throw abortError()
      try {
        const response = await doFetch(url, {
          method: init?.method,
          headers: { 'user-agent': ua, ...init?.headers },
          body: init?.body,
          signal: init?.signal,
        })
        // 可重试状态码:退避后再来(最后一次尝试则原样返回,交给调用方处理)
        if (RETRYABLE.has(response.status) && attempt < maxAttempts - 1) {
          await sleep(baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 200), init?.signal)
          continue
        }
        return wrap(response)
      } catch (error) {
        if (init?.signal?.aborted) throw error // 取消:不重试
        lastError = error
        if (attempt >= maxAttempts - 1) throw error
        await sleep(baseDelayMs * 2 ** attempt, init?.signal)
      }
    }
    throw lastError
  }
}
