/**
 * [INPUT]: bowedBody and bow from ./bowed.ts; the engraving kit of ./line.ts; the Score type and ms from ./pitch.ts
 * [OUTPUT]: violinSvg(): VIOLINO · VII, a violin upright with its bow laid across the strings (640×400) for the empty Ideas view; VIOLIN_CSS; VIOLIN_SCORE (the click score); VIOLIN_STRINGS (4, for the tests)
 * [POS]: music object M7, the counterpart of the lamp. Right of the violin, DETAIL A magnifies bridge, strings and the E-string fine tuner at 3:1 (mapped from the main view).
 *        Hover bows: the bow slides along its own axis (the hair stays on the contact line between fingerboard end and bridge), the four strings hum, notes rise into the blank upper right.
 *        Click plays a pizzicato chord: the bow lifts off to the lower right, the strings are plucked G → E one after another at their cues in VIOLIN_SCORE, a chord rises once
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { bow, bowedBody } from './bowed.ts'
import { circle, dbl, detail, ellipse, hatch, knurl, line, note, path, plate, r, rect, riseFrames, screw, shadow, shadowDef } from './line.ts'
import { cycle, restFrames } from './cycle.ts'
import { ms, type Score } from './pitch.ts'

const P = 'vn-'
const CX = 196, TOP = 150, LEN = 160, BOW = 330
export const VIOLIN_STRINGS = 4

const V = bowedBody({ prefix: P, cx: CX, top: TOP, len: LEN, chinrest: true })
const TIP_X = CX - 74, ANGLE = -5

/* DETAIL A: bridge, strings and the E-string fine tuner at 3:1, mapped from the main view so every part sits where the main view puts it */
const MARK = { x: CX, y: V.y(.65), r: 21.3 }, WIN = { x: 530, y: 240, r: 64 }, MAG = 3
const mag = (x: number, y: number): [number, number] => [WIN.x + (x - MARK.x) * MAG, WIN.y + (y - MARK.y) * MAG]
function detailA() {
  let c = ''
  for (let x = WIN.x - WIN.r; x < WIN.x + WIN.r; x += 7.8) c += line(x, WIN.y - WIN.r, x + 1, WIN.y + WIN.r, 'w0 mu-gr')
  const by = mag(0, V.bridge)[1]
  const bx = (v: number) => mag(CX + v * LEN, 0)[0]
  for (const [a0, a1] of [[-.072, -.042], [.042, .072]] as const) c += rect(bx(a0), by + 3, bx(a1) - bx(a0), 7, 'w1 pf') + hatch(`${P}ft${a0 < 0 ? 'l' : 'r'}`, [bx(a0), by + 3, bx(a1) - bx(a0), 7], 45, 1.2)
  c += `<clipPath id="${P}ftl">${rect(bx(-.072), by + 3, bx(-.042) - bx(-.072), 7, '')}</clipPath><clipPath id="${P}ftr">${rect(bx(.042), by + 3, bx(.072) - bx(.042), 7, '')}</clipPath>`
  const top = (v: number) => by - 6 * (1 - (v / .085) ** 2)
  let arc = `M${r(bx(-.085))} ${r(top(-.085) + 4)}`
  for (let v = -.085; v <= .0851; v += .0085) arc += `L${r(bx(v))} ${r(top(v))}`
  let under = ''
  for (let v = .085; v >= -.0851; v -= .0085) under += `L${r(bx(v))} ${r(top(v) + 4.4)}`
  c += path(arc + under + 'Z', 'w2 pf') + path(arc.replace(/^M[^L]*L/, 'M'), 'w0') + path(`M${r(bx(-.03))} ${r(top(-.03) + 4.4)}C${r(bx(-.012))} ${r(by - 10)} ${r(bx(.012))} ${r(by - 10)} ${r(bx(.03))} ${r(top(.03) + 4.4)}`, 'w0')
  const tailY = mag(0, V.y(.7))[1]
  c += path(`M${r(bx(-.05))} ${r(tailY)}C${r(bx(-.02))} ${r(tailY - 5)} ${r(bx(.02))} ${r(tailY - 5)} ${r(bx(.05))} ${r(tailY)}L${r(bx(.046))} ${r(WIN.y + WIN.r)}L${r(bx(-.046))} ${r(WIN.y + WIN.r)}Z`, 'w1 pf')
  c += `<clipPath id="${P}tpd"><path d="M${r(bx(-.05))} ${r(tailY)}C${r(bx(-.02))} ${r(tailY - 5)} ${r(bx(.02))} ${r(tailY - 5)} ${r(bx(.05))} ${r(tailY)}L${r(bx(.046))} ${r(WIN.y + WIN.r)}L${r(bx(-.046))} ${r(WIN.y + WIN.r)}Z"/></clipPath>` + hatch(`${P}tpd`, [bx(-.06), tailY - 6, bx(.06) - bx(-.06), 70], -58, 1.3)
  for (let i = 0; i < 4; i++) {
    const x0 = mag(V.stringX(i, .5), 0)[0], xb = mag(V.stringX(i, .55), 0)[0], xt = mag(V.stringX(i, .725), 0)[0], yt = mag(0, V.y(.725))[1]
    const d = `M${r(x0)} ${r(WIN.y - WIN.r)}L${r(xb)} ${r(top((V.stringX(i, .55) - CX) / LEN))}L${r(xt)} ${r(yt)}`
    c += i === 0 ? dbl(d, 1.8, .3) : i === 1 ? dbl(d, 1.3, .3) : path(d, i === 2 ? 'w1' : 'w0')
    c += path(`M${r(xb - 1.6)} ${r(top((V.stringX(i, .55) - CX) / LEN) - .4)}L${r(xb)} ${r(top((V.stringX(i, .55) - CX) / LEN) + 1.6)}L${r(xb + 1.6)} ${r(top((V.stringX(i, .55) - CX) / LEN) - .4)}`, 'w0')
    if (i < 3) c += circle(xt, yt, 1.8, 'w1 pf') + ellipse(xt, yt + 3.2, 1.4, 1, 'w1 pf')
  }
  const [fx, fy] = mag(CX + .032 * LEN, V.y(.75))
  c += path(`M${r(fx - 6)} ${r(fy - 10)}L${r(fx + 5)} ${r(fy - 12)}L${r(fx + 7)} ${r(fy + 8)}L${r(fx - 4)} ${r(fy + 10)}Z`, 'w1 pf') + line(fx - 3, fy - 8, fx + 4, fy - 9.4, 'w0')
  c += path(`M${r(fx - 2)} ${r(fy - 12)}C${r(fx - 1)} ${r(fy - 20)} ${r(fx + 6)} ${r(fy - 20)} ${r(fx + 5)} ${r(fy - 12)}`, 'w1') + circle(mag(V.stringX(3, .725), 0)[0], mag(0, V.y(.725))[1], 1.6, 'w1 pf')
  c += circle(fx + 1, fy + 2, 6.4, 'w1 pf') + knurl(fx + 1, fy + 2, 6.4, 30, 1.3) + circle(fx + 1, fy + 2, 3.6, 'w0') + line(fx - 1.6, fy + 2, fx + 3.6, fy + 2, 'w1')
  c += screw(fx - 3, fy - 8.6, 1.3, 20)
  return detail(`${P}da`, MARK, WIN, 'DETAIL A · 3:1', c)
}

