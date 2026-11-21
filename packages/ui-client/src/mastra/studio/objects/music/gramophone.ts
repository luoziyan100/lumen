/**
 * [INPUT]: the engraving kit of ./line.ts
 * [OUTPUT]: gramophoneSvg(): GRAMMOFONO · III, a horn gramophone (640×400) for the empty Takeaways view; GRAMOPHONE_CSS; GRAMOPHONE_ARM (pivot, arm length and the solved angles, for the tests)
 * [POS]: music object M3, the counterpart of the press. The deck top is drawn in plan and projected by one transform, so the record, the turntable, the arm and the top face share a plane.
 *        The arm turns about its pivot; its angle for any groove radius is solved from two circles (pivot, ARM) and (centre, radius), so the needle lands on the groove, never beside it.
 *        The deck plane is cabinet oblique (matrix: depth recedes up-right by kx, ky), the same projection as the top face and the right face with its winding crank.
 *        At rest the arm sits on its post off the record. Hover lowers it onto the outer groove, spins the record and sends notes out of the horn into the blank upper left.
 *        Click lets the needle walk inward to the run-out groove
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { circle, curve, dbl, ellipse, hatch, knurl, line, note, path, plate, r, rect, screw, shadow, shadowDef, ticks } from './line.ts'

const P = 'gr-'
const DECK = { cx: 380, cy: 250, kx: .32, ky: .34, w: 132, d: 124, h: 62 }
const REC = { outer: 98, inner: 44, label: 30 }
const PIVOT = { x: 110, y: -92 }, ARM = 132
/** The arm angle (degrees, from +x about the pivot) that puts the needle on a groove of radius rho */
function armAngle(rho: number) {
  const dx = -PIVOT.x, dy = -PIVOT.y, dist = Math.hypot(dx, dy)
  const a = Math.acos((ARM * ARM + dist * dist - rho * rho) / (2 * ARM * dist))
  return (Math.atan2(dy, dx) - a) * 180 / Math.PI
}
export const GRAMOPHONE_ARM = { pivot: PIVOT, length: ARM, rest: armAngle(128), outer: armAngle(REC.outer - 2), inner: armAngle(REC.inner + 2), radius: REC }
const plane = (inner: string) => `<g transform="matrix(1 0 ${-DECK.kx} ${DECK.ky} ${DECK.cx} ${DECK.cy})">${inner}</g>`
const screenOf = (x: number, y: number): [number, number] => [DECK.cx + x - y * DECK.kx, DECK.cy + y * DECK.ky]

function cabinet() {
  const { w, d, h } = DECK
  const fl = screenOf(-w, d), fr = screenOf(w, d), br = screenOf(w, -d), bl = screenOf(-w, -d)
  const front = fl[1], bottom = front + h, x0 = fl[0], x1 = fr[0]
  let out = path(`M${fr.join(' ')}L${br.join(' ')}L${br[0]} ${br[1] + h}L${fr[0]} ${bottom}Z`, 'w2 pf') + hatch(`${P}side`, [fr[0], br[1], br[0] - fr[0], bottom - br[1]], 90, 1.8)
  out += rect(x0, front, x1 - x0, h, 'w2 pf') + rect(x0 + 4, front + 4, x1 - x0 - 8, h - 8, 'w0') + rect(x0 + 6, front + 6, x1 - x0 - 12, h - 12, 'w0')
  for (let x = x0 + 10; x < x1 - 8; x += 3) out += line(x, front + 8, x, bottom - 8, 'w0 mu-gr')
  const mx = (x0 + x1) / 2
  out += rect(mx - 40, front + 18, 80, 26, 'w1 pf') + rect(mx - 37, front + 21, 74, 20, 'w0')
  out += `<text x="${mx}" y="${front + 33}" font-size="5.4" letter-spacing="2" text-anchor="middle">78 · RPM</text>`
  for (const x of [x0 + 14, x1 - 14]) out += screw(x, front + 14, 1.6, 40) + screw(x, bottom - 14, 1.6, 100)
  out += path(`M${x0 - 4} ${bottom}L${x1 + 4} ${bottom}L${br[0] + 4} ${br[1] + h}L${br[0] + 4} ${br[1] + h + 6}L${x1 + 4} ${bottom + 6}L${x0 - 4} ${bottom + 6}Z`, 'w1 pf') + line(x1 + 4, bottom, x1 + 4, bottom + 6, 'w0')
  for (const x of [x0 + 4, x1 - 18]) out += path(`M${x} ${bottom + 6}L${x + 14} ${bottom + 6}L${x + 11} ${bottom + 14}L${x + 3} ${bottom + 14}Z`, 'w1 pf')
  out += path(`M${fl.join(' ')}L${bl.join(' ')}L${br.join(' ')}L${fr.join(' ')}Z`, 'w2 pf')
  const lip = (t: number) => { const a = screenOf(-w + t, d - t), b = screenOf(-w + t, -d + t), c = screenOf(w - t, -d + t), e = screenOf(w - t, d - t); return `M${a.join(' ')}L${b.join(' ')}L${c.join(' ')}L${e.join(' ')}Z` }
  out += path(lip(5), 'w0') + path(lip(8), 'w0')
  out += ticks(curve(fl, [['L', fr]]).every(2.4), 2.4, 'w0', 1.4, .6)
  return out + crank(fr, br, bottom)
}

