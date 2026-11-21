/**
 * [INPUT]: the engraving kit of ./line.ts (curve, inset, ticks, dbl, screw, note, plate, shadow, frames)
 * [OUTPUT]: pianoSvg(): PIANO · I, a concert grand in plan (640×400) for the empty Reading view; PIANO_CSS; PIANO_KEYS (the 52 white and 36 black keys it draws, for the tests)
 * [POS]: music object M1, the counterpart of the typewriter. The plan is one model: 88 keys from A0 at the top (bass on the player's left), a straight bass side and a bent treble side,
 *        tuning pins, dampers, trichord treble strings that end on a bridge solved from the bent rim, a parallel band of overstrung bass strings crossing them onto their own bridge, hitch pins along the inner rim, the iron frame with its struts and bolts,
 *        hidden lines (dashed) for the music desk, legs and soundboard ribs. Hover plays a phrase: each key goes ink, the string group in line with it shakes, a note rises in the band above.
 *        is-typing keeps playing and draws a staff left to right with the phrase's notes on their pitches. Open raises the lid in the front elevation at the lower right (hinge on the bass side, prop stick)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { buzzFrames, circle, curve, dbl, inset, line, note, path, plate, r, rect, riseFrames, screw, shadow, shadowDef, ticks, type Pt } from './line.ts'

const P = 'pn-'
const X0 = 40, Y0 = 136
const L = 420, W = 215
const at = (u: number, v: number): Pt => [X0 + u, Y0 + v]

/* ============================================================
   Case · the contour in plan (u along the length, v across; keyboard at u = 0)
   ============================================================ */
const CASE = curve(at(50, 0), [
  ['L', at(370, 0)],
  ['C', at(400, 0), at(420, 16), at(420, 44)],
  ['C', at(420, 70), at(405, 86), at(380, 98)],
  ['C', at(320, 126), at(270, 140), at(230, 170)],
  ['C', at(200, 192), at(180, 215), at(140, 215)],
  ['L', at(50, 215)],
], true)

/** The rim's u at a depth v on the tail and bent side (the far end of the strings) */
function rimU(v: number) {
  let best = 0
  for (const p of CASE.points) if (Math.abs(p[1] - (Y0 + v)) < 1.2 && p[0] - X0 > best) best = p[0] - X0
  return best
}

/* ============================================================
   Keys · 52 white from A0 (top) to C8; a black key after A, C, D, F, G
   ============================================================ */
const KEY_V0 = 8, KEY_V1 = 207, WHITE = 52, KW = (KEY_V1 - KEY_V0) / WHITE
const BLACK_AFTER = new Set(['A', 'C', 'D', 'F', 'G'])
export const PIANO_KEYS = (() => {
  const black: number[] = []
  for (let i = 0; i < WHITE - 1; i++) if (BLACK_AFTER.has('ABCDEFG'[i % 7]!)) black.push(i)
  return { white: WHITE, black: black.length, blackAfter: black }
})()

/** The phrase: white-key indices (A0 = 0, C4 = 23) */
const MELODY = [23, 25, 27, 28, 30, 28, 27, 32]
const LOOP = 4.8, STEP = LOOP / (MELODY.length + 2)
const keyV = (k: number) => KEY_V0 + (k + .5) * KW
const TREBLE_V0 = 92, GROUP = 2.05, GROUPS = Math.floor((204 - TREBLE_V0) / GROUP) + 1
const groupOf = (k: number) => Math.max(0, Math.min(GROUPS - 1, Math.round((keyV(k) - TREBLE_V0) / GROUP)))

function keyboard() {
  let out = rect(...at(0, -6), 50, W + 12, 'w2 pf') + rect(...at(0, -6), 50, KEY_V0 + 6 - 1, 'w1 pf') + rect(...at(0, KEY_V1 + 1), 50, W + 6 - KEY_V1 - 1, 'w1 pf')
  out += dbl(`M${at(44, KEY_V0)}L${at(44, KEY_V1)}`.replace(/,/g, ' '), 1.6) + line(...at(48, KEY_V0), ...at(48, KEY_V1), 'w0')
  for (let i = 0; i < WHITE; i++) out += rect(...at(2, KEY_V0 + i * KW), 42, KW, `w0 pf pn-k pn-k${i}`)
  for (const i of PIANO_KEYS.blackAfter) {
    const v = KEY_V0 + (i + 1) * KW - KW * .29
    out += rect(...at(18, v), 26, KW * .58, 'if ns pn-bk') + line(...at(19.5, v + KW * .29), ...at(42.5, v + KW * .29), 'w0 pw')
  }
  out += dbl(`M${at(2, KEY_V0)}L${at(2, KEY_V1)}`.replace(/,/g, ' '), 1.4)
  return out
}

