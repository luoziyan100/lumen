/**
 * [INPUT]: i18n studio.views 的视图名、本文件的 VIEWS/VIEW_AVAILABLE（哪几个视图已开放）、icons 的五个视图图标（16，currentColor）
 * [OUTPUT]: ViewNav：中栏头部的主导航（白板 · 沉淀 · 概念图 · 灵感 · 全部），图标在左、文字在右；放不下时只留图标（aria-label 恒在，紧凑时加 title）；
 *           navFits：按中线居中、两侧给展开按钮让出同样宽度时完整导航放不放得下
 * [POS]: StudioApp 中栏头部的一部分；完整宽度由一份不可见的同款导航量出（同一头部、同一套样式），所以切换紧凑不会来回抖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useLayoutEffect, useRef, useState } from 'react'
import type { Icon } from '@phosphor-icons/react'
import { AllViewIcon, BoardViewIcon, IdeasViewIcon, MapViewIcon, SettledViewIcon } from '../../components/icons'
import { useT } from '../../i18n/index.ts'

export const VIEWS = ['board', 'settled', 'map', 'ideas', 'all'] as const
export type View = typeof VIEWS[number]
/** P0 opens only the board; the rest are honest placeholders */
export const VIEW_AVAILABLE: Record<View, boolean> = { board: true, settled: false, map: false, ideas: false, all: false }
export const VIEW_ICONS: Record<View, Icon> = { board: BoardViewIcon, settled: SettledViewIcon, map: MapViewIcon, ideas: IdeasViewIcon, all: AllViewIcon }
/** 导航与两侧按钮之间至少留的空 */
const BREATH = 8

/** 导航按中线居中：两侧都要让出较宽那一侧按钮占的宽度 */
export function navFits(head: number, nav: number, reserve: number) {
  return nav + 2 * (reserve + BREATH) <= head
}

/** 头部里展开按钮从较近一侧边缘起占去的宽度（没有按钮为 0） */
function edgeReserve(head: HTMLElement) {
  const width = head.clientWidth
  return [...head.querySelectorAll<HTMLElement>(':scope > .pane-toggle')].reduce((most, toggle) => {
    const left = toggle.offsetLeft, right = left + toggle.offsetWidth
    return Math.max(most, left + toggle.offsetWidth / 2 < width / 2 ? right : width - left)
  }, 0)
}

function Tabs({ view, onView, compact, ghost }: { view: View; onView?: (view: View) => void; compact?: boolean; ghost?: boolean }) {
  const S = useT().studio
  return VIEWS.map(key => {
    const Glyph = VIEW_ICONS[key], label = S.views[key], available = VIEW_AVAILABLE[key]
    return <button type="button" key={key} {...(ghost ? { tabIndex: -1 } : { role: 'tab', 'aria-selected': view === key, 'aria-label': label })} title={compact ? label : undefined}
      className={view === key ? 'on' : undefined} data-available={available} onClick={ghost ? undefined : () => onView?.(key)}>
      <Glyph />{!compact && <span>{label}</span>}
    </button>
  })
}

export function ViewNav({ view, onView }: { view: View; onView: (view: View) => void }) {
  const nav = useRef<HTMLElement>(null), ghost = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  const S = useT().studio
  useLayoutEffect(() => {
    const head = nav.current?.parentElement, full = ghost.current
    if (!head || !full) return
    // 头部宽 0（铺满阅读器时白板段 display:none）就是没在排版，保持原样
    const measure = () => { if (head.clientWidth) setCompact(!navFits(head.clientWidth, full.offsetWidth, edgeReserve(head))) }
    measure()
    const resize = new ResizeObserver(measure), mutate = new MutationObserver(measure)
    resize.observe(head); resize.observe(full); mutate.observe(head, { childList: true })
    return () => { resize.disconnect(); mutate.disconnect() }
  }, [])
  return <>
    <nav ref={nav} className={`studio-seg studio-views${compact ? ' is-compact' : ''}`} role="tablist" aria-label={S.viewsNav}><Tabs view={view} onView={onView} compact={compact} /></nav>
    <div ref={ghost} className="studio-seg studio-views studio-views-ghost" aria-hidden inert><Tabs view={view} ghost /></div>
  </>
}
