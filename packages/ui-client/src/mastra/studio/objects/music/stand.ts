/**
 * [INPUT]: the engraving kit of ./line.ts; the Score type and ms from ./pitch.ts
 * [OUTPUT]: standSvg(): LEGGIO · II, an orchestral music stand holding an open score with a dip pen on the right page (640×400) for the empty Board; STAND_CSS; STAND_SCORE (the click score); STAND_PHRASE (the written strokes, for the tests)
 * [POS]: music object M2, the counterpart of the easel, same viewBox so the board host's layout holds. The pen's path is solved from the phrase it writes:
 *        every stroke (a note head loop, a stem, a flag, a beam) is one curve; its ink is revealed by stroke-dashoffset over its own share of the write time,
 *        and the pen's keyframes are sampled from the same curves by arc length, so the nib always sits on the drawing head and lifts between strokes.
 *        Click turns the right-hand leaf over the spine: its printed face hides at the half-turn, the pre-mirrored back face shows, and a fresh page lies beneath.
 *        The half-turn time is the flap's time in STAND_SCORE
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { circle, curve, hatch, knurl, line, note, path, plate, r, rect, screw, shadow, shadowDef, type Curve, type Seg } from './line.ts'
import { cycle, restFrames } from './cycle.ts'
import { ms, type Cue, type Score } from './pitch.ts'

const P = 'ms-'
const DESK = { x0: 160, x1: 480, top: 36, bottom: 236 }
const PAGE = { l: 172, spine: 320, r: 468, top: 48, bottom: 234 }
const STAVES = [74, 98, 122, 146, 170, 194, 216], GAP = 2.4
const WRITE = { staff: 216, x0: 342 }
const LOOP = 6.4, WRITE_PCT = 78

/* ============================================================
   The written phrase · strokes in writing order
   ============================================================ */
const pitch = (step: number) => WRITE.staff + 4 * GAP - step * GAP / 2
function headLoop(x: number, y: number): Curve {
  return curve([x + 2.4, y - 1.2], [
    ['C', [x + 1, y - 2.6], [x - 3.2, y - 1.4], [x - 2.8, y + .6]],
    ['C', [x - 2.4, y + 2.4], [x + 2.2, y + 1.4], [x + 2.4, y - 1]],
    ['C', [x + 1.4, y - 1.6], [x - 1.8, y - .6], [x - 1.4, y + .6]],
    ['C', [x - 1, y + 1.4], [x + 1.6, y + .4], [x + 2.6, y - .6]],
  ])
}
const stem = (x: number, y: number) => curve([x + 2.6, y - .6], [['L', [x + 2.6, y - 15]]])
const flag = (x: number, y: number) => curve([x + 2.6, y - 15], [['C', [x + 3.6, y - 10], [x + 8, y - 10], [x + 7, y - 4]]])
const PHRASE_NOTES: [number, 'q' | 'e' | 'b'][] = [[4, 'q'], [6, 'e'], [5, 'b'], [8, 'q'], [7, 'e']]
export const STAND_PHRASE: Curve[] = (() => {
  const out: Curve[] = []
  let x = WRITE.x0
  for (const [step, kind] of PHRASE_NOTES) {
    const y = pitch(step)
    if (kind === 'b') {
      const y2 = pitch(step + 2), x2 = x + 10
      out.push(headLoop(x, y), stem(x, y), headLoop(x2, y2), stem(x2, y2))
      out.push(curve([x + 2.6, y - 15], [['L', [x2 + 2.6, y2 - 15]]]), curve([x + 2.6, y - 13.2], [['L', [x2 + 2.6, y2 - 13.2]]]))
      x += 30
    } else {
      out.push(headLoop(x, y), stem(x, y))
      if (kind === 'e') out.push(flag(x, y))
      x += 22
    }
  }
  out.push(curve([x - 4, WRITE.staff], [['L', [x - 4, WRITE.staff + 4 * GAP]]]))
  return out
})()
const TOTAL = STAND_PHRASE.reduce((n, c) => n + c.length, 0)

/* ============================================================
   Stand · desk, lip, tilt knob, telescoping shaft, tripod
   ============================================================ */
