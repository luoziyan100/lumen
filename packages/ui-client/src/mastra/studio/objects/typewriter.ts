/**
 * [INPUT]: the kit in ./iso.ts; the paper's lines from the caller (paperLines wraps a material title)
 * [OUTPUT]: typewriterSvg({ lines }): the typewriter SVG with up to three lines on its paper and the cursor after the last; paperLines(title); TYPEWRITER_CSS: --iso-paper
 *           (hover 10, open 26), --iso-car and --iso-k1..4, and the typing loop on .iso-host.is-typing
 * [POS]: object 3 of studio/objects/, shown in the empty Reading view. The typing loop follows one real event (a reading requested, no section yet) and stops when the class goes.
 *        Geometry is phase 1's; with phase 1's three lines it renders pixel-identical to it at rest. The paper's words are escaped by the kit and clipped to the sheet
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { circle, css, kit, line, move, rect, text, textWidth, wrapText, type VarSpec, type Vec } from './iso.ts'

const { face } = kit({ x0: 168, y0: 136 })        // model origin in the 320×300 viewBox

const TOP = '#fbf7ee', RIGHT = '#f0e8d8', LEFT = '#e4d9c4', KEY = '#fffdf6', STEM = '#c9bca3'
const UP: Vec = [0, 0, -1], ALONG: Vec = [0, -1, 0], BACKWARD: Vec = [1, 0, 0]

/* ============================================================
   Blocks · an axis-aligned box shows three faces: left (+y), front (+x), top (+z), drawn in that order.
   Each face's brush gets its own width and height; extra is the block's motion
   ============================================================ */
type Brush = (w: number, h: number) => string
function block([x0, x1]: number[], [y0, y1]: number[], [z0, z1]: number[], { left, front, top, tones = [LEFT, RIGHT, TOP], extra = '' }: { left?: Brush; front?: Brush; top?: Brush; tones?: string[]; extra?: string } = {}) {
  const dx = x1! - x0!, dy = y1! - y0!, dz = z1! - z0!, fill = (w: number, h: number, c: string) => rect(0, 0, w, h, c)
  return face([x0!, y1!, z1!], BACKWARD, UP, fill(dx, dz, tones[0]!) + (left ? left(dx, dz) : ''), extra) +
    face([x1!, y1!, z1!], ALONG, UP, fill(dy, dz, tones[1]!) + (front ? front(dy, dz) : ''), extra) +
    face([x0!, y1!, z1!], ALONG, BACKWARD, fill(dy, dx, tones[2]!) + (top ? top(dy, dx) : ''), extra)
}
// A horizontal piece: origin (x, y, z), u along −y, v along +x
const flat = (x: number, y: number, z: number, body: string, extra = '') => face([x, y, z], ALONG, BACKWARD, body, extra)

/* ---------- Chassis · 92 (x) × 150 (y) × 40 (z) ---------- */
const BW = 92, BD = 150, BH = 40
const chassis = block([0, BW], [0, BD], [0, BH], {
  left: (w, h) => rect(6, 6, w - 12, h - 12, 'none', 'hair', 4) +
    rect(w / 2 - 18, h / 2 - 6, 36, 12, '#e3c27e', 'brass', 1.5) + rect(w / 2 - 15.5, h / 2 - 3.8, 31, 7.6, '#fffdf6', 'hair', 1) +
    text(w / 2, h / 2 + 2, 5, 'LUMEN', 'text-anchor="middle" letter-spacing="1.6"') +
    circle(w / 2 - 16.6, h / 2, .7, '#2f2b25') + circle(w / 2 + 16.6, h / 2, .7, '#2f2b25'),
  front: w => line(4, 4, w - 4, 4, 'hair'),
  top: (w, h) => rect(5, 5, w - 10, h - 10, 'none', 'hair', 6),
})

// The typebar basket: a half disc on the chassis top's front edge; each radial hairline is a typebar
const BASKET = (() => {
  const cx = BD - 75, cy = BW, R = 27
  let s = `<path d="M${cx - R} ${cy}A${R} ${R} 0 0 1 ${cx + R} ${cy}Z" fill="#e6dcc8" class="ln"/>`
  for (let i = 1; i < 16; i++) {
    const a = Math.PI * i / 16, c = Math.cos(a), d = Math.sin(a)
    s += line(cx - c * 9, cy - d * 9, cx - c * (R - 2.5), cy - d * (R - 2.5), 'hair')
  }
  return flat(0, BD, BH, s + `<path d="M${cx - 9} ${cy}A9 9 0 0 1 ${cx + 9} ${cy}Z" fill="#e3c27e" class="brass"/>` + circle(cx, cy - 4.5, 1.4, '#2f2b25'))
})()

