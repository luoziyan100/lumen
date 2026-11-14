/**
 * [INPUT]: LumenApi 的白板列表（含选中与本轮写入目标）、记下选中、带 ETag 的白板读取、外部刷新信号（对话里白板工具写完）、运行状态
 * [OUTPUT]: useBoard：当前主题的白板张、选中那张的视图、进行中那张的 id、本轮写入目标、选中（记到服务端，R16；旧服务缺路由时只在本地切换，其它记录失败进 error 直到下次记下）、＋ 新开一张（即选中）、删除一张（R17：有内容先要确认，删的是选中的那张时跟随服务改选的相邻一张；旧服务如实提示不支持）、区块是否还在、刷新与错误
 * [POS]: 白板刷新不建第二套事件协议：工具完成信号触发重取，运行中再按 ETag 每 5 秒兜底（plan §6）；选中只经 Lumen 自己的 HTTP 记下，消息仍走原生发送
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LumenApi, Sheet, SheetDeletion, SheetList, SheetView } from '../data/client.ts'
import { t } from '../../i18n/index.ts'

export interface BoardState {
  sheets: Sheet[]
  writable: string | null
  selected: string | null
  /** The sheet the run in progress writes to (R16); null when no run holds one. */
  target: string | null
  view: SheetView | null
  error: string
  select: (sheetId: string) => void
  createSheet: () => Promise<void>
  /** R17: delete a sheet. Without `confirmed`, a sheet with blocks answers `confirm` (with the count) and nothing is deleted; null: it failed (see error). */
  remove: (sheetId: string, confirmed?: boolean) => Promise<SheetDeletion | null>
  /** Whether a block still exists (a conversation card may point into a deleted sheet); unknown when the service cannot tell. */
  locate: (blockId: string) => Promise<'found' | 'deleted' | 'unknown'>
  refresh: () => void
}

/** Which tab to show: the user's choice in this view, else the service's selection, else (older service) the newest live sheet. */
export function initialSelection(result: SheetList, previous: string | null, pinned: boolean): string | null {
  const exists = (id: string | null | undefined): id is string => !!id && result.items.some(sheet => sheet.id === id)
  if (pinned && exists(previous)) return previous
  if (exists(result.selected)) return result.selected
  return result.writable ?? result.items.at(-1)?.id ?? null
}

export function useBoard(api: LumenApi, topicId: string | null, signal: string, live: boolean): BoardState {
  const [sheets, setSheets] = useState<Sheet[]>([]), [writable, setWritable] = useState<string | null>(null), [target, setTarget] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null), [view, setView] = useState<SheetView | null>(null)
  const [error, setError] = useState(''), [tick, setTick] = useState(0)
  // A failed user action (storing a pick, deleting a sheet), kept apart from the read error, which every successful board read clears:
  // it stays until a later action succeeds
  const [actionError, setActionError] = useState('')
  const etag = useRef<{ sheet: string; etag: string | null } | null>(null)
  const pinned = useRef(false), pick = useRef(0)
  const refresh = useCallback(() => setTick(value => value + 1), [])

  // ---- 换主题：清空，打开时停在服务记下的选中 ----
  useEffect(() => { setSheets([]); setWritable(null); setTarget(null); setSelected(null); setView(null); setError(''); setActionError(''); etag.current = null; pinned.current = false; pick.current++ }, [api, topicId])

  // ---- 列表：信号与刷新时重取；运行中每 5 秒再取一次，本轮写入目标在开跑后才落定 ----
  useEffect(() => {
    if (!topicId) return
    let active = true
    const load = () => void api.sheets(topicId).then(result => {
      if (!active) return
      setSheets(result.items); setWritable(result.writable); setTarget(result.target ?? null)
      setSelected(previous => initialSelection(result, previous, pinned.current))
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)) })
    load()
    const timer = live ? window.setInterval(load, 5000) : undefined
    if (!live) setTarget(null)
    return () => { active = false; if (timer !== undefined) clearInterval(timer) }
  }, [api, topicId, signal, tick, live])

  useEffect(() => {
    if (!selected) { setView(null); return }
    let active = true, pending = false
    const read = async () => {
      if (pending) return
      pending = true
      try {
        const previous = etag.current?.sheet === selected ? etag.current.etag : null
        const result = await api.sheetVersion(selected, previous)
        if (!active) return
        etag.current = { sheet: selected, etag: result.etag }
        if (result.view) setView(result.view)
        setError('')
      } catch (error) { if (active) setError(error instanceof Error ? error.message : String(error)) }
      finally { pending = false }
    }
    void read()
    const timer = live ? window.setInterval(() => void read(), 5000) : undefined
    return () => { active = false; if (timer !== undefined) clearInterval(timer) }
  }, [api, selected, signal, tick, live])

  return {
    sheets, writable, selected, target, view: view?.sheet.id === selected ? view : null, error: actionError || error, refresh,
    select(sheetId) {
      pinned.current = true; setSelected(sheetId)
      if (!topicId) return
      // An older service has no selection route (selectSheet gives null): the tab still switches locally. Any other failure
      // means the tab shown and the sheet the AI will write to differ, so it is reported; only the latest pick counts.
      const mine = ++pick.current
      api.selectSheet(topicId, sheetId).then(() => { if (pick.current === mine) setActionError('') },
        error => { if (pick.current === mine) setActionError(t().studio.board.selectFailed + (error instanceof Error ? error.message : String(error))) })
    },
    async createSheet() {
      if (!topicId) return
      try { const sheet = await api.createSheet(topicId); pick.current++; setActionError(''); pinned.current = true; setSelected(sheet.id); refresh() }
      catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    },
    async remove(sheetId, confirmed = false) {
      if (!topicId) return null
      const mine = ++pick.current
      try {
        const result = await api.deleteSheet(topicId, sheetId, confirmed)
        if (result.kind === 'confirm') return result
        if (result.kind === 'unsupported') { if (pick.current === mine) setActionError(t().studio.board.removeUnsupported); return result }
        if (pick.current === mine) setActionError('')
        // ---- the service moved the selection to the neighbour when the deleted sheet was the selected one (R17); follow it at once ----
        setSheets(previous => previous.filter(sheet => sheet.id !== sheetId))
        setSelected(previous => previous === sheetId || previous === null ? result.selected : previous)
        pinned.current = true
        refresh()
        return result
      } catch (error) {
        if (pick.current === mine) setActionError(error instanceof Error ? error.message : String(error))
        return null
      }
    },
    async locate(blockId) {
      try { return (await api.blockSheet(blockId)).kind } catch { return 'unknown' }
    },
  }
}
