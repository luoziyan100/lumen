/**
 * [INPUT]: the kit in ./iso.ts; the drawn labels from the locale catalog (studio.objects.cabinet)
 * [OUTPUT]: cabinetSvg({ labels }): the card cabinet SVG (2 × 3 drawers; the middle-left one moves); CABINET_CSS: its variable --iso-drawer (hover 14, open 64, in model px)
 * [POS]: object 2 of studio/objects/, shown in empty Materials. It carries no data: the labels and the sample card are drawing, not content. Geometry is phase 1's and renders
 *        pixel-identical to it at rest
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { circle, css, grain, joints, kit, line, move, rect, show, text, type Vec } from './iso.ts'

const { face } = kit({ x0: 152, y0: 196 })        // model origin in the 320×360 viewBox

/* ---------- Size · cabinet 96 (x) × 150 (y) × 152 (z); plinth 12, a top slab 8 that overhangs 4 to the front and the left ---------- */
const W = 96, D = 150, H = 152, PL = 12, SL = 8, OV = 4
const F = 7, G = 6, CW = 65, CH = 38                    // frame, divider, drawer cell
const WOOD_TOP = '#fbf7ee', WOOD_R = '#f0e8d8', WOOD_L = '#e4d9c4', FRONT = '#f5eee0', FLOOR = '#e6dcc8', IN_LEFT = '#dcd0b8'
const MOVING = { c: 0, r: 1 }                           // the moving cell: middle row, left column, nearest the viewer

export interface CabinetLabels {
  /** Three rows of two drawer labels, top first */
  drawers: readonly (readonly string[])[]
  /** The two card tabs in the open drawer */
  tabs: readonly string[]
  /** The sample card in the open drawer: its stamp and two lines */
  stamp: string
  card: readonly string[]
}

/* ============================================================
   A drawer front · in its own (u, v): wood, inner frame, brass label frame, brass pull
   ============================================================ */
function drawerFront(w: number, h: number, label: string, seed: number) {
  const lx = w / 2 - 12, ly = 7, py = 24
  return rect(0, 0, w, h, FRONT, 'ln', 1) + rect(3, 3, w - 6, h - 6, 'none', 'hair', 1) + grain(w, h, seed, 3) +
    rect(lx, ly, 24, 11, '#e3c27e', 'brass', 1) + rect(lx + 2, ly + 2, 20, 7, '#fffdf6', 'hair', .5) +
    text(w / 2, ly + 7.4, 5, label, 'text-anchor="middle"') +
    circle(lx + 1, ly + 5.5, .6, '#2f2b25') + circle(lx + 23, ly + 5.5, .6, '#2f2b25') +
    rect(w / 2 - 13, py, 26, 5, '#e3c27e', 'brass', 1.5) +
    `<path d="M${w / 2 - 8} ${py + 2.5}A8 5.5 0 0 0 ${w / 2 + 8} ${py + 2.5}Z" class="brass-d"/>` +
    circle(w / 2 - 10.8, py + 2.5, .8, '#2f2b25') + circle(w / 2 + 10.8, py + 2.5, .8, '#2f2b25')
}

// The empty cell behind the moving drawer: the darkest cream at the back, the right wall and floor receding isometrically (in-face (−d, −d)) as two lighter slopes.
// It shows only once the drawer leaves the front, so at rest this cell looks like the other five
function cavity(w: number, h: number, d = 24) {
  return show('var(--iso-drawer) * 4', rect(0, 0, w, h, '#c4b597') +
    `<path d="M${w} 0V${h}L${w - d} ${h - d}V0Z" fill="#d0c2a6"/>` +
    `<path d="M0 ${h}H${w}L${w - d} ${h - d}H0Z" fill="#d7cbb1"/>` + rect(0, 0, w, h, 'none'))
}

/* ============================================================
   The carcass
   ============================================================ */
const cell = (c: number, r: number) => ({ u: F + c * (CW + G), v: F + r * (CH + G) })

