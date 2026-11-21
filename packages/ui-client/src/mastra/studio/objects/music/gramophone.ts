/**
 * [INPUT]: the engraving kit of ./line.ts; the 3D horn of ./horn.ts (hornSvg, hornAt)
 * [OUTPUT]: gramophoneSvg(): GRAMMOFONO · III, a horn gramophone (640×400) for the empty Takeaways view; GRAMOPHONE_CSS; GRAMOPHONE_ARM (pivot, arm length and the solved angles, for the tests)
 * [POS]: music object M3, the counterpart of the press. A near-cubic wooden case (mouldings, corner posts, panelled front and side, winding crank on the right) in cabinet oblique;
 *        the record nearly fills the top face. The top face, the record, the turntable and the tone arm share one plane, projected by one matrix (depth recedes up-right by kx, ky).
 *        The tapered tone arm turns about a swivel at the back right; its angle for a groove radius is solved from two circles (pivot, ARM) and (centre, radius), so the needle lands on the groove.
 *        The soundbox at the arm's end is drawn upright: its group cancels the plane's shear and counter-rotates with the arm, so its face (diaphragm rings, rim screws, needle clamp, needle) always faces the viewer.
 *        The horn is a 3D surface on one spine (SPINE): its gooseneck rises from the swivel and bends into a petalled bell that opens toward the viewer's left, so the mouth shows its throat.
 *        A bracket from the back of the case holds the tube in a cradle solved from the spine (hornAt). DETAIL A magnifies the soundbox at 3:1.
 *        At rest the arm sits on its post off the record. Hover lowers it onto the outer groove, spins the record and sends notes out of the horn into the blank upper left.
 *        Click lets the needle walk inward to the run-out groove
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { circle, curve, dbl, detail, ellipse, hatch, knurl, line, note, path, plate, r, rect, screw, shadow, shadowDef, ticks, type Pt } from './line.ts'
import { hornAt, hornSvg, type HornSpine } from './horn.ts'

const P = 'gr-'
const DECK = { cx: 330, cy: 200, kx: .32, ky: .34, w: 100, d: 100, h: 118 }
const REC = { outer: 86, inner: 38, label: 26 }
const PIVOT = { x: 76, y: -76 }, ARM = 118
/** The arm angle (degrees, from +x about the pivot) that puts the needle on a groove of radius rho */
function armAngle(rho: number) {
  const dx = -PIVOT.x, dy = -PIVOT.y, dist = Math.hypot(dx, dy)
  const a = Math.acos((ARM * ARM + dist * dist - rho * rho) / (2 * ARM * dist))
  return (Math.atan2(dy, dx) - a) * 180 / Math.PI
}
export const GRAMOPHONE_ARM = { pivot: PIVOT, length: ARM, rest: armAngle(98), outer: armAngle(REC.outer - 2), inner: armAngle(REC.inner + 2), radius: REC }
const MATRIX = `matrix(1 0 ${-DECK.kx} ${DECK.ky} ${DECK.cx} ${DECK.cy})`
const UPRIGHT = `matrix(1 0 ${r(DECK.kx / DECK.ky)} ${r(1 / DECK.ky)} 0 0)`
const screenOf = (x: number, y: number): Pt => [DECK.cx + x - y * DECK.kx, DECK.cy + y * DECK.ky]
const pts = (list: Pt[]) => 'M' + list.map(p => `${r(p[0])} ${r(p[1])}`).join('L') + 'Z'

/* ============================================================
   Case · mouldings, corner posts, panels, crank
   ============================================================ */