/* The winding crank on the right face: a shaft out of the face, a crank arm down, a turned wooden handle; all in double lines */
function crank(fr: [number, number], br: [number, number], bottom: number) {
  const sx = (fr[0] + br[0]) / 2, sy = (fr[1] + br[1]) / 2 + (bottom - fr[1]) * .5, ex = sx + 20, ay = sy + 24
  let out = path(`M${r(sx - 4)} ${r(sy - 5)}L${r(sx + 2)} ${r(sy - 7)}L${r(sx + 2)} ${r(sy + 5)}L${r(sx - 4)} ${r(sy + 7)}Z`, 'w1 pf')
  out += dbl(`M${r(sx + 2)} ${r(sy)}L${r(ex)} ${r(sy)}`, 3.2, .3) + circle(ex, sy, 3.4, 'w1 pf') + circle(ex, sy, 1.2, 'w0')
  out += dbl(`M${r(ex)} ${r(sy + 2)}L${r(ex)} ${r(ay)}`, 3.4, .3) + circle(ex, ay, 2.6, 'w1 pf')
  const hx = ex + 3
  out += path(`M${hx} ${ay - 1.6}C${hx + 4} ${ay - 2} ${hx + 6} ${ay - 4.4} ${hx + 10} ${ay - 4.2}C${hx + 15} ${ay - 4} ${hx + 18} ${ay - 2.8} ${hx + 19} ${ay - 1.6}L${hx + 19} ${ay + 1.6}C${hx + 18} ${ay + 2.8} ${hx + 15} ${ay + 4} ${hx + 10} ${ay + 4.2}C${hx + 6} ${ay + 4.4} ${hx + 4} ${ay + 2} ${hx} ${ay + 1.6}Z`, 'w1 pf')
  for (let x = hx + 6; x < hx + 18; x += 1.6) out += line(x, ay - 2.6, x + .8, ay + 2.6, 'w0')
  out += line(hx + 4.6, ay - 2.6, hx + 4.6, ay + 2.6, 'w0') + circle(hx + 19.8, ay, 1, 'w1 pf')
  return out
}

function record() {
  let out = circle(0, 0, REC.outer + 8, 'w1 pf') + knurl(0, 0, REC.outer + 8, 90, 2.2)
  let grooves = circle(0, 0, REC.outer, 'w2 pf')
  for (let g = REC.inner, i = 0; g < REC.outer - 1; g += 2, i++) grooves += circle(0, 0, g, i % 3 ? 'w0' : 'w0 mu-gr')
  grooves += circle(0, 0, REC.label, 'w1 pf') + circle(0, 0, REC.label - 3, 'w0')
  grooves += `<text x="0" y="-12" font-size="6" letter-spacing="1.6" text-anchor="middle">LUMEN</text><text x="0" y="18" font-size="4.6" letter-spacing="1" text-anchor="middle">N° 78</text>`
  for (let a = 0; a < 360; a += 30) { const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180); grooves += line(c * (REC.label - 6), s * (REC.label - 6), c * (REC.label - 3.4), s * (REC.label - 3.4), 'w0') }
  grooves += line(REC.inner + 4, 0, REC.outer - 4, 0, 'w0 dash') + circle(0, 0, 2.6, 'w1 pf')
  out += `<g class="${P}spin">${grooves}</g>`
  return out
}

