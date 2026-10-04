/**
 * [INPUT]: 受控文件列表与原生 snapshot API、当前会话身份
 * [OUTPUT]: useWorkspace：独立于右轨可见性的产物目录、原生任务投影及首次出现通知
 * [POS]: 不复制消息；跳过内部目录，串行遍历文件夹，渲染时按身份与连接投影，隔离切换首帧和晚到响应；空闲目录每分钟刷新，运行中每五秒刷新
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DisplayState, Identity, LumenApi } from '../../data/client'
export interface WorkspaceAsset { name: string; path: string; scope: 'task' | 'shared' }
export interface WorkspaceState { assets: WorkspaceAsset[]; display: DisplayState | null; loading: boolean; error: string; revealVersion: number; refresh: () => void }
const internal = /^(?:\.|workers?$|agents?$|experts?$|specialists?$|node_modules$|__pycache__$|memory$|skills$)/i
const deliverable = /\.(?:pdf|md|markdown|html?|txt|csv|json|png|jpe?g|webp|gif|svg|docx?|xlsx?|pptx?|tex|bib|zip)$/i
export async function workspaceAssets(api: LumenApi, identity: Identity, active = () => true) {
  const files: WorkspaceAsset[] = []
  for (const scope of ['shared', 'task'] as const) {
    const folders = ['.']
    while (folders.length && active()) {
      const folder = folders.shift()!
      const { entries } = await api.assets(identity, folder, scope)
      for (const entry of entries) {
        if (internal.test(entry.name)) continue
        const path = folder === '.' ? entry.name : `${folder}/${entry.name}`
        if (entry.type === 'directory') folders.push(path)
        else if (deliverable.test(entry.name)) files.push({ name: entry.name, path, scope })
      }
    }
  }
  return files
}
export function useWorkspace(api: LumenApi, identity: Identity | null, revision: number): WorkspaceState {
  const key = identity ? `${identity.projectId}:${identity.taskId}` : ''
  const [state, setState] = useState<Omit<WorkspaceState, 'refresh'> & { owner: string; api: LumenApi }>({ owner: key, api, assets: [], display: null, loading: !!identity, error: '', revealVersion: 0 })
  const [refreshVersion, setRefreshVersion] = useState(0)
  const refresh = useCallback(() => setRefreshVersion(value => value + 1), [])
  const seen = useRef(new Set<string>()), owner = useRef<{ key: string; api: LumenApi } | null>(null)
  useEffect(() => {
    let active = true, pending = false, scannedAt = 0, wasRunning = false
    if (owner.current?.key !== key || owner.current.api !== api) { owner.current = { key, api }; seen.current = new Set(); setState(value => ({ ...value, owner: key, api, assets: [], display: null, error: '', loading: !!identity })) }
    if (!identity) return
    const load = async () => {
      if (pending) return
      pending = true
      try {
        const snapshot = await api.snapshot(identity).catch(() => null)
        if (!active) return
        const running = snapshot?.displayState.isRunning === true
        const scan = !scannedAt || running || wasRunning || Date.now() - scannedAt >= 60_000
        wasRunning = running
        if (!scan) { setState(value => ({ ...value, display: snapshot?.displayState ?? null })); return }
        const assets = await workspaceAssets(api, identity, () => active)
        if (!active) return
        scannedAt = Date.now()
        const added = assets.some(file => !seen.current.has(`${file.scope}:${file.path}`))
        assets.forEach(file => seen.current.add(`${file.scope}:${file.path}`))
        setState(value => ({ owner: key, api, assets, display: snapshot?.displayState ?? null, loading: false, error: '', revealVersion: value.revealVersion + Number(added) }))
      } catch (error) { if (active) setState(value => ({ ...value, loading: false, error: String(error) })) }
      finally { pending = false }
    }
    void load(); const timer = window.setInterval(() => void load(), 5000)
    return () => { active = false; clearInterval(timer) }
  }, [api, identity?.projectId, identity?.taskId, revision, refreshVersion])
  if (state.owner !== key || state.api !== api) return { assets: [], display: null, loading: !!identity, error: '', revealVersion: state.revealVersion, refresh }
  return { ...state, refresh }
}