function cabinet() {
  const { w, d, h } = DECK
  const fl = screenOf(-w, d), fr = screenOf(w, d), br = screenOf(w, -d)
  const top = fl[1], bottom = top + h, x0 = fl[0], x1 = fr[0], down = (p: Pt, k: number): Pt => [p[0], p[1] + k]
  let out = path(pts([fr, br, down(br, h), down(fr, h)]), 'w2 pf')
  const side = (u: number, v: number): Pt => [fr[0] + (br[0] - fr[0]) * u, fr[1] + (br[1] - fr[1]) * u + v]
  out += path(pts([side(.14, 18), side(.86, 18), side(.86, h - 20), side(.14, h - 20)]), 'w1') + path(pts([side(.18, 22), side(.82, 22), side(.82, h - 24), side(.18, h - 24)]), 'w0')
  out += hatch(`${P}side`, [fr[0], br[1], br[0] - fr[0], bottom - br[1]], 90, 2.2)
  out += rect(x0, top, x1 - x0, h, 'w2 pf')
  for (const x of [x0 + 5, x1 - 13]) out += rect(x, top + 10, 8, h - 22, 'w1 pf') + line(x + 2.6, top + 12, x + 2.6, bottom - 14, 'w0') + line(x + 5.4, top + 12, x + 5.4, bottom - 14, 'w0')
  out += rect(x0, top, x1 - x0, 10, 'w1 pf') + line(x0, top + 3.4, x1, top + 3.4, 'w0') + line(x0, top + 6.6, x1, top + 6.6, 'w0')
  out += rect(x0, bottom - 12, x1 - x0, 12, 'w1 pf') + line(x0, bottom - 8, x1, bottom - 8, 'w0') + line(x0, bottom - 4, x1, bottom - 4, 'w0')
  const px0 = x0 + 22, px1 = x1 - 22, py0 = top + 20, py1 = bottom - 22
  out += rect(px0, py0, px1 - px0, py1 - py0, 'w1') + rect(px0 + 7, py0 + 7, px1 - px0 - 14, py1 - py0 - 14, 'w0 pf')
  for (const [a, b] of [[[px0, py0], [px0 + 7, py0 + 7]], [[px1, py0], [px1 - 7, py0 + 7]], [[px0, py1], [px0 + 7, py1 - 7]], [[px1, py1], [px1 - 7, py1 - 7]]] as const) out += line(a[0], a[1], b[0], b[1], 'w0')
  for (let y = py0 + 10; y < py1 - 8; y += 2.6) out += line(px0 + 9, y, px1 - 9, y + .4, 'w0 mu-gr')
  out += rect((px0 + px1) / 2 - 22, py0 + 18, 44, 14, 'w1 pf') + `<text x="${(px0 + px1) / 2}" y="${py0 + 27}" font-size="5" letter-spacing="1.8" text-anchor="middle">78 · RPM</text>`
  for (const [x, y] of [[px0 + 3.5, py0 + 3.5], [px1 - 3.5, py0 + 3.5], [px0 + 3.5, py1 - 3.5], [px1 - 3.5, py1 - 3.5]] as const) out += screw(x, y, 1.4, 40)
  out += path(pts([[x0 - 6, bottom], [x1 + 6, bottom], [br[0] + 6, br[1] + h], [br[0] + 6, br[1] + h + 8], [x1 + 6, bottom + 8], [x0 - 6, bottom + 8]]), 'w1 pf') + line(x1 + 6, bottom, x1 + 6, bottom + 8, 'w0') + line(x0 - 6, bottom + 4, x1 + 6, bottom + 4, 'w0')
  for (const x of [x0 - 2, x1 - 12]) out += path(`M${x} ${bottom + 8}L${x + 14} ${bottom + 8}L${x + 11} ${bottom + 15}L${x + 3} ${bottom + 15}Z`, 'w1 pf')
  const lip = (t: number) => pts([screenOf(-w - t, d + t), screenOf(-w - t, -d - t), screenOf(w + t, -d - t), screenOf(w + t, d + t)])
  out += path(lip(4), 'w1 pf') + path(lip(0), 'w2 pf') + path(lip(-5), 'w0')
  out += ticks(curve(screenOf(-w - 4, d + 4), [['L', screenOf(w + 4, d + 4)]]).every(2.2), 3, 'w0', 1.6, .3)
  return out + crank(fr, br, bottom)
}

