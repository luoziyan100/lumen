/**
 * [INPUT]: the engraving kit of ./line.ts
 * [OUTPUT]: harpSvg(): ARPA · VI, a concert pedal harp in side elevation with DETAIL A beside it (640×400) for the empty Map view; HARP_CSS; HARP_STRINGS (40)
 * [POS]: music object M6, the counterpart of the cork board. Each string runs straight down from a tuning pin under the neck (NECK) to an eyelet on the soundboard line (BOARD);
 *        C strings are drawn heavier and F strings dashed, the ink form of the coloured strings. The column carries a fluted shaft and a crown; the base carries seven pedals.
 *        Hover plucks a broken chord string by string, each note rising into the blank between the harp and the detail. DETAIL A magnifies the discs and fork pins under the neck. Click runs a glissando across all forty, low to high, once (finished within 1.3 s)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { circle, curve, dbl, detail, hatch, inset, knurl, line, note, path, plate, r, rect, rivet, shadow, shadowDef, ticks } from './line.ts'

const P = 'hp-'
export const HARP_STRINGS = 40
const X0 = 176, X1 = 350, GAP = (X1 - X0) / (HARP_STRINGS - 1)
const NECK = curve([160, 58], [['C', [226, 40], [262, 104], [300, 90]], ['C', [330, 80], [352, 70], [368, 86]]])
const BOARD = { a: [172, 352] as const, b: [368, 92] as const }
const boardY = (x: number) => BOARD.a[1] + (x - BOARD.a[0]) * (BOARD.b[1] - BOARD.a[1]) / (BOARD.b[0] - BOARD.a[0])
const neckY = (x: number) => NECK.points.reduce((best, p) => Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best)[1]
const stringX = (i: number) => X0 + i * GAP
const ARPEGGIO = [5, 9, 12, 16, 19, 23, 26, 30]
const LOOP = 3.2

function column() {
  const shaft = `M150 70L152 336L168 336L170 70Z`
  let out = `<path d="${shaft}" class="w2 pf"/>` + inset(shaft, `${P}col`, [2.2])
  for (const x of [155, 158, 161, 164]) out += line(x, 80, x + .2, 328, 'w0')
  for (let y = 84; y < 330; y += 4) out += line(165, y, 168.4, y + 1.2, 'w0')
  out += path(`M144 70L176 70L172 58L148 58Z`, 'w1 pf') + rect(146, 64, 28, 2, 'w0')
  out += path(`M148 58C144 44 150 26 160 22C170 26 176 44 172 58Z`, 'w1 pf') + knurl(160, 40, 7, 20, 1.6) + circle(160, 40, 7, 'w1 pf') + circle(160, 40, 3, 'w0') + circle(160, 18, 3, 'w1 pf')
  for (const y of [28, 34, 48, 52]) out += line(152, y, 168, y, 'w0')
  out += path(`M146 336L174 336L176 346L144 346Z`, 'w1 pf')
  return out
}

function neck() {
  const upper = curve([158, 44], [['C', [222, 18], [262, 80], [300, 70]], ['C', [332, 62], [356, 50], [374, 76]]])
  let out = path(upper.d, 'w2') + path(NECK.d, 'w1') + line(374, 76, 368, 86, 'w1') + line(158, 44, 160, 58, 'w1')
  out += ticks(upper.every(2.4, 4, upper.length - 4), -3.4, 'w0', -2, -1)
  out += path(curve([160, 51], [['C', [224, 32], [262, 92], [300, 80]], ['C', [331, 71], [354, 60], [371, 81]]]).d, 'w0 dash')
  for (let i = 0; i < HARP_STRINGS; i++) {
    const x = stringX(i), y = neckY(x)
    out += circle(x, y - 5.6, .9, 'w0 pf') + circle(x - 1.2, y - 1.6, .8, 'if ns')
  }
  return out
}

function soundbox() {
  const [ax, ay] = BOARD.a, [bx, by] = BOARD.b
  const back = `M${ax} ${ay}L${bx} ${by}L${bx + 8} ${by + 2}L${ax + 34} ${ay + 4}Z`
  let out = `<path d="${back}" class="w2 pf"/>` + hatch(`${P}box`, [ax, by, bx - ax + 40, ay - by + 8], 34, 1.8)
  out += dbl(`M${ax} ${ay}L${bx} ${by}`, 5, .3)
  for (let k = 1; k < 9; k++) { const t = k / 9; out += line(ax + (bx - ax) * t, ay + (by - ay) * t, ax + 34 + (bx + 8 - ax - 34) * t, ay + 4 + (by + 2 - ay - 4) * t, 'w1') }
  out += path(`M${ax - 32} ${ay}L${ax + 44} ${ay}L${ax + 48} ${ay + 10}L${ax - 36} ${ay + 10}Z`, 'w1 pf')
  return out
}

function base() {
  let out = path(`M134 346L232 346L240 362L126 362Z`, 'w2 pf') + rect(122, 362, 122, 8, 'w1 pf')
  for (let x = 128; x < 242; x += 2.6) out += line(x, 363.4, x, 368.6, 'w0')
  for (const [x, y] of [[126, 370], [232, 370]] as const) out += rect(x, y, 10, 4, 'w1 pf')
  for (let k = 0; k < 7; k++) {
    const x = 138 + k * 13.5, notch = (k * 2) % 3
    out += rect(x, 352 + notch * 2.4, 7, 2.4, 'w1 pf') + line(x + 1, 351, x + 1, 360, 'w0') + line(x + 6, 351, x + 6, 360, 'w0')
  }
  for (const x of [140, 226]) out += rivet(x, 357, 1.2)
  return out
}

function strings() {
  let out = ''
  for (let i = 0; i < HARP_STRINGS; i++) {
    const x = stringX(i), top = neckY(x) - 2, bottom = boardY(x)
    const note7 = i % 7, cls = note7 === 0 ? 'w1' : note7 === 3 ? 'w0 dash' : 'w0'
    out += `<g class="${P}s ${P}s${i}">${line(x, top, x, bottom, cls)}</g>` + circle(x, bottom, .8, 'w0 pf')
  }
  return out
}

/* DETAIL A: the action under the neck at 3:1. Each string leaves its tuning pin, bends at a bridge pin, then passes two brass discs (natural, sharp);
   a disc whose two fork pins grip the string is engaged (its pedal is down) */
