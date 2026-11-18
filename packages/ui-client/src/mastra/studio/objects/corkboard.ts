/**
 * [INPUT]: the kit in ./iso.ts; the solid layer in ./solid.ts (solid, tones)
 * [OUTPUT]: corkSvg(): the cork board SVG (a framed cork panel standing on two feet, five blank index cards on brass pins, spare pins, red string between some
 *           pins); CORK_CSS: --iso-tilt (hover 1: one card swings on its pin) and --iso-taut (open 1: the slack string pulls straight and the free cards jostle)
 * [POS]: object 6 of studio/objects/, for the Concept map view while it is a placeholder. It carries no data and follows no event. Everything on the cork is drawn
 *        in the cork's own (u, v), so a card's swing is a plain 2D turn about its pin and the string's slack is a 2D scale of its sag
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { circle, css, kit, line, rect } from './iso.ts'
import { DARK, solids, WOOD } from './solid.ts'

const { face } = kit({ x0: 241, y0: 175 })        // model origin (the frame's back-bottom corner at y = 0) in the 320×300 viewBox
const { solid } = solids(face)

/* ---------- Size · frame 180 (y) × 124 (z) × 8 (x), bars 9 wide, cork recessed to x = 4.5; it stands on two feet, its bottom at z = 10 ---------- */
const WB = 196, HB = 136, F = 9, D = 8, Z0 = 10, CORK_X = 4.5
const CW = WB - 2 * F, CH = HB - 2 * F                       // the cork in its own (u, v): u along −y from y = WB − F, v down from z = Z0 + HB − F
const CORK = '#cfa978', SPECKS = ['#b88f5c', '#e0c194', '#a87f4f']

/* ============================================================
   Feet and frame
   ============================================================ */
const feet = [30, WB - 40].map((y, i) => solid([-18, y, 0], [[42, 0, 0], [0, 10, 0], [0, 0, Z0]], DARK, { seed: 20 + i, grains: 1 }) +
  face([24, y + 10, Z0 / 2], [0, -1, 0], [0, 0, -1], circle(5, 0, .9, '#2f2b25')))
const bar = (y: number, z: number, w: number, h: number, seed: number) => solid([0, y, z], [[D, 0, 0], [0, w, 0], [0, 0, h]], WOOD, { seed, grains: 2 })
const frame = bar(0, Z0 + HB - F, WB, F, 1) + bar(WB - F, Z0, F, HB, 2) + bar(0, Z0, F, HB, 3) + bar(0, Z0, WB, F, 4)
// A blank brass plate on the bottom bar and a hanging ring on the top one
const plate = face([D, WB / 2 + 16, Z0 + F - 1.6], [0, -1, 0], [0, 0, -1], rect(0, 0, 32, 5.8, '#e3c27e', 'brass', 1) + rect(2, 1.2, 28, 3.4, '#fffdf6', 'hair', .5) +
  circle(1.2, 2.9, .5, '#2f2b25') + circle(30.8, 2.9, .5, '#2f2b25'))
const ring = face([D / 2, WB / 2, Z0 + HB], [0, -1, 0], [0, 0, -1], `<path d="M-4 0A4 4.4 0 0 1 4 0" fill="none" class="brass" style="fill:none;stroke:#c99f52;stroke-width:1.4"/>` + rect(-5.5, -.6, 11, 2.2, '#e3c27e', 'brass', .6))

/* ============================================================
   The cork · a speckled panel; everything pinned to it lives in its (u, v)
   ============================================================ */
const hash = (i: number) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s) }
const specks = Array.from({ length: 70 }, (_, i) => circle(+(2 + hash(i) * (CW - 4)).toFixed(1), +(2 + hash(i + 99) * (CH - 4)).toFixed(1), +(.35 + hash(i + 7) * .55).toFixed(2), SPECKS[i % 3]!)).join('')

interface Card { u: number; v: number; w: number; h: number; turn: number; fill: string; ruled: number }
const CARDS: Card[] = [
  { u: 16, v: 14, w: 42, h: 28, turn: -4, fill: '#fffefa', ruled: 3 },
  { u: 78, v: 9, w: 38, h: 26, turn: 3, fill: '#f8e9c6', ruled: 2 },
  { u: 130, v: 20, w: 36, h: 31, turn: -2, fill: '#fffefa', ruled: 3 },
  { u: 34, v: 66, w: 44, h: 29, turn: 2, fill: '#eef0e6', ruled: 3 },
  { u: 106, v: 70, w: 40, h: 27, turn: -5, fill: '#fffefa', ruled: 2 },
]
const pinOf = (c: Card) => [c.u + c.w / 2, c.v + 3.2] as const
const SWING = 1                                                // the card that swings on hover
const JOSTLE = [2, 3]                                          // the free cards that shift as the string pulls
const pin = (u: number, v: number) => `<ellipse cx="${u + 1.3}" cy="${v + 1.6}" rx="2.4" ry="1.3" fill="#3b2f1e" opacity=".22"/>` +
  circle(u, v, 2.3, '#e3c27e', 'brass') + circle(u - .7, v - .7, .7, '#fff6dc')