/* ============================================================
   Inside · pins, dampers, strings, bridges, frame
   ============================================================ */
function pins() {
  let out = ''
  for (let row = 0; row < 64; row++) for (let col = 0; col < 3; col++) {
    const v = 12 + row * 3 + (col % 2) * 1.5, u = 54 + col * 4.6
    out += circle(...at(u, v), .62, 'w0 pf')
  }
  return out
}

function dampers() {
  let out = ''
  for (let g = 0; g < GROUPS; g += 1) out += rect(...at(76, TREBLE_V0 + g * GROUP - .7), 5, 1.4, 'w0 pf')
  return out + line(...at(75, TREBLE_V0 - 2), ...at(75, 206), 'w1') + line(...at(82, TREBLE_V0 - 2), ...at(82, 206), 'w0')
}

/* Bass strings: one parallel band from the tuning pins near the straight side, crossing over the tenor strings at BASS_ANGLE;
   each runs until it is HITCH from the case edge (its hitch pin), and stands on a separate bass bridge BASS_BRIDGE before that */
const BASS = 22, BASS_ANGLE = 11 * Math.PI / 180, HITCH = 9, BASS_BRIDGE = 34
const rimGap = (p: Pt) => { let m = Infinity; for (const q of CASE.points) m = Math.min(m, Math.hypot(q[0] - p[0], q[1] - p[1])); return m }
const BASS_RUNS = Array.from({ length: BASS }, (_, i) => {
  const a = at(86, 14 + i * 2.4), d: Pt = [Math.cos(BASS_ANGLE), Math.sin(BASS_ANGLE)]
  let t = 60
  while (rimGap([a[0] + d[0] * t, a[1] + d[1] * t]) > HITCH) t += .5
  return { a, hitch: [a[0] + d[0] * t, a[1] + d[1] * t] as Pt, bridge: [a[0] + d[0] * (t - BASS_BRIDGE), a[1] + d[1] * (t - BASS_BRIDGE)] as Pt }
})

function strings() {
  let treble = '', bridge: Pt[] = [], hitch = ''
  for (let g = 0; g < GROUPS; g++) {
    const v = TREBLE_V0 + g * GROUP, end = rimU(v) - 24
    bridge.push(at(end, v))
    let group = ''
    for (const dv of [-.45, 0, .45]) group += line(...at(84, v + dv), ...at(end + 2.5, v + dv), 'w0')
    treble += `<g class="pn-g pn-g${g}">${group}</g>`
    hitch += circle(...at(end + 11, v), .5, 'if ns')
  }
  const bridgeD = 'M' + bridge.map(p => `${r(p[0])} ${r(p[1])}`).join('L')
  let bass = '', bassHitch = ''
  for (const run of BASS_RUNS) {
    bass += line(run.a[0], run.a[1], run.hitch[0], run.hitch[1], 'w1') + line(run.a[0], run.a[1], run.bridge[0], run.bridge[1], 'w0 pw')
    bassHitch += circle(run.hitch[0], run.hitch[1], .75, 'if ns') + circle(run.bridge[0] - .9, run.bridge[1] + .9, .3, 'if ns')
  }
  const bassBridge = 'M' + BASS_RUNS.map(run => `${r(run.bridge[0])} ${r(run.bridge[1])}`).join('L')
  let bridgePins = ''
  for (const p of bridge) bridgePins += circle(p[0] + 1.2, p[1] - .6, .32, 'if ns')
  return treble + dbl(bridgeD, 2.4) + bridgePins + hitch + bass + dbl(bassBridge, 3) + bassHitch
}