/* The winding crank on the right face: a shaft out of the face, a crank arm down, a turned wooden handle; all in double lines */
function crank(fr: Pt, br: Pt, bottom: number) {
  const sx = (fr[0] + br[0]) / 2, sy = (fr[1] + br[1]) / 2 + (bottom - fr[1]) * .5, ex = sx + 22, ay = sy + 26
  let out = path(`M${r(sx - 4)} ${r(sy - 5)}L${r(sx + 2)} ${r(sy - 7)}L${r(sx + 2)} ${r(sy + 5)}L${r(sx - 4)} ${r(sy + 7)}Z`, 'w1 pf')
  out += dbl(`M${r(sx + 2)} ${r(sy)}L${r(ex)} ${r(sy)}`, 3.4, .3) + circle(ex, sy, 3.6, 'w1 pf') + circle(ex, sy, 1.2, 'w0')
  out += dbl(`M${r(ex)} ${r(sy + 2)}L${r(ex)} ${r(ay)}`, 3.6, .3) + circle(ex, ay, 2.8, 'w1 pf')
  const hx = ex + 3
  out += path(`M${hx} ${ay - 1.6}C${hx + 4} ${ay - 2} ${hx + 6} ${ay - 4.6} ${hx + 11} ${ay - 4.4}C${hx + 16} ${ay - 4.2} ${hx + 19} ${ay - 2.8} ${hx + 20} ${ay - 1.6}L${hx + 20} ${ay + 1.6}C${hx + 19} ${ay + 2.8} ${hx + 16} ${ay + 4.2} ${hx + 11} ${ay + 4.4}C${hx + 6} ${ay + 4.6} ${hx + 4} ${ay + 2} ${hx} ${ay + 1.6}Z`, 'w1 pf')
  for (let x = hx + 6; x < hx + 19; x += 1.6) out += line(x, ay - 2.8, x + .8, ay + 2.8, 'w0')
  out += line(hx + 4.6, ay - 2.6, hx + 4.6, ay + 2.6, 'w0') + circle(hx + 20.8, ay, 1, 'w1 pf')
  return out
}

/* ============================================================
   Deck plane · turntable, record, tone arm, soundbox
   ============================================================ */
function record() {
  let out = circle(0, 0, REC.outer + 6, 'w1 pf') + knurl(0, 0, REC.outer + 6, 90, 2.2)
  let grooves = circle(0, 0, REC.outer, 'w2 pf')
  for (let g = REC.inner, i = 0; g < REC.outer - 1; g += 2, i++) grooves += circle(0, 0, g, i % 3 ? 'w0' : 'w0 mu-gr')
  grooves += circle(0, 0, REC.label, 'w1 pf') + circle(0, 0, REC.label - 3, 'w0')
  grooves += `<text x="0" y="-10" font-size="5.6" letter-spacing="1.4" text-anchor="middle">LUMEN</text><text x="0" y="16" font-size="4.4" letter-spacing="1" text-anchor="middle">N° 78</text>`
  for (let a = 0; a < 360; a += 30) { const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180); grooves += line(c * (REC.label - 6), s * (REC.label - 6), c * (REC.label - 3.4), s * (REC.label - 3.4), 'w0') }
  grooves += line(REC.inner + 4, 0, REC.outer - 4, 0, 'w0 dash') + circle(0, 0, 2.4, 'w1 pf')
  return out + `<g class="${P}spin">${grooves}</g>`
}

/** The soundbox face in screen orientation, needle tip at (0, 0) */
function soundbox() {
  const cy = -15, R = 9.5
  let out = circle(0, cy, R, 'w1 pf') + circle(0, cy, R - 1.3, 'w0')
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + .2; out += circle(Math.cos(a) * (R - .7), cy + Math.sin(a) * (R - .7), .45, 'if ns') }
  for (const f of [.62, .44, .26]) out += circle(0, cy, R * f, 'w0')
  return out + circle(0, cy, 1.3, 'w1 pf') + line(0, cy, 0, -4, 'w1') + rect(-1.8, -5.4, 3.6, 3, 'w1 pf') + line(0, -2.4, 0, 0, 'w1')
}

