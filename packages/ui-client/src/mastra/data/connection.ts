/**
 * [INPUT]: Tauri 当前数据根的 Mastra discovery 刷新命令或浏览器开发入口，以及 Connection 的可用字段
 * [OUTPUT]: refreshConnection、retryConnection、keepLiveConnection
 * [POS]: 服务重启后更新 token 的唯一 UI 入口；已打开工作台时忽略随后的发现失败，不启动旧服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { invoke, isTauri } from '@tauri-apps/api/core'
import type { Connection } from './client.ts'

function usable(connection: Connection) {
  return Boolean(connection.baseUrl && connection.token && !connection.error)
}

/** 冷启动失败仍交给错误页。已经拿到地址和令牌后，探测失败保留这次连接。成功的新发现照常替换。 */
export function keepLiveConnection(current: Connection, incoming: Connection): Connection {
  return usable(incoming) || !usable(current) ? incoming : current
}

export async function refreshConnection() {
  if (isTauri()) await invoke('refresh_mastra_connection')
  else window.location.reload()
}

// 恢复只重新发现/订阅；后端研究生命周期保持独立。
export function retryConnection(attempt: () => Promise<unknown> = refreshConnection) {
  if (!isTauri()) return () => {} // 浏览器开发入口仅手动重载，避免页面刷新重置重试预算。
  let cancelled = false, attempts = 0
  let timer: ReturnType<typeof setTimeout>
  const schedule = () => {
    if (cancelled || attempts >= 8) return
    timer = setTimeout(() => {
      attempts++
      void attempt().catch(() => {}).finally(schedule)
    }, Math.min(1000 * 2 ** attempts, 30000))
  }
  schedule()
  return () => { cancelled = true; clearTimeout(timer) }
}