function frame() {
  let out = ''
  const struts: [number, number][] = [[30, 0], [86, 0], [140, 0], [192, 0]]
  for (const [v] of struts) {
    const end = v < 60 ? 392 : rimU(v + 6) - 20
    const d = `M${at(70, v).join(' ')}L${at(end, v < 60 ? v + 2 : v - 8).join(' ')}`
    out += dbl(d, 3.2, .3) + path(d, 'w0 dot')
  }
  const rail = `M${at(68, 8).join(' ')}L${at(68, 207).join(' ')}`
  out += dbl(rail, 4, .35) + dbl(`M${at(72, 9).join(' ')}L${at(72, 206).join(' ')}`, 1.2)
  for (const s of CASE.every(34, 40, CASE.length - 120)) out += screw(s.p[0] - s.n[0] * 13.5, s.p[1] - s.n[1] * 13.5, 1.5, (s.s * 7) % 180)
  return out
}

function hidden() {
  let out = rect(...at(47, 28), 18, 160, 'w0 dash')
  for (const [u, v, rad] of [[64, 18, 9], [64, 197, 9], [388, 40, 9]] as const) out += circle(...at(u, v), rad, 'w0 dash') + circle(...at(u, v), 3, 'w0 dash')
  for (let i = 0; i < 9; i++) out += line(...at(110 + i * 30, 8), ...at(60 + i * 30, 207), 'w0 dash')
  return out
}

function hinges() {
  let out = ''
  for (const u of [140, 240, 330]) out += rect(...at(u - 6, -2.2), 12, 4.4, 'w1 pf') + screw(...at(u - 3, 0), .9, 10) + screw(...at(u + 3, 0), .9, 70)
  return out
}

/* ============================================================
   Bands · the dimension line, rising notes, the staff the typing draws
   ============================================================ */
const STAFF = { x0: 78, x1: 470, top: 34, gap: 5.6 }
const SPAN = STAFF.x1 - STAFF.x0
const pitchY = (k: number) => STAFF.top + 4 * STAFF.gap - (k - 25) * STAFF.gap / 2

/** Offsets from the staff's left end at which the drawing head reveals something: the clef, each note, each bar line */
const SHOW = [0, ...MELODY.flatMap((_, i) => i % 4 === 3 ? [40 + i * 44, 62 + i * 44] : [40 + i * 44])]

function staff() {
  let lines = ''
  for (let i = 0; i < 5; i++) lines += path(`M${STAFF.x0} ${r(STAFF.top + i * STAFF.gap)}H${STAFF.x1}`, 'w0 pn-sl')
  const clef = path(`M${STAFF.x0 + 12} ${STAFF.top + 31}C${STAFF.x0 + 8} ${STAFF.top + 34} ${STAFF.x0 + 6} ${STAFF.top + 28} ${STAFF.x0 + 10} ${STAFF.top + 27}` +
    `C${STAFF.x0 + 14} ${STAFF.top + 26} ${STAFF.x0 + 14} ${STAFF.top + 32} ${STAFF.x0 + 11} ${STAFF.top + 33}L${STAFF.x0 + 9} ${STAFF.top - 6}` +
    `C${STAFF.x0 + 8} ${STAFF.top - 12} ${STAFF.x0 + 15} ${STAFF.top - 12} ${STAFF.x0 + 14} ${STAFF.top - 4}C${STAFF.x0 + 13} ${STAFF.top + 4} ${STAFF.x0 + 3} ${STAFF.top + 10} ${STAFF.x0 + 4} ${STAFF.top + 17}` +
    `C${STAFF.x0 + 5} ${STAFF.top + 24} ${STAFF.x0 + 16} ${STAFF.top + 24} ${STAFF.x0 + 16} ${STAFF.top + 17}C${STAFF.x0 + 16} ${STAFF.top + 12} ${STAFF.x0 + 9} ${STAFF.top + 11} ${STAFF.x0 + 8} ${STAFF.top + 16}`, 'w1 pn-at pn-at0')
  let notes = '', bars = ''
  MELODY.forEach((k, i) => {
    const x = STAFF.x0 + 40 + i * 44, y = pitchY(k)
    const ledger = y > STAFF.top + 4 * STAFF.gap + .1 ? line(x - 5.5, r(STAFF.top + 5 * STAFF.gap), x + 5.5, r(STAFF.top + 5 * STAFF.gap), 'w0') : ''
    notes += `<g class="pn-at pn-at${SHOW.indexOf(x - STAFF.x0)}">${ledger}${note(i % 3 === 2 ? 'h' : 'q', x, y, .82)}</g>`
    if (i % 4 === 3) bars += path(`M${x + 22} ${STAFF.top}V${r(STAFF.top + 4 * STAFF.gap)}`, `w0 pn-at pn-at${SHOW.indexOf(x + 22 - STAFF.x0)}`)
  })
  return `<g class="pn-staff">${lines}${clef}${bars}${notes}</g>`
}

