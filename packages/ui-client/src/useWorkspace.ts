/**
 * [INPUT]: AgentClient.listAssets/readAsset;projectId + taskId
 * [OUTPUT]: useWorkspace → assets(含 shared+session scope)/open/refresh
 * [POS]: 工作区轨与阅读器的数据源;无会话只刷 shared(本会话空);切会话乐观清 session 防串味
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 刷新时机:会话就绪/切换 + 每次 reply + 手动。
 */
import { useCallback, useEffect, useState } from 'react'
import type { AgentClient, Asset } from './agent-client'

export type OpenAsset = { kind: 'pdf' | 'doc' | 'html'; path: string; name: string; content?: string }

function isSharedAsset(a: Asset): boolean {
  return a.scope === 'shared' || a.path.startsWith('shared/')
}

export function useWorkspace(client: AgentClient, projectId: string, taskId: string | null, connected: boolean) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [open, setOpen] = useState<OpenAsset | null>(null)

  /** tid 覆写:刚建的草稿会话上传完立刻刷——state 里的 taskId 此时可能还没切过去 */
  const refresh = useCallback((tid: string | null = taskId) => {
    // 无会话 → 仅 shared;有会话 → shared+session(服务端契约)
    client.listAssets(projectId, tid ?? undefined).then(setAssets).catch(() => setAssets([]))
  }, [client, projectId, taskId])

  useEffect(() => {
    if (!connected) {
      setAssets([])
      setOpen(null)
      return
    }
    setOpen(null)
    // 切到新对话:立刻丢掉上一会话的 session 文件,避免等 list 返回前串味
    setAssets((prev) => (taskId ? prev : prev.filter(isSharedAsset)))
    refresh()
    const off = client.onEvent((e) => { if (e.kind === 'reply') refresh() })
    return off
  }, [client, connected, refresh, taskId])

  async function openAsset(a: Asset): Promise<void> {
    if (a.kind === 'pdf') setOpen({ kind: 'pdf', path: a.path, name: a.name })
    else if (a.kind === 'doc') setOpen({ kind: 'doc', path: a.path, name: a.name, content: await client.readAsset(projectId, a.path, taskId ?? undefined) })
    else if (a.kind === 'html') setOpen({ kind: 'html', path: a.path, name: a.name, content: await client.readAsset(projectId, a.path, taskId ?? undefined) })
    // image / file:v1 仅陈列,不进阅读器
  }
  function close(): void { setOpen(null) }

  return { assets, refresh, open, openAsset, close }
}
