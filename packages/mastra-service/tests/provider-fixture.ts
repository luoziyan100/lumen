/**
 * [INPUT]: SDK 发出的真实 HTTP Request；用例提供 provider 线格式结果
 * [OUTPUT]: fixtureProvider / textReply / toolReply
 * [POS]: 唯一模型网络替换缝；Mastra 循环、工具、记忆与数据库均真实执行
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export interface ProviderRequest {
  model: string
  stream?: boolean
  messages: Array<{ role: string; content?: unknown; tool_call_id?: string }>
  tools?: Array<{ function: { name: string; parameters: unknown } }>
}
export interface Reply { content?: string; call?: { id: string; name: string; arguments: unknown } }
export const textReply = (content: string): Reply => ({ content })
export const toolReply = (name: string, args: unknown, id = 'call-1'): Reply => ({ call: { id, name, arguments: args } })

export function fixtureProvider(respond: (request: ProviderRequest, signal?: AbortSignal | null) => Reply | Promise<Reply>) {
  const requests: ProviderRequest[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const request: ProviderRequest = JSON.parse(String(init?.body))
    requests.push(request)
    const reply = await respond(request, init?.signal)
    const call = reply.call
    const message = { role: 'assistant', content: reply.content ?? null,
      ...(call ? { tool_calls: [{ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } }] } : {}),
    }
    const base = { id: 'fixture-response', created: 1, model: request.model }
    const finish_reason = call ? 'tool_calls' : 'stop'
    const usage = { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 }
    if (!request.stream) return Response.json({ ...base, object: 'chat.completion', choices: [{ index: 0, message, finish_reason }], usage })
    const delta = { role: 'assistant', content: reply.content ?? '',
      ...(call ? { tool_calls: [{ index: 0, ...message.tool_calls![0] }] } : {}),
    }
    const chunks = [
      { ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] },
      { ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason }], usage },
    ]
    return new Response(chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
  }
  return { fetch, requests }
}