function stand() {
  let out = ''
  const hub = [320, 338] as const
  for (const [fx, fy] of [[226, 384], [414, 384]] as const) {
    out += path(`M${hub[0]} ${hub[1]}L${fx} ${fy}`, 'w2') + path(`M${hub[0]} ${hub[1] + 2.4}L${fx + 1.6} ${fy - 1}`, 'w0') + rect(fx - 5, fy - 1, 10, 4, 'w1 pf', 1.5)
  }
  out += path(`M${hub[0]} ${hub[1]}L${hub[0] + 6} 370`, 'w1') + rect(hub[0] + 2, 369, 8, 3, 'w1 pf', 1)
  out += rect(hub[0] - 8, hub[1] - 6, 16, 12, 'w1 pf', 2) + screw(hub[0], hub[1], 2.4, 30)
  out += rect(314, 296, 12, 42, 'w1 pf') + line(317, 298, 317, 336, 'w0') + line(323, 298, 323, 336, 'w0')
  out += rect(316.6, 246, 6.8, 52, 'w1 pf') + line(318.6, 248, 318.6, 296, 'w0')
  out += rect(311, 292, 18, 8, 'w1 pf', 1.5) + line(329, 296, 340, 296, 'w1') + circle(343, 296, 4, 'w1 pf') + knurl(343, 296, 4, 18, 1)
  out += rect(DESK.x0, DESK.top, DESK.x1 - DESK.x0, DESK.bottom - DESK.top, 'w2 pf') + rect(DESK.x0 + 3, DESK.top + 3, DESK.x1 - DESK.x0 - 6, DESK.bottom - DESK.top - 6, 'w0')
  for (let x = DESK.x0 + 6; x < DESK.x1 - 4; x += 4) out += line(x, DESK.top + 4, x, DESK.top + 11, 'w0')
  out += rect(156, 236, 328, 6, 'w2 pf') + rect(156, 242, 328, 6, 'w1 pf')
  for (let x = 160; x < 482; x += 2.6) out += line(x, 243.2, x, 246.8, 'w0')
  out += circle(320, 252, 6, 'w1 pf') + knurl(320, 252, 6, 24, 1.2) + circle(320, 252, 2, 'w0')
  return out
}

/* ============================================================
   Score · two pages, staves, printed notes; the right leaf with a back face
   ============================================================ */
function staves(x0: number, x1: number, skipLast = false) {
  let out = ''
  STAVES.forEach((y, i) => {
    if (skipLast && i === STAVES.length - 1) return
    for (let k = 0; k < 5; k++) out += line(x0, y + k * GAP, x1, y + k * GAP, 'w0')
    out += line(x0, y, x0, y + 4 * GAP, 'w0') + line(x1, y, x1, y + 4 * GAP, 'w0')
  })
  return out
}
function printed(x0: number, seed: number, rows: number) {
  let out = ''
  for (let row = 0; row < rows; row++) {
    const y = STAVES[row]!
    for (let k = 0; k < 7; k++) {
      const step = (seed * 7 + row * 5 + k * 3) % 9, x = x0 + 14 + k * 17.5
      out += note((['q', 'e', 'q', 'h', 'q', 'b', 'q'] as const)[(k + row) % 7]!, x, y + 4 * GAP - step * GAP / 2, .48)
      if (k === 3) out += line(x + 8.6, y, x + 8.6, y + 4 * GAP, 'w0')
    }
  }
  return out
}
function header(x: number, title: string, n: number) {
  return `<text x="${x}" y="${PAGE.top + 12}" font-size="4.6" letter-spacing="1.4" text-anchor="middle">${title}</text>` +
    `<text x="${x}" y="${PAGE.bottom - 4}" font-size="3.6" text-anchor="middle">${n}</text>`
}

