/**
 * [INPUT]: ask-user-tools 的 AskUserAnswer / AskUserWaiter / AskUserQuestion
 * [OUTPUT]: AskHub —— answerUser / makeAskUserWaiter / rejectPendingAsks
 * [POS]: runtime/ 的 ask_user 挂起表。key = taskId\\0toolCallId;cancel 时整 task 清挂起。
 *        不进 ToolContext;waiter 由 registry 构造注入。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type {
  AskUserAnswer,
  AskUserQuestion,
  AskUserWaiter,
} from '../tools/env/ask-user-tools.ts'

type PendingAsk = {
  resolve: (answer: AskUserAnswer) => void
  reject: (err: unknown) => void
}

export class AskHub {
  private readonly pending = new Map<string, PendingAsk>()

  private key(taskId: string, toolCallId: string): string {
    return `${taskId}\0${toolCallId}`
  }

  /** UI 经 answer_user 解开;无 pending 返回 false */
  answerUser(taskId: string, toolCallId: string, answer: AskUserAnswer): boolean {
    const key = this.key(taskId, toolCallId)
    const entry = this.pending.get(key)
    if (!entry) return false
    this.pending.delete(key)
    entry.resolve(answer)
    return true
  }

  rejectPendingAsks(taskId: string, err: unknown): void {
    const prefix = `${taskId}\0`
    for (const [key, entry] of this.pending) {
      if (!key.startsWith(prefix)) continue
      this.pending.delete(key)
      entry.reject(err)
    }
  }

  makeAskUserWaiter(taskId: string): AskUserWaiter {
    return (toolCallId: string, _questions: AskUserQuestion[], signal?: AbortSignal) => {
      return new Promise<AskUserAnswer>((resolve, reject) => {
        const key = this.key(taskId, toolCallId)
        const prev = this.pending.get(key)
        if (prev) {
          prev.reject(new Error('ask_user replaced by a newer request with the same toolCallId'))
        }
        const onAbort = (): void => {
          if (!this.pending.has(key)) return
          this.pending.delete(key)
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        }
        if (signal?.aborted) {
          onAbort()
          return
        }
        this.pending.set(key, { resolve, reject })
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    }
  }
}
