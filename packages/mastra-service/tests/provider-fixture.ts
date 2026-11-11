/**
 * [INPUT]: SDK 发出的真实 HTTP Request；用例提供 provider 线格式结果
 * [OUTPUT]: fixtureProvider / textReply / toolReply / toolsReply
 * [POS]: 唯一模型网络替换缝；Mastra 循环、工具、记忆与数据库均真实执行
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export interface ProviderRequest {
  model: string
  stream?: boolean
  messages: Array<{ role: string; content?: unknown; tool_call_id?: string; tool_calls?: Array<{ id: string; function: { name: string } }> }>
  tools?: Array<{ function: { name: string; parameters: unknown } }>
}
export interface Call { id: string; name: string; arguments: unknown }
export interface Reply { content?: string; call?: Call; calls?: Call[] }
export const textReply = (content: string): Reply => ({ content })
export const toolReply = (name: string, args: unknown, id = 'call-1'): Reply => ({ call: { id, name, arguments: args } })
export const toolsReply = (calls: Call[]): Reply => ({ calls })

export function fixtureProvider(respond: (request: ProviderRequest, signal?: AbortSignal | null) => Reply | Promise<Reply>) {
  const requests: ProviderRequest[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const request: ProviderRequest = JSON.parse(String(init?.body))
    requests.push(request)
    const reply = await respond(request, init?.signal)
    const calls = reply.calls ?? (reply.call ? [reply.call] : [])
    const toolCalls = calls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } }))
    const message = { role: 'assistant', content: reply.content ?? null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }
    const base = { id: 'fixture-response', created: 1, model: request.model }
    const finish_reason = toolCalls.length ? 'tool_calls' : 'stop'
    const usage = { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 }
    if (!request.stream) return Response.json({ ...base, object: 'chat.completion', choices: [{ index: 0, message, finish_reason }], usage })
    const delta = { role: 'assistant', content: reply.content ?? '',
      ...(toolCalls.length ? { tool_calls: toolCalls.map((call, index) => ({ index, ...call })) } : {}),
    }
    const chunks = [
      { ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] },
      { ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason }], usage },
    ]
    return new Response(chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
  }
  return { fetch, requests }
}
