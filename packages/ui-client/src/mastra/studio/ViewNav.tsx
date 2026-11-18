/**
 * [INPUT]: the view names of i18n studio.views, this file's VIEWS/VIEW_AVAILABLE (reading, board and takeaways open), the six view icons (16, currentColor), Kumo Tooltip
 * [OUTPUT]: ViewNav: the center header's main navigation (Reading · Board · Takeaways · Concept map · Ideas · All), icon left, text right; icons alone when narrow (aria-label always,
 *           a Kumo tooltip under each tab, enabled only when compact, on hover and focus); navFits: does the full navigation fit when centered with equal room reserved for the pane toggles
 * [POS]: part of StudioApp's center header; the full width is measured by an invisible twin navigation (same header, same styles), so toggling compact never jitters
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useLayoutEffect, useRef, useState } from 'react'
import type { Icon } from '@phosphor-icons/react'
import { AllViewIcon, BoardViewIcon, IdeasViewIcon, MapViewIcon, ReadingViewIcon, SettledViewIcon } from '../../components/icons'
import { Tooltip, TooltipProvider } from '@cloudflare/kumo/components/tooltip'
import { useT } from '../../i18n/index.ts'

export const VIEWS = ['reading', 'board', 'settled', 'map', 'ideas', 'all'] as const
export type View = typeof VIEWS[number]
/** Reading, board and takeaways are open; the rest are honest placeholders */
export const VIEW_AVAILABLE: Record<View, boolean> = { reading: true, board: true, settled: true, map: false, ideas: false, all: false }
export const VIEW_ICONS: Record<View, Icon> = { reading: ReadingViewIcon, board: BoardViewIcon, settled: SettledViewIcon, map: MapViewIcon, ideas: IdeasViewIcon, all: AllViewIcon }
/** Well inside the 600ms in which a name must appear; the provider makes neighbouring tabs open at once */
const TIP_DELAY = 250
/** At least this much air between the navigation and either toggle */
const BREATH = 8

/** The navigation centers: both sides yield the width of the wider toggle */
export function navFits(head: number, nav: number, reserve: number) {
  return nav + 2 * (reserve + BREATH) <= head
}

/** What the pane toggles claim from their nearer edge (0 when absent) */
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
    const tab = <button type="button" key={key} {...(ghost ? { tabIndex: -1 } : { role: 'tab', 'aria-selected': view === key, 'aria-label': label })}
      className={view === key ? 'on' : undefined} data-available={available} onClick={ghost ? undefined : () => onView?.(key)}>
      <Glyph />{!compact && <span>{label}</span>}
    </button>
    // The native title shows late and only sometimes in the desktop WKWebView, so icon-only tabs get a real tooltip (hover and keyboard focus).
    // The tooltip stays mounted and is only disabled while the labels show: swapping the tab's element as `compact` flips during the first layout
    // made WebKit report a ResizeObserver loop on every load (12 of 12; 0 of 12 with a stable tree)
    return ghost ? tab : <Tooltip key={key} content={label} side="bottom" delay={TIP_DELAY} disabled={!compact} render={tab} />
  })
}

export function ViewNav({ view, onView }: { view: View; onView: (view: View) => void }) {
  const nav = useRef<HTMLElement>(null), ghost = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  const S = useT().studio
  useLayoutEffect(() => {
    const head = nav.current?.parentElement, full = ghost.current
    if (!head || !full) return
    // A zero-width header (the board pane is display:none under a full reader) means no layout happened — keep the previous state
    const measure = () => { if (head.clientWidth) setCompact(!navFits(head.clientWidth, full.offsetWidth, edgeReserve(head))) }
    measure()
    const resize = new ResizeObserver(measure), mutate = new MutationObserver(measure)
    resize.observe(head); resize.observe(full); mutate.observe(head, { childList: true })
    return () => { resize.disconnect(); mutate.disconnect() }
  }, [])
  return <>
    <nav ref={nav} className={`studio-seg studio-views${compact ? ' is-compact' : ''}`} role="tablist" aria-label={S.viewsNav}><TooltipProvider delay={TIP_DELAY}><Tabs view={view} onView={onView} compact={compact} /></TooltipProvider></nav>
    <div ref={ghost} className="studio-seg studio-views studio-views-ghost" aria-hidden inert><Tabs view={view} ghost /></div>
  </>
}
