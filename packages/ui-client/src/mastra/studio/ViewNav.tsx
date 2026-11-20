/**
 * [INPUT]: the view names of i18n studio.views, this file's VIEWS/VIEW_AVAILABLE (reading, board and takeaways open), the six view icons (16, currentColor); icon-only tabs carry `title` for components/Tips
 * [OUTPUT]: ViewNav: the center header's main navigation (Reading · Board · Takeaways · Concept map · Ideas · All), icon left, text right; icons alone when narrow (aria-label always,
 *           a `title` on each tab only when compact, shown by the app's tooltip layer); navFits: does the full navigation fit when centered with equal room reserved for the pane toggles
 * [POS]: part of StudioApp's center header; the full width is measured by an invisible twin navigation (same header, same styles), so toggling compact never jitters
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useLayoutEffect, useRef, useState } from 'react'
import type { Icon } from '@phosphor-icons/react'
import { AllViewIcon, BoardViewIcon, IdeasViewIcon, MapViewIcon, ReadingViewIcon, SettledViewIcon } from '../../components/icons'
import { useT } from '../../i18n/index.ts'

export const VIEWS = ['reading', 'board', 'settled', 'map', 'ideas', 'all'] as const
export type View = typeof VIEWS[number]
/** Reading, board and takeaways are open; the rest are honest placeholders */
export const VIEW_AVAILABLE: Record<View, boolean> = { reading: true, board: true, settled: true, map: false, ideas: false, all: false }
export const VIEW_ICONS: Record<View, Icon> = { reading: ReadingViewIcon, board: BoardViewIcon, settled: SettledViewIcon, map: MapViewIcon, ideas: IdeasViewIcon, all: AllViewIcon }
/** Well inside the 600ms in which a name must appear; the provider makes neighbouring tabs open at once */
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
    // Icon-only tabs name themselves through `title`, which the app's one tooltip layer (components/Tips) shows.
    // Only the attribute toggles as `compact` flips; the tab element itself never changes (swapping it made WebKit report a ResizeObserver loop on load)
    return <button type="button" key={key} {...(ghost ? { tabIndex: -1 } : { role: 'tab', 'aria-selected': view === key, 'aria-label': label, title: compact ? label : undefined })}
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
    // A zero-width header (the board pane is display:none under a full reader) means no layout happened — keep the previous state
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