function arm() {
  const rest = GRAMOPHONE_ARM.rest * Math.PI / 180
  let out = circle(PIVOT.x + Math.cos(rest) * ARM, PIVOT.y + Math.sin(rest) * ARM, 4.4, 'w1 pf')
  let a = path(`M0 -5L${ARM - 8} -2.6L${ARM - 8} 2.6L0 5Z`, 'w1 pf') + line(4, 0, ARM - 10, 0, 'w0')
  for (let x = 12; x < ARM - 14; x += 10) a += line(x, -4.2 + x / ARM * 1.8, x, 4.2 - x / ARM * 1.8, 'w0')
  a += circle(ARM - 6, 0, 3.4, 'w1 pf')
  a += `<g transform="translate(${ARM} 0)"><g class="${P}sb"><g transform="${UPRIGHT}">${soundbox()}</g></g></g>`
  return out + `<g transform="translate(${PIVOT.x} ${PIVOT.y})"><g class="${P}arm">${a}</g></g>` + circle(PIVOT.x, PIVOT.y, 9, 'w1 pf') + knurl(PIVOT.x, PIVOT.y, 9, 28, 1.6)
}

/* ============================================================
   Horn, swivel and bracket
   ============================================================ */
const SWIVEL = (() => { const p = screenOf(PIVOT.x, PIVOT.y); return { base: p, elbow: [p[0], p[1] - 20] as Pt } })()
const SPINE: HornSpine = { from: SWIVEL.elbow, mouth: [206, 104, -30], axis: [-.72, -.3, -.62], rise: 64, reach: 150 }
const CRADLE = (() => { const { p, radius } = hornAt(SPINE, .5); return { x: p[0], y: p[1], r: radius + 1.6 } })()

function swivel() {
  const [bx, by] = SWIVEL.base, [ex, ey] = SWIVEL.elbow
  return path(`M${r(bx - 7)} ${r(by)}L${r(ex - 4.4)} ${r(ey)}L${r(ex + 4.4)} ${r(ey)}L${r(bx + 7)} ${r(by)}Z`, 'w1 pf') + line(bx - 5, by - 6, bx + 5, by - 6, 'w0') + line(bx - 4, by - 12, bx + 4, by - 12, 'w0') + ellipse(ex, ey, 5.4, 2, 'w1 pf')
}

function bracket() {
  const foot = screenOf(CRADLE.x - DECK.cx + DECK.kx * -DECK.d, -DECK.d), { x: cx, y: cy, r: cr } = CRADLE
  let out = path(pts([[foot[0] - 7, foot[1] + 2], [foot[0] + 7, foot[1] + 2], [foot[0] + 5, foot[1] - 4], [foot[0] - 5, foot[1] - 4]]), 'w1 pf')
  out += dbl(`M${r(foot[0])} ${r(foot[1] - 4)}L${r(cx)} ${r(cy + cr + 3)}`, 3.2, .3)
  out += path(`M${r(cx - cr)} ${r(cy)}A${r(cr)} ${r(cr)} 0 0 0 ${r(cx + cr)} ${r(cy)}`, 'w2') + path(`M${r(cx - cr - 1.6)} ${r(cy)}A${r(cr + 1.6)} ${r(cr + 1.6)} 0 0 0 ${r(cx + cr + 1.6)} ${r(cy)}`, 'w0')
  return out + rect(cx - cr - 3, cy - 1.4, 3, 2.8, 'w1 pf') + rect(cx + cr, cy - 1.4, 3, 2.8, 'w1 pf') + screw(cx, cy + cr + 1.2, 1.4, 20)
}

/* DETAIL A: the soundbox at 3:1 — rim and its screws, the diaphragm's rings, stylus bar, needle clamp with its set screw, the needle in the groove */
function soundboxDetail() {
  const rest = GRAMOPHONE_ARM.rest * Math.PI / 180, tip = screenOf(PIVOT.x + Math.cos(rest) * ARM, PIVOT.y + Math.sin(rest) * ARM)
  const WIN = { x: 562, y: 136, r: 62 }, MARK = { x: tip[0], y: tip[1] - 12, r: WIN.r / 3 }
  const cx = WIN.x, cy = WIN.y - 8, R = 34
  let c = ''
  for (let y = WIN.y + 38; y < WIN.y + WIN.r; y += 2.2) c += line(WIN.x - WIN.r, y, WIN.x + WIN.r, y + .6, 'w0')
  c += dbl(`M${WIN.x + WIN.r} ${WIN.y - 54}C${cx + 30} ${cy - 60} ${cx + 4} ${cy - 54} ${cx} ${cy - R}`, 7, .3)
  c += circle(cx, cy, R + 3, 'w2 pf') + circle(cx, cy, R, 'w1') + circle(cx, cy, R - 2.4, 'w0')
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + .3; c += screw(cx + Math.cos(a) * (R + .6), cy + Math.sin(a) * (R + .6), 1.4, i * 31) }
  for (const f of [.8, .66, .52, .38, .24]) c += circle(cx, cy, R * f, 'w0')
  c += circle(cx, cy, 4, 'w1 pf') + circle(cx, cy, 1.4, 'if ns')
  c += dbl(`M${cx} ${cy}L${cx} ${cy + R + 8}`, 2.6, .3) + rect(cx - 5, cy + R + 6, 10, 10, 'w1 pf') + screw(cx + 7.5, cy + R + 11, 2, 60)
  c += path(`M${cx - 1.4} ${cy + R + 16}L${cx + 1.4} ${cy + R + 16}L${cx} ${WIN.y + 39}Z`, 'w1 pf')
  return detail(`${P}da`, MARK, WIN, 'DETAIL A · 3:1', c)
}

