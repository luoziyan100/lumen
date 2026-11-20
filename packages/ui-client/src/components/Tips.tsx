/**
 * [INPUT]: react-dom createPortal; Kumo's tooltip classes (generated from Kumo's own sources, so the look is Kumo's)
 * [OUTPUT]: Tips — the app's one tooltip layer: every element's `title` shows as a Kumo-styled tooltip
 * [POS]: mounted once by StudioApp. Components keep writing plain `title`; nothing else renders tooltips
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// ============================================================
//  Why one layer instead of a wrapper per element
// ------------------------------------------------------------
//  The desktop WKWebView draws `title` as a grey native box, late or not at all.
//  Here the pointer (or keyboard focus) finds the nearest element with a title,
//  the title moves to data-tip while it is shown — so the native box never
//  appears — and comes back when the tip hides. Markup stays plain `title`, so
//  screen readers, tests and every future button get the same tooltip for free.
// ============================================================

const DELAY = 250          // ms before the first tip, as the view tabs had
const GROUP = 400          // ms after a tip hides during which the next one shows at once
const GAP = 10             // px between the element and the tip (Kumo's sideOffset)
const EDGE = 8             // px kept from the viewport's edges
const SKIP = 'iframe, input, textarea, select, [contenteditable="true"]'  // their title is a name or a native hint, not a tip

interface Tip { el: HTMLElement; text: string }
interface Place { left: number; top: number; side: 'top' | 'bottom'; arrow: number }

/** The nearest element that carries a tip, from a point or a focused node */
function bearer(node: Element | null): HTMLElement | null {
  const el = node?.closest<HTMLElement>('[title], [data-tip]') ?? null
  if (!el || el.matches(SKIP) || el.closest('svg')) return null
  return (el.getAttribute('title') ?? el.dataset.tip) ? el : null
}

/** Take the title off the element (the native box must not appear) and return its text */
function borrow(el: HTMLElement) {
  const title = el.getAttribute('title')
  if (title !== null) { el.dataset.tip = title; el.removeAttribute('title') }
  return el.dataset.tip ?? ''
}

function giveBack(el: HTMLElement) {
  if (el.dataset.tip === undefined) return
  if (!el.hasAttribute('title')) el.setAttribute('title', el.dataset.tip)
  delete el.dataset.tip
}

export function Tips() {
  const [tip, setTip] = useState<Tip | null>(null)
  const [place, setPlace] = useState<Place | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let current: HTMLElement | null = null, timer = 0, frame = 0, lastHide = 0, x = 0, y = 0
    // React re-adds a title whose value changed (Copy → Copied): take it again and show the new text
    const watch = new MutationObserver(() => { if (current?.hasAttribute('title')) setTip({ el: current, text: borrow(current) }) })

    const hide = () => {
      clearTimeout(timer)
      if (current) { watch.disconnect(); giveBack(current); current = null; lastHide = Date.now() }
      setTip(null)
    }
    const aim = (el: HTMLElement | null, wait: number) => {
      if (el === current) return
      hide()
      if (!el) return
      current = el
      const text = borrow(el)
      watch.observe(el, { attributes: true, attributeFilter: ['title'] })
      const show = () => { if (current === el && el.isConnected) setTip({ el, text: el.dataset.tip ?? text }) }
      if (wait && Date.now() - lastHide > GROUP) timer = window.setTimeout(show, wait)
      else show()
    }
    // elementFromPoint also finds disabled buttons, which receive no pointer events of their own
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      x = e.clientX; y = e.clientY
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; aim(bearer(document.elementFromPoint(x, y)), DELAY) })
    }
    const onFocus = (e: FocusEvent) => {
      const el = e.target instanceof HTMLElement && e.target.matches(':focus-visible') ? bearer(e.target) : null
      if (el) aim(el, DELAY)
    }
    const onBlur = (e: FocusEvent) => { if (current && current.contains(e.target as Node)) hide() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    const onLeave = (e: PointerEvent) => { if (!e.relatedTarget) hide() }

    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('pointerout', onLeave)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onBlur)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      hide(); cancelAnimationFrame(frame); watch.disconnect()
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('pointerout', onLeave)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onBlur)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  // Below the element, centred; above it when there is no room below; always inside the viewport
  useLayoutEffect(() => {
    if (!tip || !box.current) { setPlace(null); return }
    const r = tip.el.getBoundingClientRect(), w = box.current.offsetWidth, h = box.current.offsetHeight
    const below = r.bottom + GAP + h <= window.innerHeight - EDGE || r.top - GAP - h < EDGE
    const centre = r.left + r.width / 2
    const left = Math.min(Math.max(centre - w / 2, EDGE), window.innerWidth - EDGE - w)
    setPlace({ left, top: below ? r.bottom + GAP : r.top - GAP - h, side: below ? 'bottom' : 'top', arrow: Math.min(Math.max(centre - left, 12), w - 12) })
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div ref={box} role="tooltip" className="lumen-tip" data-side={place?.side} data-shown={place ? '' : undefined}
      style={{ left: place?.left ?? -9999, top: place?.top ?? 0 }}>
      <div className="flex flex-col rounded-md bg-kumo-base px-2.5 py-1.5 text-sm text-kumo-default shadow-lg shadow-kumo-tip-shadow outline outline-kumo-fill kumo-tooltip-popup">
        <span className="lumen-tip-arrow" style={{ left: (place?.arrow ?? 0) - 10 }}><Arrow /></span>
        {tip.text}
      </div>
    </div>,
    document.body,
  )
}

/** Kumo's tooltip arrow, the same three paths and fills */
function Arrow() {
  return <svg width="20" height="10" viewBox="0 0 20 10" fill="none" aria-hidden>
    <path d="M9.66437 2.60207L4.80758 6.97318C4.07308 7.63423 3.11989 8 2.13172 8H0V10H20V8H18.5349C17.5468 8 16.5936 7.63423 15.8591 6.97318L11.0023 2.60207C10.622 2.2598 10.0447 2.25979 9.66437 2.60207Z" className="fill-kumo-base" />
    <path d="M8.99542 1.85876C9.75604 1.17425 10.9106 1.17422 11.6713 1.85878L16.5281 6.22989C17.0789 6.72568 17.7938 7.00001 18.5349 7.00001L15.89 7L11.0023 2.60207C10.622 2.2598 10.0447 2.2598 9.66436 2.60207L4.77734 7L2.13171 7.00001C2.87284 7.00001 3.58774 6.72568 4.13861 6.22989L8.99542 1.85876Z" className="fill-kumo-tip-shadow" />
    <path d="M10.3333 3.34539L5.47654 7.71648C4.55842 8.54279 3.36693 9 2.13172 9H0V8H2.13172C3.11989 8 4.07308 7.63423 4.80758 6.97318L9.66437 2.60207C10.0447 2.25979 10.622 2.2598 11.0023 2.60207L15.8591 6.97318C16.5936 7.63423 17.5468 8 18.5349 8H20V9H18.5349C17.2998 9 16.1083 8.54278 15.1901 7.71648L10.3333 3.34539Z" className="fill-kumo-tip-stroke" />
  </svg>
}