const WIN = { x: 500, y: 152, r: 62 }
const MARK = { x: stringX(22) + GAP * .5, y: neckY(stringX(22)) + 6, r: WIN.r / 3 }
function action() {
  let c = ''
  const neckEdge = (x: number) => WIN.y - 30 + (x - WIN.x) * .12
  c += path(`M${WIN.x - WIN.r} ${WIN.y - WIN.r}L${WIN.x + WIN.r} ${WIN.y - WIN.r}L${WIN.x + WIN.r} ${r(neckEdge(WIN.x + WIN.r))}L${WIN.x - WIN.r} ${r(neckEdge(WIN.x - WIN.r))}Z`, 'w1 pf')
  c += `<clipPath id="${P}nk"><path d="M${WIN.x - WIN.r} ${WIN.y - WIN.r}L${WIN.x + WIN.r} ${WIN.y - WIN.r}L${WIN.x + WIN.r} ${r(neckEdge(WIN.x + WIN.r))}L${WIN.x - WIN.r} ${r(neckEdge(WIN.x - WIN.r))}Z"/></clipPath>` + hatch(`${P}nk`, [WIN.x - WIN.r, WIN.y - WIN.r, WIN.r * 2, 40], 8, 2.6)
  c += path(`M${WIN.x - WIN.r} ${r(neckEdge(WIN.x - WIN.r) + 2)}L${WIN.x + WIN.r} ${r(neckEdge(WIN.x + WIN.r) + 2)}L${WIN.x + WIN.r} ${WIN.y + 44}L${WIN.x - WIN.r} ${WIN.y + 44}Z`, 'w1 pf')
  for (let x = WIN.x - WIN.r + 4; x < WIN.x + WIN.r; x += 9) c += circle(x, WIN.y + 40, .7, 'w0')
  const xs = [-20, -6.6, 6.6, 20].map(dx => WIN.x + dx)
  const disc = (x: number, y: number, engaged: boolean) => {
    const a = (engaged ? 0 : 70) * Math.PI / 180, rad = engaged ? 2.5 : 3.6, ox = Math.cos(a) * rad, oy = Math.sin(a) * rad
    return circle(x, y, 5.6, 'w1 pf') + circle(x, y, 4.2, 'w0') + knurl(x, y, 5.6, 22, .8) + circle(x + ox, y + oy, 1.3, 'w1 pf') + circle(x - ox, y - oy, 1.3, 'w1 pf')
  }
  xs.forEach((x, i) => {
    const pinY = neckEdge(x) - 14, bridgeY = neckEdge(x) + 9, drop = i % 2 ? 12 : 0
    const cls = i === 1 ? 'w2' : i === 3 ? 'w1 dash' : 'w1'
    c += circle(x - 5, pinY, 3.4, 'w1 pf') + rect(x - 6.4, pinY - 1.4, 2.8, 2.8, 'w0 pf') + circle(x - 1.8, bridgeY, 1.6, 'w1 pf')
    c += disc(x, WIN.y - 2 + drop, i === 2) + disc(x, WIN.y + 22 + drop, i === 0)
    c += path(`M${r(x - 5 + 3.4)} ${r(pinY)}L${r(x)} ${r(bridgeY - 1)}L${r(x)} ${WIN.y + WIN.r}`, cls)
  })
  return detail(`${P}da`, MARK, WIN, 'DETAIL A · 3:1', c)
}