function rising() {
  return (['e', 'q', 'b', 'h', 'e'] as const).map((kind, i) => `<g class="${P}n" style="animation-delay:${r(i * .64)}s">${note(kind, 120 - (i % 2) * 10, 112 + (i % 3) * 14, .95)}</g>`).join('')
}

export function gramophoneSvg() {
  const sideClip = pts([screenOf(DECK.w, DECK.d), screenOf(DECK.w, -DECK.d), [screenOf(DECK.w, -DECK.d)[0], screenOf(DECK.w, -DECK.d)[1] + DECK.h], [screenOf(DECK.w, DECK.d)[0], screenOf(DECK.w, DECK.d)[1] + DECK.h]])
  const defs = `<defs>${shadowDef(`${P}sh`)}<clipPath id="${P}side"><path d="${sideClip}"/></clipPath></defs>`
  const body = defs + shadow(`${P}sh`, DECK.cx + 16, DECK.cy + DECK.d * DECK.ky + DECK.h + 16, 170, 12) + cabinet() +
    `<g transform="${MATRIX}">${record()}</g>` + swivel() + hornSvg(SPINE) + bracket() + `<g transform="${MATRIX}">${arm()}</g>` + soundboxDetail() + rising() + plate(560, 386, 'GRAMMOFONO · III')
  return `<svg class="mu mu-gramophone" viewBox="0 0 640 400" role="img" aria-hidden="true">${body}</svg>`
}

export const GRAMOPHONE_CSS = `
@keyframes ${P}turn { to { transform: rotate(360deg); } }
@keyframes ${P}up { 0% { opacity: 0; transform: translate(0, 0); } 10% { opacity: 1; } 60% { opacity: .8; } 80%, 100% { opacity: 0; transform: translate(-56px, -60px); } }
.mu-gramophone .${P}n { opacity: 0; }
.mu-gramophone .${P}arm { transform: rotate(${r(GRAMOPHONE_ARM.rest)}deg); transition: transform 900ms cubic-bezier(.32,.72,0,1); }
.mu-gramophone .${P}sb { transform: rotate(${r(-GRAMOPHONE_ARM.rest)}deg); transition: transform 900ms cubic-bezier(.32,.72,0,1); }
.iso-host:hover .mu-gramophone .${P}arm { transform: rotate(${r(GRAMOPHONE_ARM.outer)}deg); }
.iso-host:hover .mu-gramophone .${P}sb { transform: rotate(${r(-GRAMOPHONE_ARM.outer)}deg); }
.iso-host[data-open] .mu-gramophone .${P}arm { transform: rotate(${r(GRAMOPHONE_ARM.inner)}deg); transition: transform 7s linear; }
.iso-host[data-open] .mu-gramophone .${P}sb { transform: rotate(${r(-GRAMOPHONE_ARM.inner)}deg); transition: transform 7s linear; }
.iso-host:hover .mu-gramophone .${P}spin, .iso-host[data-open] .mu-gramophone .${P}spin { animation: ${P}turn 1.6s linear infinite; }
.iso-host:hover .mu-gramophone .${P}n { animation: ${P}up 3.2s cubic-bezier(.3,.6,.4,1) infinite; }
`
