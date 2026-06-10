/**
 * [INPUT]: claude.ts 的 ClaudeTransport / ClaudeRequest / ClaudeResponseBody
 * [OUTPUT]: createReplayTransport（重放）/ createRecordingTransport（录制）
 * [POS]: 验收基础设施。把网络字节录下/放回，但请求构造、响应解析、runAgent 全走真实路径
 *
 * 录制：用 createRecordingTransport 包住真实 fetch transport，跑一次真实任务，把 sink 写成 fixture。
 * 重放：用 createReplayTransport(fixture) 喂回内核——只有网络是替身，其余是真代码。
 */
import type { ClaudeRequest, ClaudeResponseBody, ClaudeTransport } from './claude.ts'

export interface ReplayTransport {
  transport: ClaudeTransport
  /** 内核经真实 buildClaudeRequest 发出的每个请求（按序），供断言 */
  requests: ClaudeRequest[]
}

export function createReplayTransport(bodies: ClaudeResponseBody[]): ReplayTransport {
  const requests: ClaudeRequest[] = []
  let index = 0
  const transport: ClaudeTransport = async (request) => {
    requests.push(request)
    const body = bodies[index]
    index += 1
    if (!body) throw new Error(`replay: 第 #${index} 次调用没有录制 body（录制只有 ${bodies.length} 条）`)
    return body
  }
  return { transport, requests }
}

export function createRecordingTransport(inner: ClaudeTransport, sink: ClaudeResponseBody[]): ClaudeTransport {
  return async (request, signal) => {
    const body = await inner(request, signal)
    sink.push(body)
    return body
  }
}