function rising() {
  const kinds = ['e', 'q', 'b', 'e', 'h'] as const
  return kinds.map((kind, i) => `<g class="${P}rise" style="animation-delay:${r(i * .62)}s">${note(kind, 300 + (i * 47) % 150, 196 - (i % 2) * 14, .95)}</g>`).join('')
}

function chord() {
  return `<g class="${P}chord">${note('q', 316, 190, 1)}${note('q', 324, 184, 1)}${note('q', 332, 178, 1)}${note('q', 340, 172, 1)}</g>`
}

export function violinSvg() {
  const [cx, cy] = [TIP_X, V.contact]
  const bowG = `<g class="${P}bow" style="transform-box:view-box;transform-origin:${r(CX)}px ${r(cy)}px"><g transform="rotate(${ANGLE} ${r(CX)} ${r(cy)}) translate(${r(cx)} ${r(cy)})">` +
    `<g class="${P}bowi">${bow(BOW, P)}</g></g></g>`
  const body = `<defs>${V.defs}${shadowDef(`${P}sh`)}</defs>` + shadow(`${P}sh`, CX + 8, 330, 120, 22) + V.markup + detailA() + bowG + rising() + chord() + plate(540, 372, 'VIOLINO · VII')
  return `<svg class="mu mu-violin" viewBox="0 0 640 400" role="img" aria-hidden="true">${body}</svg>`
}

