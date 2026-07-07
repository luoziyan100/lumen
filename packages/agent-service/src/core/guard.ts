/**
 * [OUTPUT]: withGuard —— 给任意 Tool 套一层派发守卫:超时兜底 + 遥测钩子。
 * [POS]: 内核横切(§5.1)。工具各自有输出上限、错误即 llmContent(loop 也兜底捕获抛出);
 *        但**没有统一超时**——网络工具(http 只认外部 signal、无自身超时)一旦挂起,会阻塞
 *        串行的 runAgent 循环直到用户取消。此守卫补上兜底超时,并顺带产出每次调用的遥测。
 * 语义:
 *   - 超时 → abort 子 signal(给守约工具收尾机会)+ 返回 error llmContent(data.timedOut),**不抛**。
 *   - 取消(父 signal 触发 / 工具抛 AbortError)→ 照旧上抛,交 loop 认作 aborted。
 *   - 工具抛非取消错误 → 收成 error llmContent(与 loop 的 recovery 一致,但更早、可遥测)。
 *   - spawn 不在此列(它在 runtime 单独加、且长耗时合理),故只包 mainTools 里的叶子工具。
 */
import type { Tool, ToolContext, ToolResult } from './tool.ts'

/** 兜底超时:只抓真挂起。run_code 自限 ≤120s,故须更高;网络类正常 <30s 完成 */
export const DEFAULT_TOOL_TIMEOUT_MS = 150_000

export interface ToolTelemetry {
  name: string
  ms: number
  ok: boolean
  timedOut: boolean
  bytes: number
}

export interface GuardOptions {
  timeoutMs?: number
  onTelemetry?: (t: ToolTelemetry) => void
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function withGuard(tool: Tool, opts: GuardOptions = {}): Tool {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS
  return {
    spec: tool.spec,
    run: async (args: Record<string, unknown>, ctx: ToolContext, signal?: AbortSignal): Promise<ToolResult> => {
      const startedAt = Date.now()
      const ac = new AbortController()
      const onParentAbort = (): void => ac.abort()
      if (signal) {
        if (signal.aborted) ac.abort()
        else signal.addEventListener('abort', onParentAbort, { once: true })
      }

      let timer: ReturnType<typeof setTimeout> | undefined
      let timedOut = false
      let ok = true
      let result: ToolResult
      try {
        result = await new Promise<ToolResult>((resolve, reject) => {
          timer = setTimeout(() => {
            timedOut = true
            ac.abort() // 给守约工具收尾机会
            resolve({
              llmContent: `error: 工具「${tool.spec.name}」超时(${Math.round(timeoutMs / 1000)}s)已中止;可缩小范围重试或换工具。`,
              data: { timedOut: true },
            })
          }, timeoutMs)
          // tool 的后到 reject 命中此处理器(即便 promise 已因超时 settle,也不产生 unhandledRejection)
          tool.run(args, ctx, ac.signal).then(resolve, reject)
        })
      } catch (error) {
        if (isAbort(error)) throw error // 取消照旧上抛,loop 认作 aborted
        ok = false
        result = { llmContent: `error: ${error instanceof Error ? error.message : String(error)}` }
      } finally {
        if (timer) clearTimeout(timer)
        signal?.removeEventListener('abort', onParentAbort)
      }

      opts.onTelemetry?.({
        name: tool.spec.name,
        ms: Date.now() - startedAt,
        ok: ok && !timedOut,
        timedOut,
        bytes: result.llmContent.length,
      })
      return result
    },
  }
}