function arm() {
  let out = circle(PIVOT.x, PIVOT.y, 13, 'w1 pf') + knurl(PIVOT.x, PIVOT.y, 13, 36, 1.8) + circle(PIVOT.x, PIVOT.y, 7, 'w1 pf')
  const [rx, ry] = [PIVOT.x + Math.cos(GRAMOPHONE_ARM.rest * Math.PI / 180) * ARM, PIVOT.y + Math.sin(GRAMOPHONE_ARM.rest * Math.PI / 180) * ARM]
  out += circle(rx, ry, 5, 'w1 pf') + circle(rx, ry, 2, 'w0')
  let a = path(`M0 -4L${ARM - 26} -2.4L${ARM - 26} 2.4L0 4Z`, 'w1 pf') + line(4, 0, ARM - 28, 0, 'w0')
  for (let x = 10; x < ARM - 30; x += 8) a += line(x, -3.4, x, 3.4, 'w0')
  a += circle(ARM - 14, 0, 13, 'w1 pf') + circle(ARM - 14, 0, 10, 'w0') + knurl(ARM - 14, 0, 10, 28, 1.4) + circle(ARM - 14, 0, 4, 'w1 pf')
  a += path(`M${ARM - 4} -2L${ARM + 2} 0L${ARM - 4} 2Z`, 'if ns')
  out += `<g transform="translate(${PIVOT.x} ${PIVOT.y})"><g class="${P}arm">${a}</g></g>`
  out += circle(PIVOT.x, PIVOT.y, 4, 'w1 pf') + circle(PIVOT.x, PIVOT.y, 1.4, 'if ns')
  return out
}

const BELL = { cx: 268, cy: 108, rx: 112, ry: 78, rot: -14 }
const bellAt = (deg: number, scale = 1): [number, number] => {
  const t = deg * Math.PI / 180, c = Math.cos(BELL.rot * Math.PI / 180), s = Math.sin(BELL.rot * Math.PI / 180)
  const x = Math.cos(t) * BELL.rx * scale, y = Math.sin(t) * BELL.ry * scale
  return [BELL.cx + x * c - y * s, BELL.cy + x * s + y * c]
}

function horn() {
  const [tx, ty] = screenOf(PIVOT.x, PIVOT.y)
  const throatTop: [number, number] = [tx - 4, ty - 26], throatBot: [number, number] = [tx + 5, ty - 18]
  const up = bellAt(-74), down = bellAt(62)
  let out = path(`M${tx - 3} ${ty}L${tx - 4} ${ty - 22}L${tx + 5} ${ty - 22}L${tx + 4} ${ty}Z`, 'w1 pf') + rect(tx - 7, ty - 6, 14, 5, 'w1 pf')
  const outline = `M${throatTop.join(' ')}C${tx - 20} ${ty - 70} ${up[0] + 120} ${up[1] + 10} ${up[0]} ${up[1]}` +
    `A${BELL.rx} ${BELL.ry} ${BELL.rot} 0 1 ${down[0]} ${down[1]}C${down[0] + 90} ${down[1] - 4} ${tx - 10} ${ty - 30} ${throatBot.join(' ')}Z`
  out += `<path d="${outline}" class="w2 pf"/>`
  for (let deg = -60; deg <= 50; deg += 14) {
    const [x, y] = bellAt(deg)
    out += path(`M${tx} ${ty - 22}C${tx - 30} ${ty - 50} ${x + 60} ${y + (y - BELL.cy) * .1} ${x} ${y}`, deg % 28 === 0 ? 'w1' : 'w0')
  }
  out += hatch(`${P}horn`, [BELL.cx, BELL.cy - 100, 260, 200], 62, 4.4)
  out += ellipse(BELL.cx, BELL.cy, BELL.rx, BELL.ry, 'w2 pf', BELL.rot) + ellipse(BELL.cx, BELL.cy, BELL.rx - 3, BELL.ry - 3, 'w0', BELL.rot)
  for (const [s, dx] of [[.78, 16], [.58, 30], [.4, 42], [.24, 52]] as const) out += ellipse(BELL.cx + dx, BELL.cy + dx * .2, BELL.rx * s, BELL.ry * s, 'w0', BELL.rot)
  out += hatch(`${P}throat`, [BELL.cx + 20, BELL.cy - 30, 70, 60], -30, 1.1) + ellipse(BELL.cx + 58, BELL.cy + 11, BELL.rx * .1, BELL.ry * .1, 'if ns', BELL.rot)
  for (let deg = 100; deg <= 260; deg += 18) {
    const [x, y] = bellAt(deg, .98), [x2, y2] = bellAt(deg, .3)
    out += line(x, y, x2 + 52, y2 + 10, 'w0')
  }
  return out
}

