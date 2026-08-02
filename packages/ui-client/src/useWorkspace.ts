/**
 * [INPUT]: AgentClient.listAssets/readAsset;projectId + taskId
 * [OUTPUT]: useWorkspace → assets(含 shared+session scope)/open/refresh
 * [POS]: 工作区轨与阅读器的数据源;无会话时仍可刷 shared(若服务端允许)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 刷新时机:会话就绪/切换 + 每次 reply + 手动。
 */
import { useCallback, useEffect, useState } from 'react'
import type { AgentClient, Asset } from './agent-client'

export type OpenAsset = { kind: 'pdf' | 'doc' | 'html'; path: string; name: string; content?: string }

export function useWorkspace(client: AgentClient, projectId: string, taskId: string | null, connected: boolean) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [open, setOpen] = useState<OpenAsset | null>(null)

  /** tid 覆写:刚建的草稿会话上传完立刻刷——state 里的 taskId 此时可能还没切过去 */
  const refresh = useCallback((tid: string | null = taskId) => {
    // 无会话也 list(仅 shared);有会话则 shared+session
    client.listAssets(projectId, tid ?? undefined).then(setAssets).catch(() => setAssets([]))
  }, [client, projectId, taskId])

  useEffect(() => {
    if (!connected) { setAssets([]); return }
    refresh()
    setOpen(null) // 切会话时收起阅读器,避免展示上个会话的文件
    const off = client.onEvent((e) => { if (e.kind === 'reply') refresh() })
    return off
  }, [client, connected, refresh])

  async function openAsset(a: Asset): Promise<void> {
    if (a.kind === 'pdf') setOpen({ kind: 'pdf', path: a.path, name: a.name })
    else if (a.kind === 'doc') setOpen({ kind: 'doc', path: a.path, name: a.name, content: await client.readAsset(projectId, a.path, taskId ?? undefined) })
    else if (a.kind === 'html') setOpen({ kind: 'html', path: a.path, name: a.name, content: await client.readAsset(projectId, a.path, taskId ?? undefined) })
    // image / file:v1 仅陈列,不进阅读器
  }
  function close(): void { setOpen(null) }

  return { assets, refresh, open, openAsset, close }
}
