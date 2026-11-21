/**
 * [INPUT]: bowedBody and bow from ./bowed.ts; the engraving kit of ./line.ts
 * [OUTPUT]: celloSvg(): VIOLONCELLO · IV, a cello upright on its endpin with the bow leaning on its right side (280×340) for the empty Materials pane; CELLO_CSS; CELLO_STRINGS (4)
 * [POS]: music object M4, the counterpart of the cabinet, same viewBox so the pane's layout holds. The bow has two poses on one group: leaning (tip on the upper bout, frog on the floor)
 *        and playing (horizontal on the contact line between fingerboard end and bridge). Hover: the four strings hum and notes leave the left f-hole into the blank upper left.
 *        Click swings the bow to the playing pose, then it strokes along its own axis, so the hair never leaves the strings
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { bow, bowedBody } from './bowed.ts'
import { line, note, plate, r, riseFrames, shadow, shadowDef } from './line.ts'

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
  const bowG = `<g class="${P}bow" style="transform-box:view-box;transform-origin:0 0"><g class="${P}bowi">${bow(BOW)}</g></g>`
  const body = `<defs>${C.defs}${shadowDef(`${P}sh`)}</defs>` + shadow(`${P}sh`, CX + 30, FLOOR, 110, 9) + floor() + C.markup + rising() + bowG + plate(52, 322, 'VIOLONCELLO · IV', 4.6)
  return `<svg class="mu mu-cello" viewBox="0 0 280 340" role="img" aria-hidden="true">${body}</svg>`
}

export const CELLO_CSS = `
@keyframes ${P}hum { 0%, 100% { transform: none; } 25% { transform: translateX(.4px); } 75% { transform: translateX(-.4px); } }
@keyframes ${P}stroke { 0% { transform: translateX(-26px); } 100% { transform: translateX(26px); } }
${riseFrames(`${P}up`, -70, -120, 72)}
.mu-cello .${P}rise { opacity: 0; }
.mu-cello .${P}bow { transform: ${pose(LEAN.tip[0], LEAN.tip[1], LEAN_ANGLE)}; transition: transform 900ms cubic-bezier(.32,.72,0,1); }
.iso-host[data-open] .mu-cello .${P}bow { transform: ${pose(PLAY.x, PLAY.y, 0)}; }
.iso-host[data-open] .mu-cello .${P}bowi { animation: ${P}stroke 1.2s 900ms ease-in-out infinite alternate; }
.iso-host:hover .mu-cello .${P}s, .iso-host[data-open] .mu-cello .${P}s { animation: ${P}hum .13s linear infinite; }
.iso-host:hover .mu-cello .${P}rise { animation: ${P}up 2.8s cubic-bezier(.3,.6,.4,1) infinite; }
`