function carcass(labels: CabinetLabels) {
  let fronts = ''
  labels.drawers.forEach((row, r) => row.forEach((label, c) => {
    const { u, v } = cell(c, r)
    fronts += c === MOVING.c && r === MOVING.r
      ? `<g transform="translate(${u} ${v})">${cavity(CW, CH)}</g>`
      : `<g transform="translate(${u + .8} ${v + .8})">${drawerFront(CW - 1.6, CH - 1.6, label, 11 + r * 2 + c)}</g>`
  }))
  const bodyFront = face([W, D, H], [0, -1, 0], [0, 0, -1],
    rect(0, 0, D, H - PL, WOOD_R) + grain(D, H - PL, 3, 7) + joints(0, 6, H - PL, 0) + fronts + line(0, H - PL - .5, D, H - PL - .5, 'ln'))
  const bodySide = face([0, D, H], [1, 0, 0], [0, 0, -1],
    rect(0, 0, W, H - PL, WOOD_L) + rect(9, 9, W - 21, H - PL - 18, 'none', 'hair', 2) + grain(W, H - PL, 6, 7) + joints(W - 6, 6, H - PL, 8))
  const plinthFront = face([W - 3, D - 3, PL], [0, -1, 0], [0, 0, -1],
    rect(0, 0, D - 6, PL, '#e6dcc8') + line(4, 2.5, D - 10, 2.5, 'hair') +
    text((D - 6) / 2, 9, 4.4, 'LUMEN', 'text-anchor="middle" letter-spacing="2.4" fill="#8a8d95"'))
  const plinthSide = face([0, D - 3, PL], [1, 0, 0], [0, 0, -1], rect(0, 0, W - 3, PL, '#d6cab2') + line(4, 2.5, W - 7, 2.5, 'hair'))
  const slabLeft = face([0, D + OV, H + SL], [1, 0, 0], [0, 0, -1], rect(0, 0, W + OV, SL, WOOD_L) + grain(W + OV, SL, 4, 1))
  const slabFront = face([W + OV, D + OV, H + SL], [0, -1, 0], [0, 0, -1], rect(0, 0, D + OV, SL, WOOD_R) + grain(D + OV, SL, 5, 1))
  const slabTop = face([0, D + OV, H + SL], [0, -1, 0], [1, 0, 0],
    rect(0, 0, D + OV, W + OV, WOOD_TOP) + rect(6, 6, D + OV - 12, W + OV - 12, 'none', 'hair', 2) + grain(D + OV, W + OV, 9, 6))
  return plinthSide + plinthFront + bodySide + bodyFront + slabLeft + slabFront + slabTop
}

// Three unfiled cards lie on top
const loose = ([[0, 0, -8], [1, 3, 4], [2, -2, 13]] as const).map(([k, du, rot]) =>
  face([58, 112, H + SL + .8 * (k + 1)], [0, -1, 0], [1, 0, 0],
    `<g transform="translate(${18 + du} ${10 + k}) rotate(${rot} 25 14)">` + rect(0, 0, 50, 28, k === 2 ? '#f8e9c6' : '#fffefa') +
    (k === 2 ? line(5, 7, 45, 7, 'hair') + line(5, 13, 45, 13, 'grain') + line(5, 19, 34, 19, 'grain') : '') + '</g>'))

const shadow = face([-6, D + 10, 0], [0, -1, 0], [1, 0, 0],
  `<rect x="0" y="0" width="${D + 22}" height="${W + 22}" rx="18" fill="#3b2f1e" opacity=".16" filter="url(#iso-cab-soft)"/>`)

/* ============================================================
   The moving drawer · hidden in the carcass at rest; pulled out by --iso-drawer, only the part in front of the face shows.
   Faces along x take x = W as origin, clip in-face to u ≥ 0 and slide inside the clip: the grain travels with the drawer and the part still inside never shows
   ============================================================ */
const { u: mu, v: mv } = cell(MOVING.c, MOVING.r)
const yL = D - mu - .8, yR = yL - (CW - 1.6), zTop = H - mv - .8, zBot = zTop - (CH - 1.6)   // the drawer front's four edges
const T = 5, L = 86, SIDE = 20, FLR = zBot + 2.5                                          // panel thickness, drawer depth, side height, tray floor
const nearY = yL - 2, farY = yR + 2, t = 3
const SLIDE = 'transform:translateX(calc(var(--iso-drawer) * 1px))'
const out = (O: Vec, V: Vec, body: string) => face([W, O[1], O[2]], [1, 0, 0], V, `<g clip-path="url(#iso-cab-out)"><g style="${SLIDE}">${body}</g></g>`)
const DOWN: Vec = [0, 0, -1], ALONG_Y: Vec = [0, 1, 0]
const BACK = -T - (L - T)                                   // where the tray starts in-face