function rising() {
  return (['e', 'q', 'b', 'h', 'e'] as const).map((kind, i) => `<g class="${P}n" style="animation-delay:${r(i * .64)}s">${note(kind, 148 - (i % 2) * 10, 110 + (i % 3) * 14, .95)}</g>`).join('')
}

export function gramophoneSvg() {
  const defs = `<defs>${shadowDef(`${P}sh`)}` +
    `<clipPath id="${P}horn"><path d="M${screenOf(PIVOT.x, PIVOT.y)[0] - 4} ${screenOf(PIVOT.x, PIVOT.y)[1] - 26}C${screenOf(PIVOT.x, PIVOT.y)[0] - 20} ${screenOf(PIVOT.x, PIVOT.y)[1] - 70} ${bellAt(-74)[0] + 120} ${bellAt(-74)[1] + 10} ${bellAt(-74)[0]} ${bellAt(-74)[1]}L${bellAt(62)[0]} ${bellAt(62)[1]}C${bellAt(62)[0] + 90} ${bellAt(62)[1] - 4} ${screenOf(PIVOT.x, PIVOT.y)[0] - 10} ${screenOf(PIVOT.x, PIVOT.y)[1] - 30} ${screenOf(PIVOT.x, PIVOT.y)[0] + 5} ${screenOf(PIVOT.x, PIVOT.y)[1] - 18}Z"/></clipPath>` +
    `<clipPath id="${P}side"><path d="M${screenOf(DECK.w, DECK.d).join(' ')}L${screenOf(DECK.w, -DECK.d).join(' ')}L${screenOf(DECK.w, -DECK.d)[0]} ${screenOf(DECK.w, -DECK.d)[1] + DECK.h}L${screenOf(DECK.w, DECK.d)[0]} ${screenOf(DECK.w, DECK.d)[1] + DECK.h}Z"/></clipPath>` +
    `<clipPath id="${P}throat"><ellipse cx="${BELL.cx + 52}" cy="${BELL.cy + 10.4}" rx="${r(BELL.rx * .24)}" ry="${r(BELL.ry * .24)}" transform="rotate(${BELL.rot} ${BELL.cx + 52} ${BELL.cy + 10.4})"/></clipPath></defs>`
  const deck = plane(record() + arm())
  const body = defs + shadow(`${P}sh`, DECK.cx + 10, DECK.cy + DECK.d * DECK.ky + DECK.h + 14, 180, 12) + cabinet() + deck + horn() + rising() + plate(560, 386, 'GRAMMOFONO · III')
  return `<svg class="mu mu-gramophone" viewBox="0 0 640 400" role="img" aria-hidden="true">${body}</svg>`
}

export const GRAMOPHONE_CSS = `
@keyframes ${P}turn { to { transform: rotate(360deg); } }
@keyframes ${P}up { 0% { opacity: 0; transform: translate(0, 0); } 10% { opacity: 1; } 60% { opacity: .8; } 80%, 100% { opacity: 0; transform: translate(-70px, -64px); } }
.mu-gramophone .${P}n { opacity: 0; }
.mu-gramophone .${P}arm { transform: rotate(${r(GRAMOPHONE_ARM.rest)}deg); transition: transform 900ms cubic-bezier(.32,.72,0,1); }
.iso-host:hover .mu-gramophone .${P}arm { transform: rotate(${r(GRAMOPHONE_ARM.outer)}deg); }
.iso-host[data-open] .mu-gramophone .${P}arm { transform: rotate(${r(GRAMOPHONE_ARM.inner)}deg); transition: transform 7s linear; }
.iso-host:hover .mu-gramophone .${P}spin, .iso-host[data-open] .mu-gramophone .${P}spin { animation: ${P}turn 1.6s linear infinite; }
.iso-host:hover .mu-gramophone .${P}n { animation: ${P}up 3.2s cubic-bezier(.3,.6,.4,1) infinite; }
`