function card(c: Card, i: number) {
  const [pu, pv] = pinOf(c)
  let body = rect(c.u, c.v, c.w, c.h, c.fill)
  body += line(c.u + 3, c.v + 7, c.u + c.w - 3, c.v + 7, 'hair').replace('hair', 'hair" style="stroke:#c9a0a0')
  for (let k = 0; k < c.ruled; k++) body += line(c.u + 3, c.v + 12 + k * 5, c.u + c.w - 3 - (k % 2) * 8, c.v + 12 + k * 5, 'grain')
  // The swinging card turns about its pin by --iso-tilt; the jostled ones slide a hair as the string goes taut
  const motion = i === SWING ? `transform:rotate(calc(${c.turn}deg + var(--iso-tilt) * 9deg))` : `transform:rotate(${c.turn}deg)${JOSTLE.includes(i) ? ` translate(calc(var(--iso-taut) * ${i === 2 ? -1.6 : 1.4}px), calc(var(--iso-taut) * -.8px))` : ''}`
  return `<g style="transform:translate(${pu}px, ${pv}px)"><g style="${motion}"><g style="transform:translate(${-pu}px, ${-pv}px)">${body}${pin(pu, pv)}</g></g></g>`
}
// Spare pins pushed into the cork with nothing on them
const SPARE: [number, number][] = [[68, 56], [154, 72], [9, 104]]

/* ---------- The string · from pin to pin; a slack one sags by s at its middle and the sag scales away as --iso-taut rises ---------- */
const RED = '#b5463c'
function string(a: readonly [number, number], b: readonly [number, number], sag: number, slack: boolean) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), rad = Math.atan2(b[1] - a[1], b[0] - a[0])
  // The sag hangs down the cork (+v) whichever way the string runs: in the string's own frame "down" is +y when it runs rightward, −y when leftward
  const down = Math.cos(rad) >= 0 ? 1 : -1
  // Taut keeps 4% of the sag: a scale of exactly 0 is a degenerate transform and the browser drops the path altogether
  const scale = slack ? 'transform:scaleY(calc(1 - var(--iso-taut) * .96))' : ''
  return `<g transform="translate(${a[0].toFixed(2)} ${a[1].toFixed(2)}) rotate(${(rad * 180 / Math.PI).toFixed(2)})"><path d="M0 0Q${(L / 2).toFixed(2)} ${(2 * sag * down).toFixed(2)} ${L.toFixed(2)} 0" fill="none" style="stroke:${RED};stroke-width:.9;stroke-linecap:round;${scale}"/></g>`
}
const knot = ([u, v]: readonly [number, number]) => `<circle cx="${u}" cy="${v}" r="2.9" fill="none" style="stroke:${RED};stroke-width:.7"/>`
const strings = () => {
  const p = CARDS.map(pinOf)
  return string(p[0]!, p[1]!, 7, true) + string(p[1]!, p[4]!, 2, false) + string(p[0]!, p[3]!, 3, false) + string(p[2]!, SPARE[1]!, 4, false) +
    [p[0]!, p[1]!, p[4]!, p[3]!, p[2]!, SPARE[1]!].map(knot).join('')
}

const cork = face([CORK_X, WB - F, Z0 + HB - F], [0, -1, 0], [0, 0, -1],
  rect(0, 0, CW, CH, CORK) + specks + CARDS.map(card).join('') + SPARE.map(([u, v]) => pin(u, v)).join('') + strings())

const shadow = face([-26, WB + 8, 0], [0, -1, 0], [1, 0, 0],
  `<rect x="0" y="0" width="${WB + 16}" height="70" rx="22" fill="#3b2f1e" opacity=".14" filter="url(#iso-cork-soft)"/>`)

export function corkSvg() {
  return `<svg class="iso iso-cork" viewBox="0 0 320 300" role="img" aria-hidden="true">
    <defs><filter id="iso-cork-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter></defs>
    ${shadow}${feet.join('')}${cork}${frame}${plate}${ring}
  </svg>`
}

export const CORK_CSS = css('.iso-cork', { '--iso-tilt': { hover: 1, ms: 700 }, '--iso-taut': { open: 1, ms: 900 } })