/* Score · hover bows two unhurried round trips on a gentle D major phrase (D4 → F♯4 → A4 → F♯4), then rests on the string.
   Click: pizzicato G D A E one after another, each string sounding as its own shake starts; closing makes no sound */
const STROKE = 1.4, HUM = .12, PASS = cycle(4 * STROKE)
const BOW_PHRASE: [number, number][] = [[0, .48], [2, .56], [4, .52], [2, .4]]
const PIZZ_VEL = [.52, .58, .64, .56]
export const VIOLIN_SCORE: Score = {
  open: [0, 1, 2, 3].map(i => ({ at: i * .09, dur: .8, part: `s${i}`, sound: { kind: 'pizz' as const, string: i }, level: PIZZ_VEL[i]! })),
  close: [],
  hoverIn: [],
  loops: [{ when: { hover: true, open: false }, cycle: PASS, clock: { animation: `${P}stroke`, target: `${P}bowi`, delay: 0 }, cues: BOW_PHRASE.map(([degree, level], k) => ({ at: r(k * STROKE), dur: STROKE, part: 'bowi', sound: { kind: 'bow' as const, instrument: 'violin' as const, degree }, level })) }],
  limit: 1.8,
}
const pluck = (i: number) => `.iso-host[data-open] .mu-violin .${P}s${i} { animation: ${P}pluck 900ms ${ms(VIOLIN_SCORE.open[i]!.at)}ms ease-out 1 both; }`

export const VIOLIN_CSS = `
${restFrames(`@keyframes ${P}hum { 0%, 100% { transform: none; } 25% { transform: translateX(.45px); } 75% { transform: translateX(-.45px); } }`, HUM, PASS, Math.floor(PASS.run / HUM))}
${restFrames(`@keyframes ${P}stroke { 0% { transform: translateX(-44px); animation-timing-function: ease-in-out; } 50% { transform: translateX(44px); animation-timing-function: ease-in-out; } 100% { transform: translateX(-44px); } }`, 2 * STROKE, PASS, 2)}
@keyframes ${P}pluck { 0% { transform: none; } 8% { transform: translateX(1.4px); } 18% { transform: translateX(-1.1px); } 30% { transform: translateX(.8px); } 44% { transform: translateX(-.5px); } 60% { transform: translateX(.25px); } 80%, 100% { transform: none; } }
${restFrames(riseFrames(`${P}up`, 60, -118, 70), 3.1, PASS)}
@keyframes ${P}chord-up { 0% { opacity: 0; transform: translate(0, 0); } 12% { opacity: 1; } 70% { opacity: .85; } 100% { opacity: 0; transform: translate(70px, -120px); } }
.mu-violin .${P}rise, .mu-violin .${P}chord { opacity: 0; }
.mu-violin .${P}bow { transform: none; transition: transform 800ms cubic-bezier(.32,.72,0,1); }
.iso-host[data-open] .mu-violin .${P}bow { transform: translate(10px, 118px) rotate(2deg); }
.iso-host[data-hover]:not([data-open]) .mu-violin .${P}bowi { animation: ${P}stroke ${PASS.total}s linear infinite; }
.iso-host[data-hover]:not([data-open]) .mu-violin .${P}s { animation: ${P}hum ${PASS.total}s linear infinite; }
.iso-host[data-hover]:not([data-open]) .mu-violin .${P}rise { animation: ${P}up ${PASS.total}s cubic-bezier(.3,.6,.4,1) infinite; }
${[0, 1, 2, 3].map(pluck).join('\n')}
.iso-host[data-open] .mu-violin .${P}chord { animation: ${P}chord-up 1.2s 150ms cubic-bezier(.3,.6,.4,1) 1 both; }
`
