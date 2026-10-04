/**
 * [INPUT]: Mastra 公开 BackgroundTasksStorage，以及启动者已独占数据根的保证
 * [OUTPUT]: recoverInterruptedChildren：将无进程承接的 pending/running 子任务结算为失败
 * [POS]: 进程重启边界；持单实例锁且未接收任务时调用，不重放工具、不改会话与历史
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { BackgroundTasksStorage } from '@mastra/core/storage'

export const INTERRUPTED_CHILD_MESSAGE = 'Service interrupted before task completion; execution was not replayed.'

/** 数据行没有进程 owner 字段；只有已排除其他进程与本进程新任务后，才能判定这些行已失去 owner。 */
export async function recoverInterruptedChildren(storage: BackgroundTasksStorage, ownership: { exclusiveStartup: true }): Promise<number> {
  if (ownership.exclusiveStartup !== true) throw new Error('Interrupted task recovery requires exclusive startup ownership')
  let recovered = 0
  for (;;) {
    const { tasks } = await storage.listTasks({ status: ['pending', 'running'], page: 0, perPage: 100 })
    if (!tasks.length) return recovered
    for (const task of tasks) {
      const changed = await storage.updateTask(task.id, {
        status: 'failed', completedAt: new Date(), error: { message: INTERRUPTED_CHILD_MESSAGE },
      }, { expectedStatus: task.status })
      if (changed) recovered++
    }
  }
}
