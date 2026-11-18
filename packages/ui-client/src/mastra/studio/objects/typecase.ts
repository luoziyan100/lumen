/**
 * [INPUT]: the kit in ./iso.ts; the solid layer in ./solid.ts (solid, pivot, along, tones)
 * [OUTPUT]: typecaseSvg(): the type case SVG (a shallow wooden tray of unequal compartments behind cross rails, a few dozen metal sorts standing in them with a nick on
 *           their side, a blank brass label holder and a pull on the front); TYPECASE_CSS: --iso-tilt (hover 1: the tray tilts toward the viewer on its front edge) and
 *           --iso-sorts (open 1: five sorts lift out of their compartments one after another and settle; back to 0 they drop in again)
 * [POS]: object 8 of studio/objects/, for the All view while it is a placeholder. It carries no data and follows no event. Parts are drawn row by row from the back,
 *        each compartment's sorts before the divider in front of it, so the tray needs no depth sort; a lifted sort's overshoot comes from the transition's ease
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { circle, css, kit, line, rect, type Vec } from './iso.ts'
import { along, DARK, pivot, solids, WOOD } from './solid.ts'

const { face } = kit({ x0: 196, y0: 92 })         // model origin (the tray's back corner on the desk) in the 320×300 viewBox
const { solid } = solids(face)

/* ---------- Size · tray 120 deep (x) × 200 wide (y) × 14 high, walls 4, floor 3; three rows of compartments split at unequal widths ---------- */
const X = 120, Y = 200, Z = 14, T = 4, FLOOR = 3, RAIL = 2.4
const ROWS = [T, 42, 78, X - T]                                // row edges along x, back to front
const SPLITS = [[58, 98, 150], [34, 70, 120, 162], [50, 114, 148]]   // divider positions along y in each row
const TILT = pivot([X, 0, 0], [0, 1, 0], '7 * var(--iso-tilt)')
const SORT: Vec = [3.6, 3, 7.5], LIFT = 19, GAP = .35
const METAL = { top: '#d3cdc2', right: '#bdb5a8', left: '#a59d90' }      // lighter than IRON: a sort is mostly its outline at this size
const RISE = 'cubic-bezier(.3, 1.45, .5, 1)'                  // the sorts overshoot their height and settle back to it

/* ============================================================
   Sorts · a metal body with a nick across its +y side and a raised mark on top; a lifted one rises by its window of --iso-sorts
   ============================================================ */
const hash = (i: number) => { const s = Math.sin(i * 78.233) * 43758.5453; return s - Math.floor(s) }
const MARKS = ['M-.9 -.8H.9M0 -.8V.9', 'M-.9 .9L0 -.9L.9 .9', 'M-.8 -.9V.9H.8', 'M.8 -.6A.9 .9 0 1 0 .8 .6', 'M-.9 0H.9M0 -.9V.9']
function sort(x: number, y: number, i: number, lift?: number) {
  // A lifted sort starts at its own point in the run and keeps the overshoot: max(0, …) only stops it going below the floor
  const extra = lift == null ? TILT : `${TILT} ${along([0, 0, LIFT], `max(0, (var(--iso-sorts) - ${lift}) / ${1 - lift})`)}`
  return solid([x, y, FLOOR], [[SORT[0], 0, 0], [0, SORT[1], 0], [0, 0, SORT[2]]], METAL, {
    extra,
    detail: (n, w, h) => n[2] > .9 ? `<path d="${MARKS[i % MARKS.length]}" transform="translate(${(w / 2).toFixed(2)} ${(h / 2).toFixed(2)})" fill="none" style="stroke:#4a443c;stroke-width:.7"/>`
      : n[1] > .9 ? line(1.6, 0, 1.6, h, 'hair') : '',
  })
}
// Sorts stand packed in a block of two rows at a spot in each compartment, as a compositor leaves them; a few compartments are empty.
// The listed compartments lift their first sort when open, each with its start in the run
const LIFTED: Record<number, number> = { 3: 0, 12: .1, 14: .2, 22: .3, 24: .42 }
function compartment(x0: number, x1: number, y0: number, y1: number, seed: number) {
  if (hash(seed) < .14) return ''
  const wide = Math.max(1, Math.min(5, Math.floor((y1 - y0 - 8) / (SORT[1] + GAP)), 1 + Math.floor(hash(seed + 5) * 5)))
  const deep = x1 - x0 > 2 * SORT[0] + 10 ? 2 : 1
  const cx = x0 + 3 + hash(seed * 7) * (x1 - x0 - 6 - deep * (SORT[0] + GAP)), cy = y0 + 3 + hash(seed * 3) * (y1 - y0 - 6 - wide * (SORT[1] + GAP))
  const spots: [number, number][] = []
  for (let i = 0; i < deep; i++) for (let j = 0; j < wide; j++) if (i === 0 || hash(seed * 11 + j) > .3) spots.push([cx + i * (SORT[0] + GAP), cy + j * (SORT[1] + GAP)])
  spots.sort((a, b) => a[0] + a[1] - b[0] - b[1])
  // The lifted one is the last drawn, the front corner of the block, so nothing in its own block hides it as it rises
  return spots.map(([x, y], k) => sort(x, y, seed + k, k === spots.length - 1 ? LIFTED[seed] : undefined)).join('')
}

