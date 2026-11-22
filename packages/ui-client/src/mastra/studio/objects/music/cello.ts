/**
 * [INPUT]: bowedBody and bow from ./bowed.ts; the engraving kit of ./line.ts; the Score type and ms from ./pitch.ts
 * [OUTPUT]: celloSvg(): VIOLONCELLO · IV, a cello upright on its endpin with the bow leaning on its right side (280×340) for the empty Materials pane; CELLO_CSS; CELLO_SCORE (the click score); CELLO_STRINGS (4)
 * [POS]: music object M4, the counterpart of the cabinet, same viewBox so the pane's layout holds. The bow has two poses on one group: leaning (tip on the upper bout, frog on the floor)
 *        and playing (horizontal on the contact line between fingerboard end and bridge). Hover: the four strings hum and notes leave the left f-hole into the blank upper left.
 *        Click swings the bow to the playing pose, then it strokes along its own axis, so the hair never leaves the strings.
 *        The stroke starts at the bowed note's time in CELLO_SCORE
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { bow, bowedBody } from './bowed.ts'
import { line, note, plate, r, riseFrames, shadow, shadowDef } from './line.ts'
import { cycle, restFrames } from './cycle.ts'
import { ms, type Score } from './pitch.ts'

const P = 'cl-'
const CX = 112, TOP = 122, LEN = 170
export const CELLO_STRINGS = 4

const C = bowedBody({ prefix: P, cx: CX, top: TOP, len: LEN, endpin: 40 })
const FLOOR = 335
const LEAN = { tip: [150, 160] as const, frog: [232, FLOOR - 4] as const }
const BOW = Math.hypot(LEAN.frog[0] - LEAN.tip[0], LEAN.frog[1] - LEAN.tip[1])
const LEAN_ANGLE = Math.atan2(LEAN.frog[1] - LEAN.tip[1], LEAN.frog[0] - LEAN.tip[0]) * 180 / Math.PI
const PLAY = { x: CX - BOW * .36, y: C.contact }
const pose = (x: number, y: number, a: number) => `translate(${r(x)}px, ${r(y)}px) rotate(${r(a)}deg)`

function floor() {
  let out = line(6, FLOOR, 274, FLOOR, 'w0')
  for (let x = 10; x < 272; x += 5) out += line(x, FLOOR + .6, x - 3, FLOOR + 3.6, 'w0')
  return out
}

function rising() {
  const [ex, ey] = C.eyes[2]!
  return (['q', 'e', 'h', 'b'] as const).map((kind, i) => `<g class="${P}rise" style="animation-delay:${r(i * .7)}s">${note(kind, ex - 6 - i * 3, ey - 4, .8)}</g>`).join('')
}

export function celloSvg() {
  const bowG = `<g class="${P}bow" style="transform-box:view-box;transform-origin:0 0"><g class="${P}bowi">${bow(BOW, P)}</g></g>`
  const body = `<defs>${C.defs}${shadowDef(`${P}sh`)}</defs>` + shadow(`${P}sh`, CX + 30, FLOOR, 110, 9) + floor() + C.markup + rising() + bowG + plate(52, 322, 'VIOLONCELLO · IV', 4.6)
  return `<svg class="mu mu-cello" viewBox="0 0 280 340" role="img" aria-hidden="true">${body}</svg>`
}

/* ============================================================
   Score · hover: the four strings hum their open fifths while the notes rise (4.2 s), then rest. Open: once the bow lands (0.9 s) it draws one round trip, a long open D on each stroke
   with the bow change between, then rests on the string; that first pass is the click's sound. Closing, the bow lifts off with a short brush
   ============================================================ */
const BOW_AT = .9, STROKE = 1.4, HUM = .13
const HOVER = cycle(4.2), PLAY_PASS = cycle(2 * STROKE)
const HUM_VEL = [.16, .32, .44, .22]
const BOW_STEPS: [number, number][] = [[1, .56], [0, .48]]
export const CELLO_SCORE: Score = {
  open: [],
  close: [{ at: 0, dur: .25, part: 'bow', sound: { kind: 'noise', noise: 'wood-scrape' }, level: .45 }],
  hoverIn: [],
  loops: [
    { when: { open: true }, cycle: PLAY_PASS, clock: { animation: `${P}stroke`, target: `${P}bowi`, delay: BOW_AT }, cues: BOW_STEPS.map(([degree, level], k) => ({ at: r(k * STROKE), dur: STROKE, part: 'bowi', sound: { kind: 'bow' as const, instrument: 'cello' as const, degree }, level })) },
    { when: { hover: true }, cycle: HOVER, clock: { animation: `${P}hum`, target: `${P}s0`, delay: 0 }, cues: [0, 1, 2, 3].map(i => ({ at: 0, dur: HOVER.run, part: `s${i}`, sound: { kind: 'hum' as const, string: i }, level: HUM_VEL[i]! })) },
  ],
  limit: 1.8,
}

export const CELLO_CSS = `
${restFrames(`@keyframes ${P}hum { 0%, 100% { transform: none; } 25% { transform: translateX(.4px); } 75% { transform: translateX(-.4px); } }`, HUM, HOVER, Math.floor(HOVER.run / HUM))}
${restFrames(`@keyframes ${P}hum-o { 0%, 100% { transform: none; } 25% { transform: translateX(.4px); } 75% { transform: translateX(-.4px); } }`, HUM, PLAY_PASS, Math.floor(PLAY_PASS.run / HUM))}
${restFrames(`@keyframes ${P}stroke { 0% { transform: translateX(-26px); animation-timing-function: ease-in-out; } 50% { transform: translateX(26px); animation-timing-function: ease-in-out; } 100% { transform: translateX(-26px); } }`, PLAY_PASS.run, PLAY_PASS)}
${restFrames(riseFrames(`${P}up`, -70, -120, 72), 2.8, HOVER)}
.mu-cello .${P}rise { opacity: 0; }
.mu-cello .${P}bow { transform: ${pose(LEAN.tip[0], LEAN.tip[1], LEAN_ANGLE)}; transition: transform 900ms cubic-bezier(.32,.72,0,1); }
.iso-host[data-open] .mu-cello .${P}bow { transform: ${pose(PLAY.x, PLAY.y, 0)}; }
.iso-host[data-open] .mu-cello .${P}bowi { animation: ${P}stroke ${PLAY_PASS.total}s ${ms(BOW_AT)}ms linear infinite; }
.iso-host[data-hover] .mu-cello .${P}s { animation: ${P}hum ${HOVER.total}s linear infinite; }
.iso-host[data-open] .mu-cello .${P}s { animation: ${P}hum-o ${PLAY_PASS.total}s ${ms(BOW_AT)}ms linear infinite; }
.iso-host[data-hover] .mu-cello .${P}rise { animation: ${P}up ${HOVER.total}s cubic-bezier(.3,.6,.4,1) infinite; }
`