const trayFloor = out([0, farY, FLR], ALONG_Y, rect(BACK, t, L - T, nearY - farY - 2 * t, FLOOR))
const farWall = out([0, farY + t, FLR + SIDE], DOWN, rect(BACK, 0, L - T, SIDE, IN_LEFT) + `<g transform="translate(${BACK} 0)">${grain(L - T, SIDE, 21, 2)}</g>`)
const farTop = out([0, farY, FLR + SIDE], ALONG_Y, rect(BACK, 0, L - T, t, WOOD_TOP))
const nearWall = out([0, nearY, FLR + SIDE], DOWN,
  rect(BACK, 0, L - T, SIDE, WOOD_L) + `<g transform="translate(${BACK} 0)">${grain(L - T, SIDE, 22, 3)}</g>` + joints(-T - 6, 6, SIDE, 0))
const nearTop = out([0, nearY - t, FLR + SIDE], ALONG_Y, rect(BACK, 0, L - T, t, WOOD_TOP))
const panelTop = out([0, yR, zTop], ALONG_Y, rect(-T, 0, T, yL - yR, WOOD_TOP))
const panelSide = out([0, yL, zTop], DOWN, rect(-T, 0, T, zTop - zBot, WOOD_L))

// Cards in the drawer: g is the distance from the panel's back; a card shows once it is wholly out of the face, and past 34 it rises by k
interface Card { g: number; k: number; tab?: number; label?: 0 | 1; fill?: string; words?: true }
const CARDS: Card[] = [
  { g: 40, k: .30 }, { g: 34, k: .36 }, { g: 28, tab: 30, label: 0, k: .46 },
  { g: 21, k: .40 }, { g: 15, tab: 4, label: 1, k: .58, fill: '#f8e9c6' }, { g: 9, k: .5 },
  { g: 3, k: 1.3, words: true },
]
const CWID = nearY - farY - 2 * t - 4, CHT = 22
function card(c: Card, labels: CabinetLabels) {
  let body = ''
  if (c.tab != null) body += `<path d="M${c.tab} 0V-6Q${c.tab} -7.5 ${c.tab + 1.5} -7.5H${c.tab + 18.5}Q${c.tab + 20} -7.5 ${c.tab + 20} -6V0" fill="${c.fill || '#fffefa'}" class="ln"/>` +
    text(c.tab + 10, -2.3, 4, labels.tabs[c.label!] ?? '', 'text-anchor="middle"')
  body += rect(0, 0, CWID, CHT, c.fill || '#fffefa')
  if (c.words) {
    body += line(4, 7, CWID - 4, 7, 'hair" style="stroke:#c9a0a0') +
      text(4.5, 5.4, 3.4, labels.stamp, 'fill="#8a8d95"') +
      text(4.5, 12.4, 4.6, labels.card[0] ?? '') + text(4.5, 18.2, 4.6, labels.card[1] ?? '')
  } else {
    for (let i = 0; i < 3; i++) body += line(4, 7 + i * 5.5, CWID - 4 - (i % 2) * 12, 7 + i * 5.5, 'grain')
  }
  const x = W - T - c.g
  return show(`var(--iso-drawer) - ${T + c.g}`,
    face([x, nearY - t - 2, FLR + CHT], [0, -1, 0], DOWN, body, move([1, 0, 0], 'var(--iso-drawer)') + ' ' + move([0, 0, c.k], 'max(0, var(--iso-drawer) - 34)')))
}

export function cabinetSvg({ labels }: { labels: CabinetLabels }) {
  const panelFront = face([W, yL, zTop], [0, -1, 0], DOWN, drawerFront(yL - yR, zTop - zBot, labels.drawers[MOVING.r]?.[MOVING.c] ?? '', 30), move([1, 0, 0], 'var(--iso-drawer)'))
  const drawer = trayFloor + farWall + farTop + CARDS.map(c => card(c, labels)).join('') + nearWall + nearTop + panelTop + panelSide + panelFront
  return `<svg class="iso iso-cabinet" viewBox="0 0 320 360" role="img" aria-hidden="true">
    <defs><filter id="iso-cab-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
    <clipPath id="iso-cab-out" clipPathUnits="userSpaceOnUse"><rect x="0" y="-400" width="400" height="800"/></clipPath></defs>
    ${shadow}${carcass(labels)}${loose.join('')}
    ${drawer}
  </svg>`
}

export const CABINET_CSS = css('.iso-cabinet', { '--iso-drawer': { hover: 14, open: 64, ms: 1000 } })
