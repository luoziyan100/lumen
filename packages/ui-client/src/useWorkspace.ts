/**
 * [INPUT]: AgentClient.listAssets/readAsset;projectId + taskId
 * [OUTPUT]: useWorkspace → assets/open/refresh/reloadOpen;切会话清 open;write/edit 命中 open.path 则重读
 * [POS]: 工作区轨与阅读器的数据源;无会话只刷 shared;切会话乐观清 session 防串味;
 *        reloadOpen 供 write/edit 后刷新当前打开内容(产物闭环 P0)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 刷新时机:会话就绪/切换 + 每次 reply + 手动 + write/edit 命中 open.path。
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
    client.listAssets(projectId, tid ?? undefined).then(setAssets).catch(() => setAssets([]))
  }, [client, projectId, taskId])

  useEffect(() => {
    if (!connected) {
      setAssets([])
      setOpen(null)
      return
    }
    setOpen(null)
    setAssets((prev) => (taskId ? prev : prev.filter(isSharedAsset)))
    refresh()
    const off = client.onEvent((e) => { if (e.kind === 'reply') refresh() })
    return off
  }, [client, connected, refresh, taskId])

  async function openAsset(a: Asset): Promise<void> {
    if (a.kind === 'pdf') setOpen({ kind: 'pdf', path: a.path, name: a.name })
    else if (a.kind === 'doc') setOpen({ kind: 'doc', path: a.path, name: a.name, content: await client.readAsset(projectId, a.path, taskId ?? undefined) })
    else if (a.kind === 'html') setOpen({ kind: 'html', path: a.path, name: a.name, content: await client.readAsset(projectId, a.path, taskId ?? undefined) })
  }
  function close(): void { setOpen(null) }

  /** 重读当前打开的文本/html(pdf 走 url 不缓存 content) */
  const reloadOpen = useCallback(async (): Promise<void> => {
    setOpen((cur) => {
      if (!cur) return cur
      if (cur.kind === 'pdf') return cur
      void client.readAsset(projectId, cur.path, taskId ?? undefined).then((content) => {
        setOpen((prev) => (prev && prev.path === cur.path && prev.kind === cur.kind
          ? { ...prev, content }
          : prev))
      }).catch(() => { /* 刷新失败保留旧内容 */ })
      return cur
    })
  }, [client, projectId, taskId])

  return { assets, refresh, open, openAsset, close, reloadOpen }
}
