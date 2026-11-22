/**
 * [INPUT]: the kit's BASE and every object's CSS (box, cabinet, typewriter, easel, press, cork board, lamp, type case) plus MUSIC_CSS of ./music/; the Motion type of ./music/pitch.ts;
 *          markup built by the caller from one of the builders
 * [OUTPUT]: IsoObject: a host that holds one object's SVG; click toggles data-open; a pointer that stays HOVER_CONFIRM (100 ms) sets data-hover, leaving clears it at once;
 *           `typing` sets the is-typing event class. When `onMotion` is given it hears every change of the host's state ({ hover, open, typing } and the host element), and null when
 *           the host unmounts. HOVER_CONFIRM
 * [POS]: the only React surface of studio/objects/. The markup is set once per data change and never on a state change: hover, open and typing move only the registered
 *        CSS variables. The host is decoration: aria-hidden, outside the tab order, never takes focus (mousedown keeps the focus where it was), and its SVG takes no pointer
 *        events, so only the host's own box answers a click. data-hover is the confirmed hover: the music set's motion and sound both start from it, so a pointer passing over
 *        an object moves and sounds nothing (the instrument set still moves on :hover). The shared sheet (both kits) is injected once per document
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { Motion } from './music/pitch.ts'
import { BASE } from './iso.ts'
import { BOX_CSS } from './box.ts'
import { CABINET_CSS } from './cabinet.ts'
import { TYPEWRITER_CSS } from './typewriter.ts'
import { EASEL_CSS } from './easel.ts'
import { PRESS_CSS } from './press.ts'
import { CORK_CSS } from './corkboard.ts'
import { LAMP_CSS } from './lamp.ts'
import { TYPECASE_CSS } from './typecase.ts'
import { MUSIC_CSS } from './music/index.ts'

const SHEET = 'lumen-iso-objects'
export const HOVER_CONFIRM = 100
function ensureSheet() {
  if (typeof document === 'undefined' || document.getElementById(SHEET)) return
  const style = document.createElement('style')
  style.id = SHEET
  style.textContent = BASE + BOX_CSS + CABINET_CSS + TYPEWRITER_CSS + EASEL_CSS + PRESS_CSS + CORK_CSS + LAMP_CSS + TYPECASE_CSS + MUSIC_CSS
  document.head.appendChild(style)
}

export const IsoObject = memo(function IsoObject({ markup, className, typing = false, onMotion }: {
  /** One builder's SVG; build it with useMemo over its data so it changes only when the data does */
  markup: string
  /** Placement and size from the view's own sheet */
  className: string
  /** The typewriter's event state: a reading is being written */
  typing?: boolean
  /** The music set's sound: the host's state after each change, and the host whose running animations it may read; null when the host goes */
  onMotion?: (motion: Motion | null, host: HTMLElement | null) => void
}) {
  ensureSheet()
  const [open, setOpen] = useState(false), [hover, setHover] = useState(false)
  const host = useRef<HTMLDivElement>(null), heard = useRef(onMotion), confirm = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  heard.current = onMotion
  useEffect(() => { onMotion?.({ hover, open, typing }, host.current) }, [hover, open, typing, onMotion])
  useEffect(() => () => { clearTimeout(confirm.current); heard.current?.(null, null) }, [])
  // Memoize { __html } by markup so parent re-renders (e.g. 3s polling) or open/typing toggles never rewrite innerHTML and restart SVG animations
  const html = useMemo(() => ({ __html: markup }), [markup])
  return <div ref={host} className={`iso-host ${className}${typing ? ' is-typing' : ''}`} aria-hidden="true" data-open={open ? '' : undefined} data-hover={hover ? '' : undefined}
    onPointerEnter={() => { clearTimeout(confirm.current); confirm.current = setTimeout(() => setHover(true), HOVER_CONFIRM) }}
    onPointerLeave={() => { clearTimeout(confirm.current); setHover(false) }}
    onMouseDown={event => event.preventDefault()} onClick={() => setOpen(value => !value)} dangerouslySetInnerHTML={html} />
})
