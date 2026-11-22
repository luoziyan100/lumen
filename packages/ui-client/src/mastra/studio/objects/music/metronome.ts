/**
 * [INPUT]: the engraving kit of ./line.ts; the Score type and ms from ./pitch.ts
 * [OUTPUT]: metronomeSvg(): METRONOMO · VIII, a pyramid metronome with its front cover off (640×400) for the empty All view; METRONOME_CSS; METRONOME_SCORE (the weight's slide, and the bell as it lands, on a click; four ticks per pass on the swing extremes at 72 or 120)
 * [POS]: music object M8, the counterpart of the type case. The rod turns about the pivot (PIVOT) in front of a scale engraved with Maelzel's marks (40–208);
 *        the slider's height on the rod sets the tempo, and the swing period is 60/bpm per beat. Hover swings it at the slider's tempo (72) with a note per beat at each end of the swing.
 *        Click slides the weight down to 120 and the swing quickens. Behind the scale, the clockwork shows as hidden (dashed) wheels; DETAIL A at the right magnifies the escapement: the anchor rocks with the rod and the escape wheel steps half a tooth each beat.
 *        The weight slides for as long as the scrape in METRONOME_SCORE
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { circle, curve, dbl, detail, hatch, knurl, line, note, path, plate, r, rect, screw, shadow, shadowDef, ticks } from './line.ts'
import { cycle, restFrames, type Cycle } from './cycle.ts'
import { ms, type Cue, type Score } from './pitch.ts'

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

/* DETAIL A: the escapement behind the scale at 3:1. The escape wheel (20 teeth) steps half a tooth each beat; the anchor on the pendulum arbor rocks with the rod */
const MARK = { x: CX, y: PIVOT + 6, r: 21.3 }, WIN = { x: 516, y: 196, r: 64 }
const WHEEL = { x: WIN.x, y: WIN.y + 16, r: 34, teeth: 20 }, ANCHOR = { x: WIN.x, y: WIN.y - 30 }
function escapement() {
  let c = ''
  for (let y = WIN.y - WIN.r; y < WIN.y + WIN.r; y += 3.2) c += line(WIN.x - WIN.r, y, WIN.x + WIN.r, y + 1.2, 'w0 mu-gr')
  c += rect(WIN.x - 52, WIN.y + 46, 104, 6, 'w1 pf') + rect(WIN.x - 52, WIN.y - 52, 104, 5, 'w1 pf')
  for (const x of [WIN.x - 44, WIN.x + 44]) c += screw(x, WIN.y + 49, 2, 30) + screw(x, WIN.y - 49.5, 2, 80)
  let teeth = ''
  for (let i = 0; i < WHEEL.teeth; i++) {
    const a = i / WHEEL.teeth * Math.PI * 2, b = (i + .62) / WHEEL.teeth * Math.PI * 2, e = (i + 1) / WHEEL.teeth * Math.PI * 2, rr = WHEEL.r - 6
    teeth += `${i ? 'L' : 'M'}${r(WHEEL.x + Math.cos(a) * rr)} ${r(WHEEL.y + Math.sin(a) * rr)}L${r(WHEEL.x + Math.cos(b) * WHEEL.r)} ${r(WHEEL.y + Math.sin(b) * WHEEL.r)}L${r(WHEEL.x + Math.cos(e) * rr)} ${r(WHEEL.y + Math.sin(e) * rr)}`
  }
  let wheel = path(teeth + 'Z', 'w1 pf') + circle(WHEEL.x, WHEEL.y, WHEEL.r - 9, 'w0')
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + .3; wheel += dbl(`M${r(WHEEL.x + Math.cos(a) * 6)} ${r(WHEEL.y + Math.sin(a) * 6)}L${r(WHEEL.x + Math.cos(a) * (WHEEL.r - 9))} ${r(WHEEL.y + Math.sin(a) * (WHEEL.r - 9))}`, 3, .3) }
  wheel += circle(WHEEL.x, WHEEL.y, 6, 'w1 pf') + circle(WHEEL.x, WHEEL.y, 2.4, 'w1 pf') + circle(WHEEL.x, WHEEL.y, .8, 'if ns')
  c += `<g class="${P}wheel" style="transform-box:view-box;transform-origin:${WHEEL.x}px ${WHEEL.y}px">${wheel}</g>`
  const pallet = (side: number) => {
    const a = (-90 + side * 38) * Math.PI / 180, px = WHEEL.x + Math.cos(a) * (WHEEL.r + 6), py = WHEEL.y + Math.sin(a) * (WHEEL.r + 6)
    return { arm: `M${ANCHOR.x} ${ANCHOR.y}Q${r(ANCHOR.x + side * 30)} ${r(ANCHOR.y + 2)} ${r(px)} ${r(py)}` }
  }
  let anchor = ''
  for (const side of [-1, 1]) {
    const { arm } = pallet(side)
    const a = (-90 + side * 38) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy * 1.8, ny = ux * 1.8
    const at = (rad: number, w: number) => `${r(WHEEL.x + ux * rad + nx * w)} ${r(WHEEL.y + uy * rad + ny * w)}`
    anchor += dbl(arm, 4.4, .3) + path(`M${at(WHEEL.r - 3, -1)}L${at(WHEEL.r + 7, -1)}L${at(WHEEL.r + 7, 1)}L${at(WHEEL.r - 3, 1)}Z`, 'w1 pf') + path(`M${at(WHEEL.r - 1, 0)}L${at(WHEEL.r + 6, 0)}`, 'w0')
  }
  anchor += dbl(`M${ANCHOR.x} ${ANCHOR.y}L${ANCHOR.x} ${WIN.y - WIN.r}`, 3.6, .3) + circle(ANCHOR.x, ANCHOR.y, 5.4, 'w1 pf') + circle(ANCHOR.x, ANCHOR.y, 2.2, 'w0') + screw(ANCHOR.x, ANCHOR.y - 12, 1.6, 0)
  c += `<g class="${P}anchor" style="transform-box:view-box;transform-origin:${ANCHOR.x}px ${ANCHOR.y}px">${anchor}</g>`
  return detail(`${P}da`, MARK, WIN, 'DETAIL A · 3:1', c)
}