// Ribbon spools, one each side: a cream disc under a brass cap
const spool = (y: number) => flat(78, y, BH, circle(0, 0, 10.5, '#e9e0cd', 'ln')) +
  flat(78, y, BH + 3.5, circle(0, 0, 9, '#e3c27e', 'brass') + circle(0, 0, 5.5, 'none', 'hair') +
    [0, 1, 2].map(k => circle(Math.cos(k * 2.1) * 3.2, Math.sin(k * 2.1) * 3.2, .9, '#c99f52', 'brass-d')).join('') + circle(0, 0, 1.2, '#2f2b25'))

/* ============================================================
   Carriage · steps along +y (screen lower-left) by --iso-car; the paper rises from the slit in its top by --iso-paper
   ============================================================ */
const CX = [18, 58], CY = [-12, 162], CZ = [BH, 58], SLIT = 37
const CAR = move([0, 1, 0], 'var(--iso-car)')
const knob = (y: number) => face([SLIT, y, 58], BACKWARD, UP,
  circle(0, 9, 10, RIGHT, 'ln') + circle(0, 9, 6.5, 'none', 'hair') +
  Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return line(Math.cos(a) * 8, 9 + Math.sin(a) * 8, Math.cos(a) * 10, 9 + Math.sin(a) * 10, 'hair') }).join('') +
  circle(0, 9, 1.6, '#e3c27e', 'brass'), CAR)
const carriage = knob(-20) + block(CX, CY, CZ, {
  front: w => rect(0, 4, w, 9, '#ddd2bb', 'ln', 4.5) + line(3, 6.5, w - 3, 6.5, 'grain') + line(3, 10.5, w - 3, 10.5, 'grain'),
  top: (w, h) => {
    let s = line(10, SLIT - CX[0]!, w - 10, SLIT - CX[0]!, 'ln')                    // the paper slit
    for (let u = 12, k = 0; u <= w - 12; u += 6, k++) s += line(u, h - 6, u, h - (k % 5 ? 3.5 : 1.5), 'hair')   // the scale
    return s + rect(10, h - 7.5, w - 20, 7, 'none', 'hair', 1)
  },
  left: () => circle(SLIT - CX[0]!, 9, 3, STEM, 'ln'),
  extra: CAR,
})
// The return lever: a brass bar on the carriage's left end, reaching past the chassis
const lever = flat(CX[0]!, CY[1]!, CZ[1]! + .6,
  `<path d="M-4 30L-14 14Q-17 9 -24 8L-34 7" fill="none" stroke="#2f2b25" stroke-width="4.6" stroke-linecap="round"/>` +
  `<path d="M-4 30L-14 14Q-17 9 -24 8L-34 7" fill="none" stroke="#e3c27e" stroke-width="2.8" stroke-linecap="round"/>` +
  circle(-4, 30, 3, '#c99f52', 'brass-d'), CAR)

/* ============================================================
   Paper · the face's origin is the slit; it is clipped to above the slit and pushed up inside by --iso-paper, so the part below never shows.
   Three line slots from the top; the cursor stands one space after the last line, as the next key would strike
   ============================================================ */
const PW = 92, PY = 121
const LINE_V = [-42, -34, -26], LINE_X = 9, SIZE = 5.2, CURSOR_GAP = 6.4
/** The paper's text box: three lines, the width between the margins */
export const PAPER = { width: PW - LINE_X - 6, size: SIZE, lines: LINE_V.length }
/** A material title as paper lines: wrapped to the paper, three lines at most, … when it runs over */
export const paperLines = (title: string) => wrapText(title, PAPER.width, PAPER.size, PAPER.lines)

function sheet(lines: string[]) {
  const shown = lines.slice(0, LINE_V.length)
  const last = shown.length - 1
  const words = shown.map((value, i) => text(LINE_X, LINE_V[i]!, SIZE, value, 'font-family="var(--mono, monospace)"')).join('')
  const cursor = last < 0 ? '' : rect(Math.min(LINE_X + textWidth(shown[last]!, SIZE) + CURSOR_GAP, PW - 6), LINE_V[last]! - 5, 3, 6, '#3b362e', '')
  return rect(3, -50, PW, 104, '#f3ead6') + rect(0, -52, PW, 104, '#fffefa') +
    `<g clip-path="url(#iso-tw-sheet)">${words}${cursor}</g>` +
    line(6, -16, PW - 6, -16, 'grain') + line(6, -8, PW - 22, -8, 'grain')
}
// The bail: a thin bar in front of the paper on two posts, with two small rollers
const bail = [16, 130].map(y => face([SLIT + 6, y, 70], ALONG, UP, rect(0, 0, 2.4, 12, STEM), CAR)).join('') +
  flat(SLIT + 5, PY + 9, 70, rect(0, 0, PW + 18, 2.6, '#e9e0cd', 'ln', 1) +
    [30, 80].map(u => rect(u, -1, 7, 4.6, '#e3c27e', 'brass', 2)).join(''), CAR)