function score() {
  let out = ''
  for (let k = 4; k >= 1; k--) out += rect(PAGE.l - k * 1.2, PAGE.top + k * .8, PAGE.r - PAGE.l + k * 2.4, PAGE.bottom - PAGE.top - k * .8, 'w0 pf')
  out += rect(PAGE.l, PAGE.top, PAGE.spine - PAGE.l, PAGE.bottom - PAGE.top, 'w1 pf') + staves(PAGE.l + 10, PAGE.spine - 8) + printed(PAGE.l + 10, 1, 6) + header((PAGE.l + PAGE.spine) / 2, 'ÉTUDE · N° 2', 1)
  out += rect(PAGE.spine, PAGE.top, PAGE.r - PAGE.spine, PAGE.bottom - PAGE.top, 'w1 pf') + staves(PAGE.spine + 8, PAGE.r - 10) + header((PAGE.spine + PAGE.r) / 2, '', 4)
  const front = rect(PAGE.spine, PAGE.top, PAGE.r - PAGE.spine, PAGE.bottom - PAGE.top, 'w1 pf') + staves(PAGE.spine + 8, PAGE.r - 10) + printed(PAGE.spine + 8, 3, 6) + header((PAGE.spine + PAGE.r) / 2, '', 2)
  const mirror = (x: number) => 2 * PAGE.spine - x
  const back = rect(PAGE.spine, PAGE.top, PAGE.r - PAGE.spine, PAGE.bottom - PAGE.top, 'w1 pf') + staves(PAGE.spine + 8, PAGE.r - 10) +
    `<g transform="translate(${2 * PAGE.spine} 0) scale(-1 1)">${printed(mirror(PAGE.r - 10) , 5, 7)}${header((PAGE.l + PAGE.spine) / 2, '', 3)}</g>`
  out += `<g class="${P}leaf" style="transform-box:view-box;transform-origin:${PAGE.spine}px 0"><g class="${P}front">${front}</g><g class="${P}back">${back}</g></g>`
  out += hatch(`${P}gutter`, [PAGE.spine - 6, PAGE.top, 12, PAGE.bottom - PAGE.top], 90, 1.2) + line(PAGE.spine, PAGE.top, PAGE.spine, PAGE.bottom, 'w1')
  return out
}

/* ============================================================
   Pen and the ink it lays down
   ============================================================ */
function pen() {
  const a = -52 * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux
  const at = (t: number, w: number) => `${r(ux * t + nx * w)} ${r(uy * t + ny * w)}`
  let out = path(`M0 0L${at(9, -2)}L${at(12, -2.4)}L${at(12, 2.4)}L${at(9, 2)}Z`, 'w1 pf') + path(`M${at(1.5, 0)}L${at(8, 0)}`, 'w0') + circle(ux * 8.4, uy * 8.4, .6, 'w0')
  out += path(`M${at(12, -2.6)}L${at(26, -3.2)}L${at(26, 3.2)}L${at(12, 2.6)}Z`, 'w1 pf')
  for (let t = 14; t < 26; t += 1.6) out += path(`M${at(t, -3)}L${at(t + .8, 3)}`, 'w0')
  out += path(`M${at(26, -3.6)}L${at(104, -3.2)}L${at(108, 0)}L${at(104, 3.2)}L${at(26, 3.6)}Z`, 'w1 pf') + path(`M${at(28, -1.6)}L${at(102, -1.4)}`, 'w0')
  for (const t of [40, 42, 90]) out += path(`M${at(t, -3.5)}L${at(t, 3.5)}`, 'w0')
  return out
}

function ink() {
  return STAND_PHRASE.map((c, i) => `<path d="${c.d}" class="w1 ns-f ${P}ink ${P}ink${i}" style="stroke-dasharray:${r(c.length + .5)};stroke-dashoffset:${r(c.length + .5)}"/>`).join('')
}

export function standSvg() {
  const [sx, sy] = STAND_PHRASE[0]!.at(0).p
  const defs = `<defs>${shadowDef(`${P}sh`)}<clipPath id="${P}gutter">${rect(PAGE.spine - 6, PAGE.top, 12, PAGE.bottom - PAGE.top, '')}</clipPath></defs>`
  const body = defs + shadow(`${P}sh`, 320, 384, 150, 10) + stand() + score() + ink() +
    `<g class="${P}pen" style="transform:translate(${r(sx)}px, ${r(sy)}px)">${pen()}</g>` + plate(560, 386, 'LEGGIO · II')
  return `<svg class="mu mu-stand" viewBox="0 0 640 400" role="img" aria-hidden="true">${body}</svg>`
}

