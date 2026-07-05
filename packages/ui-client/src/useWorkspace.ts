/**
 * useWorkspace —— 当前会话工作区的资产(会话独立目录,owner 拍板 2026-07-05)+ 当前打开的资产。
 * 刷新时机:会话就绪/切换 + 每次 reply(模型可能写了文件)+ 手动;无会话时为空。
 */
import { useCallback, useEffect, useState } from 'react'
import type { AgentClient, Asset } from './agent-client'

export type OpenAsset = { kind: 'pdf' | 'doc'; path: string; name: string; content?: string }

export function useWorkspace(client: AgentClient, projectId: string, taskId: string | null, connected: boolean) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [open, setOpen] = useState<OpenAsset | null>(null)

  const refresh = useCallback(() => {
    if (!taskId) { setAssets([]); return }
    client.listAssets(projectId, taskId).then(setAssets).catch(() => {})
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
    // image / file:v1 仅陈列,不进阅读器
  }
  function close(): void { setOpen(null) }

  return { assets, refresh, open, openAsset, close }
}
