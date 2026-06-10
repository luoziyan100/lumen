/**
 * [OUTPUT]: HttpClient / HttpResponse / fetchHttp —— 可注入的 HTTP 客户端
 * [POS]: §5.3 研究桥接的网络缝。生产用 fetch；测试注入罐装响应（与 adapter 的 transport 同思路）
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

export function fetchHttp(): HttpClient {
  return async (url, init) => {
    const response = await fetch(url, {
      method: init?.method,
      headers: init?.headers,
      body: init?.body,
      signal: init?.signal,
    })
    return {
      status: response.status,
      ok: response.ok,
      text: () => response.text(),
      json: () => response.json(),
      bytes: async () => new Uint8Array(await response.arrayBuffer()),
    }
  }
}
