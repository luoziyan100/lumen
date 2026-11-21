/**
 * [INPUT]: the engraving kit of ./line.ts
 * [OUTPUT]: metronomeSvg(): METRONOMO · VIII, a pyramid metronome with its front cover off (640×400) for the empty All view; METRONOME_CSS
 * [POS]: music object M8, the counterpart of the type case. The rod turns about the pivot (PIVOT) in front of a scale engraved with Maelzel's marks (40–208);
 *        the slider's height on the rod sets the tempo, and the swing period is 60/bpm per beat. Hover swings it at the slider's tempo (72) with a note per beat at each end of the swing.
 *        Click slides the weight down to 120 and the swing quickens. Behind the scale, the clockwork shows as hidden (dashed) wheels; a side elevation sits at the right
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { circle, curve, dbl, hatch, knurl, line, note, path, plate, r, rect, screw, shadow, shadowDef, ticks } from './line.ts'

const P = 'mt-'
const CX = 250, BASE = 352, TOP = 58, PIVOT = 300, ROD = 232
const MARKS = [40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63, 66, 69, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 126, 132, 138, 144, 152, 160, 168, 176, 184, 192, 200, 208]
const SCALE = { top: 92, bottom: 262 }
const markY = (bpm: number) => SCALE.top + MARKS.indexOf(bpm) / (MARKS.length - 1) * (SCALE.bottom - SCALE.top)
const SLOW = 72, FAST = 120, SWING = 21
const halfW = (y: number) => 18 + (y - TOP) / (BASE - 14 - TOP) * 62

function caseFront() {
  const yb = BASE - 14
  const face = `M${CX - 18} ${TOP}L${CX + 18} ${TOP}L${CX + halfW(yb)} ${yb}L${CX - halfW(yb)} ${yb}Z`
  let out = path(`M${CX + 18} ${TOP}L${CX + 30} ${TOP + 6}L${CX + halfW(yb) + 14} ${yb}L${CX + halfW(yb)} ${yb}Z`, 'w1 pf') + hatch(`${P}side`, [CX, TOP, 120, yb - TOP], 74, 1.7)
  out += `<path d="${face}" class="w2 pf"/>`
  let grain = ''
  for (let x = CX - 80; x < CX + 80; x += 3.1) grain += line(x, TOP, x + (x - CX) * .06, yb, 'w0 mu-gr')
  out += `<g clip-path="url(#${P}face)">${grain}</g>`
  const win = `M${CX - 11} ${TOP + 22}L${CX + 11} ${TOP + 22}L${CX + halfW(yb - 32) - 16} ${yb - 32}L${CX - halfW(yb - 32) + 16} ${yb - 32}Z`
  out += dbl(win, 3.2, .3) + `<path d="${win}" class="w0 pf"/>`
  for (let y = TOP + 26; y < yb - 34; y += 2.3) out += line(CX - halfW(y) + 18 + (y - TOP) * .0, y, CX + halfW(y) - 18, y, 'w0 mu-gr')
  const edge = curve([CX - halfW(yb), yb], [['L', [CX - 18, TOP]], ['L', [CX + 18, TOP]], ['L', [CX + halfW(yb), yb]]])
  out += `<g clip-path="url(#${P}face)">${ticks(edge.every(2), 2.6, 'w0', 1.6, .8)}</g>`
  out += path(`M${CX - 18} ${TOP}L${CX} ${TOP - 16}L${CX + 18} ${TOP}`, 'w1 pf') + path(`M${CX + 18} ${TOP}L${CX} ${TOP - 16}L${CX + 30} ${TOP + 6}Z`, 'w1 pf') + circle(CX, TOP - 17, 2, 'w1 pf')
  out += rect(CX - halfW(yb) - 8, yb, halfW(yb) * 2 + 16, 6, 'w2 pf') + rect(CX - halfW(yb) - 12, yb + 6, halfW(yb) * 2 + 24, 8, 'w1 pf')
  out += path(`M${CX + halfW(yb) + 8} ${yb}L${CX + halfW(yb) + 20} ${yb - 4}L${CX + halfW(yb) + 24} ${yb + 2}L${CX + halfW(yb) + 12} ${yb + 6}Z`, 'w1 pf')
  for (let x = CX - halfW(yb) - 10; x < CX + halfW(yb) + 12; x += 2.4) out += line(x, yb + 7.6, x, yb + 12.4, 'w0')
  for (const x of [CX - halfW(yb) - 4, CX + halfW(yb) + 4]) out += screw(x, yb + 3, 1.5, 40)
  return out
}

function hidden() {
  let out = ''
  for (const [x, y, rad, n] of [[CX, PIVOT + 4, 14, 30], [CX - 22, PIVOT + 16, 9, 20], [CX + 20, PIVOT + 18, 7, 16]] as const) {
    out += circle(x, y, rad, 'w0 dash') + circle(x, y, rad * .3, 'w0 dash')
    for (let i = 0; i < n; i += 2) { const a = i / n * Math.PI * 2; out += line(x + Math.cos(a) * rad, y + Math.sin(a) * rad, x + Math.cos(a) * (rad + 1.6), y + Math.sin(a) * (rad + 1.6), 'w0') }
  }
  return out
}

function scale() {
  let out = rect(CX - 9, SCALE.top - 8, 18, SCALE.bottom - SCALE.top + 16, 'w1 pf') + rect(CX - 7.4, SCALE.top - 6.4, 14.8, SCALE.bottom - SCALE.top + 12.8, 'w0')
  MARKS.forEach((bpm, i) => {
    const y = markY(bpm), left = i % 2 === 0
    out += line(left ? CX - 7.4 : CX + 1.6, y, left ? CX - 1.6 : CX + 7.4, y, i % 4 === 0 ? 'w1' : 'w0')
    if (i % 2 === 0) out += `<text x="${CX - 10}" y="${r(y + 1.3)}" font-size="3.6" text-anchor="end">${bpm}</text>`
    else out += `<text x="${CX + 10}" y="${r(y + 1.3)}" font-size="3.6">${bpm}</text>`
  })
  return out
}

function rod() {
  const tip = PIVOT - ROD
  let out = line(CX, PIVOT + 30, CX, tip, 'w2') + line(CX, PIVOT + 28, CX, tip + 2, 'w0 pw')
  out += circle(CX, tip, 2.2, 'w1 pf') + path(`M${CX - 7} ${PIVOT + 30}L${CX + 7} ${PIVOT + 30}L${CX + 5} ${PIVOT + 40}L${CX - 5} ${PIVOT + 40}Z`, 'w1 pf') + line(CX - 5, PIVOT + 34, CX + 5, PIVOT + 34, 'w0')
  out += circle(CX, PIVOT, 4, 'w1 pf') + circle(CX, PIVOT, 1.4, 'if ns')
  const y = markY(SLOW)
  let weight = path(`M${CX - 7} ${y - 8}L${CX + 7} ${y - 8}L${CX + 10} ${y + 8}L${CX - 10} ${y + 8}Z`, 'w1 pf')
  for (let k = -6; k <= 6; k += 1.5) weight += line(CX + k * .9, y - 7, CX + k * 1.25, y + 7, 'w0')
  weight += line(CX - 10, y + 8, CX + 10, y + 8, 'w2') + screw(CX + 12.5, y, 2, 50)
  out += `<g class="${P}weight">${weight}</g>`
  return `<g class="${P}rod" style="transform-box:view-box;transform-origin:${CX}px ${PIVOT}px">${out}</g>`
}

function elevation() {
  const x0 = 470, yb = BASE - 14, h = yb - TOP
  let out = `<text x="${x0 - 10}" y="${TOP - 6}" font-size="4" letter-spacing="1">ELEV · C</text>`
  out += path(`M${x0} ${yb}L${x0 + 20} ${TOP}L${x0 + 34} ${TOP}L${x0 + 66} ${yb}Z`, 'w1 pf') + path(`M${x0 + 20} ${TOP}L${x0 + 27} ${TOP - 16}L${x0 + 34} ${TOP}`, 'w1 pf')
  out += line(x0 + 4, yb - 8, x0 + 22, TOP + 6, 'w0') + rect(x0 - 8, yb, 82, 6, 'w2 pf') + rect(x0 - 12, yb + 6, 90, 8, 'w1 pf')
  out += circle(x0 + 52, yb - 40, 6, 'w1 pf') + knurl(x0 + 52, yb - 40, 6, 18, 1.2) + line(x0 + 58, yb - 40, x0 + 74, yb - 40, 'w1') + path(`M${x0 + 74} ${yb - 40}C${x0 + 80} ${yb - 52} ${x0 + 88} ${yb - 46} ${x0 + 84} ${yb - 40}C${x0 + 88} ${yb - 34} ${x0 + 80} ${yb - 28} ${x0 + 74} ${yb - 40}Z`, 'w1 pf')
  for (let y = TOP + 8; y < yb; y += 6) out += line(x0 + 66 - (yb - y) * 46 / h + 3, y, x0 + 66 - (yb - y) * 46 / h + 7, y + 3, 'w0')
  const dx = x0 + 104
  out += line(dx, TOP - 16, dx, yb + 14, 'w0') + line(dx - 3, TOP - 16, dx + 3, TOP - 16, 'w0') + line(dx - 3, yb + 14, dx + 3, yb + 14, 'w0')
  out += `<rect x="${dx - 4}" y="${(TOP + yb) / 2 - 10}" width="8" height="20" class="pf ns"/><text x="${dx + 1.4}" y="${(TOP + yb) / 2}" font-size="4.6" letter-spacing="1" text-anchor="middle" transform="rotate(-90 ${dx + 1.4} ${(TOP + yb) / 2})">225</text>`
  return out
}

function beats() {
  const tipY = PIVOT - ROD * Math.cos(SWING * Math.PI / 180) + 18, dx = ROD * Math.sin(SWING * Math.PI / 180) + 12
  return `<g class="${P}n ${P}n0">${note('q', CX + dx, tipY, .9)}</g><g class="${P}n ${P}n1">${note('e', CX - dx - 8, tipY, .9)}</g>`
}

export function metronomeSvg() {
  const yb = BASE - 14
  const defs = `<defs>${shadowDef(`${P}sh`)}<clipPath id="${P}face"><path d="M${CX - 18} ${TOP}L${CX + 18} ${TOP}L${CX + halfW(yb)} ${yb}L${CX - halfW(yb)} ${yb}Z"/></clipPath>` +
    `<clipPath id="${P}side"><path d="M${CX + 18} ${TOP}L${CX + 30} ${TOP + 6}L${CX + halfW(yb) + 14} ${yb}L${CX + halfW(yb)} ${yb}Z"/></clipPath></defs>`
  const body = defs + shadow(`${P}sh`, CX + 10, BASE + 2, 140, 12) + caseFront() + hidden() + scale() + rod() + beats() + elevation() + plate(CX, 380, 'METRONOMO · VIII')
  return `<svg class="mu mu-metronome" viewBox="0 0 640 400" role="img" aria-hidden="true">${body}</svg>`
}

const period = (bpm: number) => r(120 / bpm)
const noteFrames = `@keyframes ${P}up { 0% { opacity: 0; transform: translate(0, 0); } 6% { opacity: 1; } 44% { opacity: 0; transform: translate(0, -44px); } 100% { opacity: 0; transform: translate(0, -44px); } }`

export const METRONOME_CSS = `
@keyframes ${P}swing { 0% { transform: rotate(0deg); animation-timing-function: ease-out; } 25% { transform: rotate(${SWING}deg); animation-timing-function: ease-in-out; } 75% { transform: rotate(-${SWING}deg); animation-timing-function: ease-in; } 100% { transform: rotate(0deg); } }
${noteFrames}
.mu-metronome .${P}n { opacity: 0; }
.mu-metronome .${P}weight { transform: none; transition: transform 700ms cubic-bezier(.32,.72,0,1); }
.iso-host[data-open] .mu-metronome .${P}weight { transform: translateY(${r(markY(FAST) - markY(SLOW))}px); }
.iso-host:hover .mu-metronome .${P}rod { animation: ${P}swing ${period(SLOW)}s linear infinite; }
.iso-host:hover .mu-metronome .${P}n0 { animation: ${P}up ${period(SLOW)}s ${r(period(SLOW) / 4)}s ease-out infinite; }
.iso-host:hover .mu-metronome .${P}n1 { animation: ${P}up ${period(SLOW)}s ${r(period(SLOW) * .75)}s ease-out infinite; }
.iso-host[data-open]:hover .mu-metronome .${P}rod { animation-duration: ${period(FAST)}s; }
.iso-host[data-open]:hover .mu-metronome .${P}n0 { animation-duration: ${period(FAST)}s; animation-delay: ${r(period(FAST) / 4)}s; }
.iso-host[data-open]:hover .mu-metronome .${P}n1 { animation-duration: ${period(FAST)}s; animation-delay: ${r(period(FAST) * .75)}s; }
`