function rising() {
  return MELODY.slice(0, 6).map((k, i) => {
    const kind = (['e', 'q', 'b', 'e', 'q', 'h'] as const)[i]!
    const x = 150 + ((groupOf(k) * 37) % 260), delay = i * STEP * 1.4
    return `<g class="pn-rise" style="animation-delay:${r(delay)}s">${note(kind, x, Y0 - 20, .95)}</g>`
  }).join('')
}

function dimension() {
  const y = Y0 - 10, a = X0, b = X0 + L
  return line(a, y, b, y, 'w0') + line(a, y - 3, a, y + 3, 'w0') + line(b, y - 3, b, y + 3, 'w0') + line(a, y, a + 4, y - 1.2, 'w0') + line(a, y, a + 4, y + 1.2, 'w0') +
    line(b, y, b - 4, y - 1.2, 'w0') + line(b, y, b - 4, y + 1.2, 'w0') +
    `<rect x="${r((a + b) / 2 - 16)}" y="${y - 3.5}" width="32" height="7" class="pf ns"/><text x="${r((a + b) / 2)}" y="${y + 1.8}" font-size="5" letter-spacing="1.4" text-anchor="middle">2 740</text>`
}

/* ============================================================
   Front elevation · the lid on its bass-side hinge, the prop stick, legs and lyre
   ============================================================ */
const EL = { x: 474, y: 262, hinge: [486, 300] as Pt }
function elevation() {
  const [hx, hy] = EL.hinge
  let out = rect(EL.x - 6, EL.y - 10, 158, 110, 'w0') + rect(EL.x - 4, EL.y - 8, 154, 106, 'w0')
  out += `<text x="${EL.x}" y="${EL.y - 1}" font-size="4" letter-spacing="1">ELEV · A</text>`
  out += rect(hx, hy, 120, 6, 'w2 pf') + rect(hx + 2, hy + 6, 116, 12, 'w1 pf') + line(hx + 2, hy + 9, hx + 118, hy + 9, 'w0') + line(hx + 2, hy + 15, hx + 118, hy + 15, 'w0')
  for (let x = hx + 4; x < hx + 117; x += 2.2) out += line(x, hy + 10, x, hy + 14, 'w0')
  for (const lx of [hx + 10, hx + 104]) {
    out += path(`M${lx} ${hy + 18}L${lx + 1.5} ${hy + 50}L${lx + 4.5} ${hy + 50}L${lx + 6} ${hy + 18}Z`, 'w1 pf')
    for (let k = 0; k < 4; k++) out += line(lx + .6, hy + 22 + k * 7, lx + 5.4, hy + 22 + k * 7, 'w0')
    out += circle(lx + 3, hy + 53, 3, 'w1 pf') + circle(lx + 3, hy + 53, 1, 'w0')
  }
  const cx = hx + 60
  out += path(`M${cx - 9} ${hy + 18}C${cx - 12} ${hy + 30} ${cx - 6} ${hy + 40} ${cx - 8} ${hy + 46}L${cx + 8} ${hy + 46}C${cx + 6} ${hy + 40} ${cx + 12} ${hy + 30} ${cx + 9} ${hy + 18}`, 'w1')
  for (const dx of [-5, 0, 5]) out += rect(cx + dx - 1.4, hy + 46, 2.8, 5, 'w1 pf')
  out += rect(hx - 4, hy - 1, 8, 3, 'w1 pf') + circle(hx, hy, 1.1, 'w1 pf')
  const lid = rect(hx, hy - 2.4, 120, 2.4, 'w1 pf') + line(hx + 3, hy - 1.2, hx + 117, hy - 1.2, 'w0')
  out += `<g class="pn-lid" style="transform-box:view-box;transform-origin:${hx}px ${hy}px">${lid}</g>`
  out += `<g class="pn-prop" style="transform-box:view-box;transform-origin:${hx + 79}px ${hy}px">${rect(hx + 79, hy - 1.6, 32.5, 1.6, 'w1 pf')}</g>`
  return out
}