/* ============================================================
   The tray · floor, back walls, then each row (its compartments and the dividers between them, then the rail in front), then the front walls
   ============================================================ */
const wall = (O: Vec, E: [Vec, Vec, Vec], tones = WOOD, seed = 0, detail?: (n: Vec, w: number, h: number) => string) => solid(O, E, tones, { seed, grains: 2, extra: TILT, detail })
const floor = solid([0, 0, 0], [[X, 0, 0], [0, Y, 0], [0, 0, FLOOR]], DARK, { extra: TILT, seed: 2, grains: 4 })
const backX = wall([0, 0, 0], [[T, 0, 0], [0, Y, 0], [0, 0, Z]], WOOD, 3)
const backY = wall([T, 0, 0], [[X - T, 0, 0], [0, T, 0], [0, 0, Z]], WOOD, 4)
function rows() {
  let out = ''
  ROWS.slice(0, -1).forEach((x0, r) => {
    const x1 = ROWS[r + 1]! - (r < ROWS.length - 2 ? RAIL / 2 : 0), xa = x0 + (r ? RAIL / 2 : 0)
    const edges = [T, ...SPLITS[r]!, Y - T]
    edges.slice(0, -1).forEach((y0, c) => {
      const y1 = edges[c + 1]! - (c < edges.length - 2 ? RAIL / 2 : 0), ya = y0 + (c ? RAIL / 2 : 0)
      out += compartment(xa, x1, ya, y1, r * 10 + c + 1)
      if (c < edges.length - 2) out += solid([xa, y1, FLOOR], [[x1 - xa, 0, 0], [0, RAIL, 0], [0, 0, Z - FLOOR - 1]], DARK, { extra: TILT })
    })
    if (r < ROWS.length - 2) out += solid([x1, T, FLOOR], [[RAIL, 0, 0], [0, Y - 2 * T, 0], [0, 0, Z - FLOOR - .5]], DARK, { extra: TILT, seed: 30 + r, grains: 1 })
  })
  return out
}
// The front: a blank brass label holder and a cup pull on the +x wall; the +y wall closes the corner, so it is drawn last
const front = (n: Vec, w: number) => n[0] > .9
  ? rect(w * .3 - 18, 3, 36, 8.4, '#e3c27e', 'brass', 1) + rect(w * .3 - 15.6, 4.6, 31.2, 5.2, '#fffdf6', 'hair', .4) +
    circle(w * .3 - 16.8, 7.2, .5, '#2f2b25') + circle(w * .3 + 16.8, 7.2, .5, '#2f2b25') +
    `<path d="M${w * .7 - 9} 4.2H${w * .7 + 9}V7.6C${w * .7 + 9} 12 ${w * .7 - 9} 12 ${w * .7 - 9} 7.6Z" class="brass"/>` +
    `<path d="M${w * .7 - 6.4} 5.6H${w * .7 + 6.4}V7.4C${w * .7 + 6.4} 10 ${w * .7 - 6.4} 10 ${w * .7 - 6.4} 7.4Z" fill="#c99f52" class="hair"/>` +
    circle(w * .7 - 7.6, 5, .45, '#2f2b25') + circle(w * .7 + 7.6, 5, .45, '#2f2b25')
  : ''
const frontX = wall([X - T, T, 0], [[T, 0, 0], [0, Y - 2 * T, 0], [0, 0, Z]], WOOD, 5, front)
const frontY = wall([0, Y - T, 0], [[X, 0, 0], [0, T, 0], [0, 0, Z]], WOOD, 6)

const shadow = face([-6, Y + 8, 0], [0, -1, 0], [1, 0, 0],
  `<rect x="0" y="0" width="${Y + 14}" height="${X + 14}" rx="16" fill="#3b2f1e" opacity=".14" filter="url(#iso-case-soft)"/>`)

export function typecaseSvg() {
  return `<svg class="iso iso-case" viewBox="0 0 320 300" role="img" aria-hidden="true">
    <defs><filter id="iso-case-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter></defs>
    ${shadow}${floor}${backX}${backY}${rows()}${frontX}${frontY}
  </svg>`
}

export const TYPECASE_CSS = css('.iso-case', { '--iso-tilt': { hover: 1, ms: 700 }, '--iso-sorts': { open: 1, ms: 1300, ease: RISE } })
