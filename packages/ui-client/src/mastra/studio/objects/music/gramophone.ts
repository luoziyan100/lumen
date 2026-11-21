/**
 * [INPUT]: the engraving kit of ./line.ts
 * [OUTPUT]: gramophoneSvg(): GRAMMOFONO · III, a horn gramophone (640×400) for the empty Takeaways view; GRAMOPHONE_CSS; GRAMOPHONE_ARM (pivot, arm length and the solved angles, for the tests)
 * [POS]: music object M3, the counterpart of the press. The deck top is drawn in plan and flattened by one transform (scale 1, DECK.k), so the record, the turntable and the arm share a plane.
 *        The arm turns about its pivot; its angle for any groove radius is solved from two circles (pivot, ARM) and (centre, radius), so the needle lands on the groove, never beside it.
 *        At rest the arm sits on its post off the record. Hover lowers it onto the outer groove, spins the record and sends notes out of the horn into the blank upper left.
 *        Click lets the needle walk inward to the run-out groove
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { circle, curve, ellipse, hatch, knurl, line, note, path, plate, r, rect, screw, shadow, shadowDef, ticks } from './line.ts'

const P = 'gr-'
const DECK = { cx: 392, cy: 252, k: .35, w: 132, d: 124 }
const REC = { outer: 98, inner: 44, label: 30 }
const PIVOT = { x: 110, y: -92 }, ARM = 132
/** The arm angle (degrees, from +x about the pivot) that puts the needle on a groove of radius rho */
function armAngle(rho: number) {
  const dx = -PIVOT.x, dy = -PIVOT.y, dist = Math.hypot(dx, dy)
  const a = Math.acos((ARM * ARM + dist * dist - rho * rho) / (2 * ARM * dist))
  return (Math.atan2(dy, dx) - a) * 180 / Math.PI
}
export const GRAMOPHONE_ARM = { pivot: PIVOT, length: ARM, rest: armAngle(128), outer: armAngle(REC.outer - 2), inner: armAngle(REC.inner + 2), radius: REC }
const plane = (inner: string) => `<g transform="translate(${DECK.cx} ${DECK.cy}) scale(1 ${DECK.k})">${inner}</g>`
const screenOf = (x: number, y: number): [number, number] => [DECK.cx + x, DECK.cy + y * DECK.k]

function cabinet() {
  const { cx, cy, k, w, d } = DECK
  const top = cy - d * k, front = cy + d * k, bottom = front + 62
  let out = rect(cx - w, front, w * 2, bottom - front, 'w2 pf') + rect(cx - w + 4, front + 4, w * 2 - 8, bottom - front - 8, 'w0') + rect(cx - w + 6, front + 6, w * 2 - 12, bottom - front - 12, 'w0')
  for (let x = cx - w + 10; x < cx + w - 8; x += 3) out += line(x, front + 8, x, bottom - 8, 'w0 mu-gr')
  out += rect(cx - 40, front + 18, 80, 26, 'w1 pf') + rect(cx - 37, front + 21, 74, 20, 'w0')
  out += `<text x="${cx}" y="${front + 33}" font-size="5.4" letter-spacing="2" text-anchor="middle">78 · RPM</text>`
  for (const x of [cx - w + 14, cx + w - 14]) out += screw(x, front + 14, 1.6, 40) + screw(x, bottom - 14, 1.6, 100)
  out += rect(cx - w - 4, bottom, w * 2 + 8, 6, 'w1 pf')
  for (const x of [cx - w + 4, cx + w - 18]) out += path(`M${x} ${bottom + 6}L${x + 14} ${bottom + 6}L${x + 11} ${bottom + 14}L${x + 3} ${bottom + 14}Z`, 'w1 pf')
  out += path(`M${cx - w} ${front}L${cx - w} ${top}L${cx + w} ${top}L${cx + w} ${front}Z`, 'w2 pf')
  out += line(cx - w + 4, top + 3, cx + w - 4, top + 3, 'w0') + line(cx - w + 3, top + 3, cx - w + 3, front - 2, 'w0') + line(cx + w - 3, top + 3, cx + w - 3, front - 2, 'w0')
  out += ticks(curve([cx - w, front], [['L', [cx + w, front]]]).every(2.4), 2.4, 'w0', 1.4, .6)
  const cr = [cx + w + 2, front + 22] as const
  out += rect(cr[0], cr[1] - 3, 10, 6, 'w1 pf') + line(cr[0] + 10, cr[1], cr[0] + 22, cr[1] + 18, 'w2') + line(cr[0] + 22, cr[1] + 18, cr[0] + 30, cr[1] + 18, 'w2') + rect(cr[0] + 28, cr[1] + 12, 6, 13, 'w1 pf', 2)
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
  out += path(`M${tx + 30} ${ty + 4}L${tx + 30} ${ty - 70}C${tx + 30} ${ty - 96} ${tx - 20} ${ty - 110} ${tx - 60} ${ty - 106}`, 'w1') + circle(tx + 30, ty + 4, 2.6, 'w1 pf')
  return out
}

function rising() {
  return (['e', 'q', 'b', 'h', 'e'] as const).map((kind, i) => `<g class="${P}n" style="animation-delay:${r(i * .64)}s">${note(kind, 148 - (i % 2) * 10, 110 + (i % 3) * 14, .95)}</g>`).join('')
}

export function gramophoneSvg() {
  const defs = `<defs>${shadowDef(`${P}sh`)}` +
    `<clipPath id="${P}horn"><path d="M${screenOf(PIVOT.x, PIVOT.y)[0] - 4} ${screenOf(PIVOT.x, PIVOT.y)[1] - 26}C${screenOf(PIVOT.x, PIVOT.y)[0] - 20} ${screenOf(PIVOT.x, PIVOT.y)[1] - 70} ${bellAt(-74)[0] + 120} ${bellAt(-74)[1] + 10} ${bellAt(-74)[0]} ${bellAt(-74)[1]}L${bellAt(62)[0]} ${bellAt(62)[1]}C${bellAt(62)[0] + 90} ${bellAt(62)[1] - 4} ${screenOf(PIVOT.x, PIVOT.y)[0] - 10} ${screenOf(PIVOT.x, PIVOT.y)[1] - 30} ${screenOf(PIVOT.x, PIVOT.y)[0] + 5} ${screenOf(PIVOT.x, PIVOT.y)[1] - 18}Z"/></clipPath>` +
    `<clipPath id="${P}throat"><ellipse cx="${BELL.cx + 52}" cy="${BELL.cy + 10.4}" rx="${r(BELL.rx * .24)}" ry="${r(BELL.ry * .24)}" transform="rotate(${BELL.rot} ${BELL.cx + 52} ${BELL.cy + 10.4})"/></clipPath></defs>`
  const deck = plane(record() + arm())
  const body = defs + shadow(`${P}sh`, DECK.cx, DECK.cy + DECK.d * DECK.k + 76, 170, 12) + cabinet() + deck + horn() + rising() + plate(560, 386, 'GRAMMOFONO · III')
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