function beats() {
  const tipY = PIVOT - ROD * Math.cos(SWING * Math.PI / 180) + 18, dx = ROD * Math.sin(SWING * Math.PI / 180) + 12
  return `<g class="${P}n ${P}n0">${note('q', CX + dx, tipY, .9)}</g><g class="${P}n ${P}n1">${note('e', CX - dx - 8, tipY, .9)}</g>`
}

export function metronomeSvg() {
  const yb = BASE - 14
  const defs = `<defs>${shadowDef(`${P}sh`)}<clipPath id="${P}face"><path d="M${CX - 18} ${TOP}L${CX + 18} ${TOP}L${CX + halfW(yb)} ${yb}L${CX - halfW(yb)} ${yb}Z"/></clipPath>` +
    `<clipPath id="${P}side"><path d="M${CX + 18} ${TOP}L${CX + 30} ${TOP + 6}L${CX + halfW(yb) + 14} ${yb}L${CX + halfW(yb)} ${yb}Z"/></clipPath></defs>`
  const body = defs + shadow(`${P}sh`, CX + 10, BASE + 2, 140, 12) + caseFront() + hidden() + scale() + rod() + beats() + escapement() + plate(CX, 380, 'METRONOMO · VIII')
  return `<svg class="mu mu-metronome" viewBox="0 0 640 400" role="img" aria-hidden="true">${body}</svg>`
}

const period = (bpm: number) => r(120 / bpm)

/* ============================================================
   Tempo cycles · one pass is four beats (two swings; the last beat's note has faded by 2.25 periods), then the rod, the wheel, the anchor and the notes all rest. 72 on hover,
   120 once the weight is down; each tempo has its own keyframes, so a click restarts the swing at the new tempo. A tick sounds at every end of the swing (a quarter and
   three quarters of each period). The click slides the weight down with a scrape, and the bell rings as it lands
   ============================================================ */
