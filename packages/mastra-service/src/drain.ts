/**
 * [INPUT]: Mastra Agent 的公开 stream/resumeStream、受信 Controller 身份与输出完成 Promise
 * [OUTPUT]: trackAgentDrain：按 resourceId 或整个进程等待模型输出完成持久化
 * [POS]: 生命周期兼容边界；Controller 的取消通知早于输出处理结束，不能据此关库
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { Agent } from '@mastra/core/agent'

export function trackAgentDrain(agent: Agent) {
  const pending = new Map<Promise<unknown>, string | undefined>()
  function track<T extends Agent['stream'] | Agent['resumeStream']>(method: T): T {
    return new Proxy(method, {
      apply(target, receiver, args) {
        const result = Reflect.apply(target, receiver, args)
        const finished = Promise.resolve(result).then(output => output.getFullOutput())
        const options = args[1] as { memory?: { resource?: string }; requestContext?: { get(key: string): unknown } } | undefined
        const owner = options?.requestContext?.get('controller') as { resourceId?: string } | undefined
        pending.set(finished, owner?.resourceId ?? options?.memory?.resource)
        void finished.finally(() => pending.delete(finished)).catch(() => {})
        return result
      },
    })
  }
  agent.stream = track(agent.stream)
  agent.resumeStream = track(agent.resumeStream)
  return async (resourceId?: string) => {
    for (;;) {
      const matching = [...pending].filter(([, owner]) => resourceId === undefined || owner === resourceId).map(([output]) => output)
      if (!matching.length) return
      await Promise.allSettled(matching)
    }
  }
}