function rising() {
  return ARPEGGIO.map((_, k) => `<g class="${P}n ${P}n${k}">${note((['q', 'e', 'q', 'b'] as const)[k % 4]!, 376 + (k % 3) * 8, 236 - k * 12, .85)}</g>`).join('')
}

export function harpSvg() {
  const defs = `<defs>${shadowDef(`${P}sh`)}<clipPath id="${P}col"><path d="M150 70L152 336L168 336L170 70Z"/></clipPath>` +
    `<clipPath id="${P}box"><path d="M${BOARD.a[0]} ${BOARD.a[1]}L${BOARD.b[0]} ${BOARD.b[1]}L${BOARD.b[0] + 8} ${BOARD.b[1] + 2}L${BOARD.a[0] + 34} ${BOARD.a[1] + 4}Z"/></clipPath>` +
    '</defs>'
  const body = defs + shadow(`${P}sh`, 200, 372, 120, 10) + soundbox() + strings() + column() + neck() + base() + action() + rising() + plate(560, 386, 'ARPA · VI')
  return `<svg class="mu mu-harp" viewBox="0 0 640 400" role="img" aria-hidden="true">${body}</svg>`
}

const pluckFrames = `@keyframes ${P}pluck { 0% { transform: none; } 3% { transform: translateX(1.2px); } 7% { transform: translateX(-1px); } 11% { transform: translateX(.7px); } 15% { transform: translateX(-.45px); } 20% { transform: translateX(.2px); } 26%, 100% { transform: none; } }`
const glissFrames = `@keyframes ${P}gliss { 0% { transform: none; } 12% { transform: translateX(1.1px); } 24% { transform: translateX(-.9px); } 38% { transform: translateX(.6px); } 52% { transform: translateX(-.35px); } 70%, 100% { transform: none; } }`
const arp = ARPEGGIO.map((s, k) => `.iso-host:hover:not([data-open]) .mu-harp .${P}s${s} { animation: ${P}pluck ${LOOP}s ${r(k * LOOP / 10)}s linear infinite; }\n` +
  `.iso-host:hover:not([data-open]) .mu-harp .${P}n${k} { animation: ${P}up ${LOOP}s ${r(k * LOOP / 10)}s cubic-bezier(.3,.6,.4,1) infinite; }`).join('\n')
const gliss = Array.from({ length: HARP_STRINGS }, (_, i) => `.iso-host[data-open] .mu-harp .${P}s${i} { animation: ${P}gliss 500ms ${i * 18}ms ease-out 1 both; }`).join('\n')
const run = ARPEGGIO.map((_, k) => `.iso-host[data-open] .mu-harp .${P}n${k} { animation: ${P}run 1s ${k * 50}ms cubic-bezier(.3,.6,.4,1) 1 both; }`).join('\n')

export const HARP_CSS = `
${pluckFrames}
${glissFrames}
@keyframes ${P}up { 0% { opacity: 0; transform: translate(0, 0); } 4% { opacity: 1; } 30% { opacity: 0; transform: translate(26px, -60px); } 100% { opacity: 0; transform: translate(26px, -60px); } }
@keyframes ${P}run { 0% { opacity: 0; transform: translate(0, 0); } 10% { opacity: 1; } 100% { opacity: 0; transform: translate(30px, -70px); } }
.mu-harp .${P}n { opacity: 0; }
${arp}
${gliss}
${run}
`