const SLIDE = .7, BEATS = 4
interface Tempo { bpm: number; tag: string; pass: Cycle; cues: Cue[] }
const tempo = (bpm: number, tag: string): Tempo => {
  const p = period(bpm)
  return { bpm, tag, pass: cycle(r(2.25 * p)), cues: Array.from({ length: BEATS }, (_, k) => ({ at: r((k / 2 + .25) * p), dur: .13, part: 'rod', sound: { kind: 'noise', noise: 'tick' }, level: .9 })) }
}
const SLOW_T = tempo(SLOW, ''), FAST_T = tempo(FAST, '-f')

const scrape: Cue = { at: 0, dur: SLIDE, part: 'weight', sound: { kind: 'noise', noise: 'slide' }, level: .45 }
const bell: Cue = { at: SLIDE, dur: .9, part: 'weight', sound: { kind: 'bell', degree: 0 }, level: .4 }
const loop = (t: Tempo) => ({ cycle: t.pass, clock: { animation: `${P}swing${t.tag}`, target: `${P}rod`, delay: 0 }, cues: t.cues })
export const METRONOME_SCORE: Score = {
  open: [scrape, bell],
  close: [scrape],
  hoverIn: [],
  loops: [{ when: { hover: true, open: true }, ...loop(FAST_T) }, { when: { hover: true }, ...loop(SLOW_T) }],
  limit: 1.8,
}

const STEP = 360 / 20 / 2
const frames = (t: Tempo) => {
  const p = period(t.bpm), repeat = (block: string) => restFrames(block, p, t.pass, 2)
  return repeat(`@keyframes ${P}step${t.tag} { 0%, 24% { transform: rotate(0deg); } 27%, 74% { transform: rotate(${STEP}deg); } 77%, 100% { transform: rotate(${STEP * 2}deg); } }`) +
    repeat(`@keyframes ${P}rock${t.tag} { 0% { transform: rotate(0deg); animation-timing-function: ease-out; } 25% { transform: rotate(6deg); animation-timing-function: ease-in-out; } 75% { transform: rotate(-6deg); animation-timing-function: ease-in; } 100% { transform: rotate(0deg); } }`) +
    repeat(`@keyframes ${P}swing${t.tag} { 0% { transform: rotate(0deg); animation-timing-function: ease-out; } 25% { transform: rotate(${SWING}deg); animation-timing-function: ease-in-out; } 75% { transform: rotate(-${SWING}deg); animation-timing-function: ease-in; } 100% { transform: rotate(0deg); } }`) +
    repeat(`@keyframes ${P}up${t.tag} { 0% { opacity: 0; transform: translate(0, 0); } 6% { opacity: 1; } 44% { opacity: 0; transform: translate(0, -44px); } 100% { opacity: 0; transform: translate(0, -44px); } }`)
}
const rules = (state: string, t: Tempo) => `${state} .mu-metronome .${P}wheel { animation: ${P}step${t.tag} ${t.pass.total}s linear infinite; }
${state} .mu-metronome .${P}anchor { animation: ${P}rock${t.tag} ${t.pass.total}s linear infinite; }
${state} .mu-metronome .${P}rod { animation: ${P}swing${t.tag} ${t.pass.total}s linear infinite; }
${state} .mu-metronome .${P}n0 { animation: ${P}up${t.tag} ${t.pass.total}s ${t.cues[0]!.at}s ease-out infinite; }
${state} .mu-metronome .${P}n1 { animation: ${P}up${t.tag} ${t.pass.total}s ${t.cues[1]!.at}s ease-out infinite; }`

export const METRONOME_CSS = `
${frames(SLOW_T)}${frames(FAST_T)}.mu-metronome .${P}n { opacity: 0; }
.mu-metronome .${P}weight { transform: none; transition: transform ${ms(SLIDE)}ms cubic-bezier(.32,.72,0,1); }
.iso-host[data-open] .mu-metronome .${P}weight { transform: translateY(${r(markY(FAST) - markY(SLOW))}px); }
${rules('.iso-host[data-hover]', SLOW_T)}
${rules('.iso-host[data-open][data-hover]', FAST_T)}
`
