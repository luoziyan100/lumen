/**
 * [INPUT]: the kit's BASE and every object's CSS (box, cabinet, typewriter, easel, press, cork board, lamp, type case); markup built by the caller from one of the builders
 * [OUTPUT]: IsoObject: a host that holds one object's SVG; click toggles data-open (hover is pure CSS); `typing` sets the is-typing event class
 * [POS]: the only React surface of studio/objects/. The markup is set once per data change and never on a state change: hover, open and typing move only the registered
 *        CSS variables. The host is decoration: aria-hidden, outside the tab order, never takes focus (mousedown keeps the focus where it was), and its SVG takes no pointer
 *        events, so only the host's own box answers a click. The shared sheet is injected once per document
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useState } from 'react'
import { BASE } from './iso.ts'
import { BOX_CSS } from './box.ts'
import { CABINET_CSS } from './cabinet.ts'
import { TYPEWRITER_CSS } from './typewriter.ts'
import { EASEL_CSS } from './easel.ts'
import { PRESS_CSS } from './press.ts'
import { CORK_CSS } from './corkboard.ts'
import { LAMP_CSS } from './lamp.ts'
import { TYPECASE_CSS } from './typecase.ts'

const SHEET = 'lumen-iso-objects'
function ensureSheet() {
  if (typeof document === 'undefined' || document.getElementById(SHEET)) return
  const style = document.createElement('style')
  style.id = SHEET
  style.textContent = BASE + BOX_CSS + CABINET_CSS + TYPEWRITER_CSS + EASEL_CSS + PRESS_CSS + CORK_CSS + LAMP_CSS + TYPECASE_CSS
  document.head.appendChild(style)
}

export function IsoObject({ markup, className, typing = false }: {
  /** One builder's SVG; build it with useMemo over its data so it changes only when the data does */
  markup: string
  /** Placement and size from the view's own sheet */
  className: string
  /** The typewriter's event state: a reading is being written */
  typing?: boolean
}) {
  ensureSheet()
  const [open, setOpen] = useState(false)
  return <div className={`iso-host ${className}${typing ? ' is-typing' : ''}`} aria-hidden="true" data-open={open ? '' : undefined}
    onMouseDown={event => event.preventDefault()} onClick={() => setOpen(value => !value)} dangerouslySetInnerHTML={{ __html: markup }} />
}
