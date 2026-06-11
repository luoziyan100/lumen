/**
 * useWorkspace —— 工作区资产(论文 PDF + 生成 .md)+ 当前打开的资产(驱动阅读器)。
 * 刷新时机:连上后初次 + 每次 reply(模型可能写了文件)+ 手动。
 */
import { useCallback, useEffect, useState } from 'react'
import type { AgentClient, Asset } from './agent-client'

export type OpenAsset = { kind: 'pdf' | 'doc'; path: string; name: string; content?: string }

export function useWorkspace(client: AgentClient, projectId: string, connected: boolean) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [open, setOpen] = useState<OpenAsset | null>(null)

  const refresh = useCallback(() => {
    client.listAssets(projectId).then(setAssets).catch(() => {})
  }, [client, projectId])

  useEffect(() => {
    if (!connected) return
    refresh()
    const off = client.onEvent((e) => { if (e.kind === 'reply') refresh() })
    return off
  }, [client, connected, refresh])

  async function openAsset(a: Asset): Promise<void> {
    if (a.kind === 'pdf') setOpen({ kind: 'pdf', path: a.path, name: a.name })
    else setOpen({ kind: 'doc', path: a.path, name: a.name, content: await client.readAsset(projectId, a.path) })
  }
  function close(): void { setOpen(null) }

  return { assets, refresh, open, openAsset, close }
}
