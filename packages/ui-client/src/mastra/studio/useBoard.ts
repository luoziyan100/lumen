/**
 * [INPUT]: LumenApi 的白板列表与带 ETag 的白板读取、外部刷新信号（对话里白板工具写完）、运行状态
 * [OUTPUT]: useBoard：当前主题的白板张、选中那张的视图、进行中那张的 id、＋ 新开一张、刷新与错误
 * [POS]: 白板刷新不建第二套事件协议：工具完成信号触发重取，运行中再按 ETag 每 5 秒兜底（plan §6）
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LumenApi, Sheet, SheetView } from '../data/client.ts'

export interface BoardState {
  sheets: Sheet[]
  writable: string | null
  selected: string | null
  view: SheetView | null
  error: string
  select: (sheetId: string) => void
  createSheet: () => Promise<void>
  refresh: () => void
}

export function useBoard(api: LumenApi, topicId: string | null, signal: string, live: boolean): BoardState {
  const [sheets, setSheets] = useState<Sheet[]>([]), [writable, setWritable] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null), [view, setView] = useState<SheetView | null>(null)
  const [error, setError] = useState(''), [tick, setTick] = useState(0)
  const etag = useRef<{ sheet: string; etag: string | null } | null>(null)
  const pinned = useRef(false)
  const refresh = useCallback(() => setTick(value => value + 1), [])

  // ---- 换主题：清空，默认选进行中的那张 ----
  useEffect(() => { setSheets([]); setWritable(null); setSelected(null); setView(null); setError(''); etag.current = null; pinned.current = false }, [api, topicId])

  useEffect(() => {
    if (!topicId) return
    let active = true
    void api.sheets(topicId).then(result => {
      if (!active) return
      setSheets(result.items); setWritable(result.writable)
      setSelected(previous => pinned.current && previous && result.items.some(sheet => sheet.id === previous) ? previous : result.writable ?? result.items.at(-1)?.id ?? null)
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)) })
    return () => { active = false }
  }, [api, topicId, signal, tick])

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
    sheets, writable, selected, view: view?.sheet.id === selected ? view : null, error, refresh,
    select(sheetId) { pinned.current = true; setSelected(sheetId) },
    async createSheet() {
      if (!topicId) return
      try { const sheet = await api.createSheet(topicId); pinned.current = false; setSelected(sheet.id); refresh() }
      catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    },
  }
}