/* ============================================================
   Keyboard · three steps, high at the back; each key is two discs: the stem below and the cap above (the cap sinks when pressed)
   ============================================================ */
const TIERS = [{ x: [BW, 106], z: 34 }, { x: [106, 120], z: 27 }, { x: [120, 134], z: 20 }], TY = [8, 142]
const ROWS = [
  { tier: 0, y0: 125, keys: 'QWERTYU' },
  { tier: 1, y0: 120, keys: 'ASDFGHJ' },
]
const PRESS: Record<string, string> = { E: '--iso-k1', F: '--iso-k2', T: '--iso-k3', S: '--iso-k4' }      // the four keys struck in turn while typing
function key(x: number, y: number, z: number, ch: string) {
  const v = PRESS[ch], sink = v ? move([0, 0, -1], `var(${v}) * 2.6`) : ''
  return flat(x, y, z + 1.6, circle(0, 0, 5.4, STEM, 'ln')) +
    flat(x, y, z + 4.6, circle(0, 0, 5.4, KEY, 'ln') + circle(0, 0, 4, 'none', 'hair') +
      text(0, 1.8, 5, ch, 'text-anchor="middle"'), sink)
}
const keyboard = TIERS.map((t, i) => {
  let s = block(t.x, TY, [0, t.z], { front: w => line(3, 3, w - 3, 3, 'hair') })
  const xm = (t.x[0]! + t.x[1]!) / 2
  for (const row of ROWS.filter(r => r.tier === i))
    [...row.keys].map((ch, k) => ({ ch, y: row.y0 - 17 * k })).reverse().forEach(({ ch, y }) => { s += key(xm, y, t.z, ch) })
  if (i === 2) s += flat(xm - 4, 108, t.z + 1.6, rect(0, 0, 76, 8, STEM, 'ln', 4)) +
    flat(xm - 4, 108, t.z + 4.2, rect(0, 0, 76, 8, KEY, 'ln', 4) + line(8, 4, 68, 4, 'grain'))
  return s
}).join('')

const shadow = flat(-8, BD + 10, 0,
  `<rect x="0" y="0" width="${BD + 24}" height="${134 + 18}" rx="20" fill="#3b2f1e" opacity=".16" filter="url(#iso-tw-soft)"/>`)

export function typewriterSvg({ lines }: { lines: string[] }) {
  const paper = face([SLIT, PY, CZ[1]!], ALONG, UP,
    `<g clip-path="url(#iso-tw-slit)"><g style="transform:translateY(calc(var(--iso-paper) * -1px))">${sheet(lines)}</g></g>`, CAR)
  return `<svg class="iso iso-typewriter" viewBox="0 0 320 300" role="img" aria-hidden="true">
    <defs><filter id="iso-tw-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
    <clipPath id="iso-tw-slit" clipPathUnits="userSpaceOnUse"><rect x="-400" y="-400" width="800" height="400"/></clipPath>
    <clipPath id="iso-tw-sheet" clipPathUnits="userSpaceOnUse"><rect x="0" y="-52" width="${PW}" height="104"/></clipPath></defs>
    ${shadow}${chassis}${BASKET}${carriage}${lever}${paper}${bail}${knob(170)}${spool(128)}${spool(22)}${keyboard}
  </svg>`
}

/* ---------- The typing loop · four strikes in 2.4s: a key goes down and springs back, and on the way back the carriage steps one place; after the fourth it returns ---------- */
const KEYS = ['--iso-k1', '--iso-k2', '--iso-k3', '--iso-k4']
const FRAMES = [0, 9, 11, 34, 36, 59, 61, 84, 86, 92, 100].map((p, i) => [p, [0, 0, 4, 4, 8, 8, 12, 12, 16, 16, 0][i]!] as const)
let typing = '@keyframes iso-tw-type {\n'
FRAMES.forEach(([p, c]) => { typing += `  ${p}% { --iso-car: ${c}; }\n` })
KEYS.forEach((k, i) => { const p = 25 * i; typing += `  ${p}%, ${p + 9}% { ${k}: 0; } ${p + 3}% { ${k}: 1; }\n` })
typing += '}\n.iso-host.is-typing .iso-typewriter { animation: iso-tw-type 2.4s linear infinite; }\n' +
  '@media (prefers-reduced-motion: reduce) { .iso-host.is-typing .iso-typewriter { animation: none; } }\n'

const VARS: Record<string, VarSpec> = { '--iso-paper': { hover: 10, open: 26, ms: 900 }, '--iso-car': { ms: 500 } }
KEYS.forEach(k => { VARS[k] = { ms: 120 } })
export const TYPEWRITER_CSS = css('.iso-typewriter', VARS) + typing