/* ============================================================
   Motion · one table of strokes drives the ink and the pen
   ============================================================ */
const PASS = cycle(LOOP)
const motion = (() => {
  let done = 0, penFrames = '', inkRules = '', inkFrames = ''
  const strokes: Cue[] = []
  STAND_PHRASE.forEach((c, i) => {
    const from = done / TOTAL * WRITE_PCT, to = (done + c.length) / TOTAL * WRITE_PCT
    for (const s of c.every(Math.max(1.2, c.length / 14))) penFrames += `${r((done + s.s) / TOTAL * WRITE_PCT)}% { transform: translate(${r(s.p[0])}px, ${r(s.p[1])}px); } `
    const end = c.at(c.length).p
    penFrames += `${r(to)}% { transform: translate(${r(end[0])}px, ${r(end[1])}px); } `
    const L = r(c.length + .5)
    inkFrames += restFrames(`@keyframes ${P}w${i} { 0%, ${r(from)}% { stroke-dashoffset: ${L}; opacity: 1; } ${r(to)}% { stroke-dashoffset: 0; } 94% { stroke-dashoffset: 0; opacity: 1; } 99%, 100% { stroke-dashoffset: 0; opacity: 0; } }`, LOOP, PASS)
    inkRules += `.iso-host[data-hover] .mu-stand .${P}ink${i} { animation: ${P}w${i} ${PASS.total}s linear infinite; }\n`
    strokes.push({ at: Math.round(from * LOOP * 10) / 1000, dur: r(Math.max(.04, (to - from) / 100 * LOOP - .02)), part: `ink${i}`, sound: { kind: 'noise', noise: 'pen' }, level: .5 })
    done += c.length
  })
  const [sx, sy] = STAND_PHRASE[0]!.at(0).p
  penFrames = restFrames(`@keyframes ${P}write { 0% { transform: translate(${r(sx)}px, ${r(sy)}px); } ${penFrames}94% { transform: translate(${r(sx + 118)}px, ${r(sy - 6)}px); } 100% { transform: translate(${r(sx)}px, ${r(sy)}px); } }`, LOOP, PASS)
  return { penFrames, inkFrames, inkRules, strokes }
})()

/* ============================================================
   Click score · the leaf rustles over (a swept noise, no tone), with a soft flap as it passes upright and swaps faces; turning back is shorter
   ============================================================ */
const UPRIGHT = .45
export const STAND_SCORE: Score = {
  open: [{ at: 0, dur: .9, part: 'leaf', sound: { kind: 'noise', noise: 'page' }, level: .8 }, { at: UPRIGHT, dur: .47, part: 'front', sound: { kind: 'noise', noise: 'page-flap' }, level: .5 }],
  close: [{ at: 0, dur: .6, part: 'leaf', sound: { kind: 'noise', noise: 'page' }, level: .8 }, { at: UPRIGHT, dur: .47, part: 'front', sound: { kind: 'noise', noise: 'page-flap' }, level: .4 }],
  hoverIn: [],
  loops: [{ when: { hover: true }, cycle: PASS, clock: { animation: `${P}write`, target: `${P}pen`, delay: 0 }, cues: motion.strokes }],
  limit: 1.8,
}

export const STAND_CSS = `
${motion.penFrames}
${motion.inkFrames}
.iso-host[data-hover] .mu-stand .${P}pen { animation: ${P}write ${PASS.total}s linear infinite; }
${motion.inkRules}
.mu-stand .${P}leaf { transform: scaleX(1); transition: transform 900ms cubic-bezier(.45,.05,.35,1); }
.iso-host[data-open] .mu-stand .${P}leaf { transform: scaleX(-1); }
.mu-stand .${P}front { opacity: 1; transition: opacity 0s ${ms(UPRIGHT)}ms; }
.mu-stand .${P}back { opacity: 0; transition: opacity 0s ${ms(UPRIGHT)}ms; }
.iso-host[data-open] .mu-stand .${P}front { opacity: 0; }
.iso-host[data-open] .mu-stand .${P}back { opacity: 1; }
`