export function pianoSvg() {
  const body = `<defs><clipPath id="${P}case"><path d="${CASE.d}"/></clipPath>${shadowDef(`${P}sh`)}</defs>` +
    shadow(`${P}sh`, X0 + 230, Y0 + 120, 250, 120) +
    `<path d="${CASE.d}" class="w2 pf"/>` +
    inset(CASE.d, `${P}case`, [1.6, 6.5, 8, 12, 13.4]) +
    `<g clip-path="url(#${P}case)">${ticks(CASE.every(2.2), -4.6, 'w0', -3.2, -1.6)}</g>` +
    hidden() + pins() + dampers() + strings() + frame() + hinges() + keyboard() +
    dimension() + elevation() + rising() + staff() + plate(560, 386, 'PIANO · I')
  return `<svg class="mu mu-piano" viewBox="0 0 640 400" role="img" aria-hidden="true">${body}</svg>`
}

/* ============================================================
   Motion
   ============================================================ */
/** Each revealed part shows once the drawing head (linear over 92% of the loop) passes its offset, and clears with the staff */
const showFrames = SHOW.map((dx, i) => {
  const p = r(dx / SPAN * 92)
  return `@keyframes pn-show${i} { 0%, ${p}% { opacity: 0; } ${r(p + 1.5)}% { opacity: 1; } 92% { opacity: 1; } 97%, 100% { opacity: 0; } }\n.iso-host.is-typing .mu-piano .pn-at${i} { animation: pn-show${i} ${LOOP}s linear infinite; }`
}).join('\n')

const pressRule = (state: string) => MELODY.map((k, i) => `${state} .mu-piano .pn-k${k} { animation: pn-press ${LOOP}s ${r(i * STEP)}s infinite; }`).join('\n')
const buzzRule = (state: string) => MELODY.map((k, i) => `${state} .mu-piano .pn-g${groupOf(k)} { animation: pn-buzz ${LOOP}s ${r(i * STEP)}s infinite; }`).join('\n')

export const PIANO_CSS = `
@keyframes pn-press { 0% { fill: var(--pap); } 3% { fill: var(--ink); } 13% { fill: var(--ink); } 18% { fill: var(--pap); } 100% { fill: var(--pap); } }
${buzzFrames('pn-buzz', 'Y', 18, .8)}
${riseFrames('pn-up', 26, -88, 46)}
@keyframes pn-draw { 0% { stroke-dashoffset: ${SPAN}; opacity: 1; } 92% { stroke-dashoffset: 0; opacity: 1; } 97%, 100% { stroke-dashoffset: 0; opacity: 0; } }
.mu-piano .pn-g { transform-box: fill-box; }
.mu-piano .pn-rise, .mu-piano .pn-at { opacity: 0; }
.mu-piano .pn-sl { stroke-dasharray: ${SPAN}; stroke-dashoffset: ${SPAN}; }
${pressRule('.iso-host:hover')}
${pressRule('.iso-host.is-typing')}
${buzzRule('.iso-host:hover')}
${buzzRule('.iso-host.is-typing')}
.iso-host:hover:not(.is-typing) .mu-piano .pn-rise { animation: pn-up ${LOOP}s cubic-bezier(.3,.6,.4,1) infinite; }
.iso-host.is-typing .mu-piano .pn-sl { animation: pn-draw ${LOOP}s linear infinite; }
${showFrames}
.mu-piano .pn-lid { transform: rotate(0deg); transition: transform 900ms cubic-bezier(.32,.72,0,1); }
.mu-piano .pn-prop { transform: rotate(0deg); transition: transform 700ms cubic-bezier(.32,.72,0,1) 120ms; }
.iso-host[data-open] .mu-piano .pn-lid { transform: rotate(-22deg); }
.iso-host[data-open] .mu-piano .pn-prop { transform: rotate(-92deg); }
`
