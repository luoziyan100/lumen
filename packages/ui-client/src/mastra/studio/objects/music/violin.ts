/**
 * [INPUT]: bowedBody and bow from ./bowed.ts; the engraving kit of ./line.ts
 * [OUTPUT]: violinSvg(): VIOLINO · VII, a violin upright with its bow laid across the strings (640×400) for the empty Ideas view; VIOLIN_CSS; VIOLIN_STRINGS (4, for the tests)
 * [POS]: music object M7, the counterpart of the lamp. Right of the violin sits a side elevation (arching, ribs, neck angle, scroll) under a dimension line.
 *        Hover bows: the bow slides along its own axis (the hair stays on the contact line between fingerboard end and bridge), the four strings hum, notes rise into the blank upper right.
 *        Click plays a pizzicato chord: the bow lifts off to the lower right, the strings are plucked G → E one after another, a chord rises once
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { bow, bowedBody } from './bowed.ts'
import { circle, curve, line, note, path, plate, r, rect, riseFrames, shadow, shadowDef, ticks } from './line.ts'

const P = 'vn-'
const CX = 196, TOP = 150, LEN = 160, BOW = 330
export const VIOLIN_STRINGS = 4

const V = bowedBody({ prefix: P, cx: CX, top: TOP, len: LEN, chinrest: true })
const TIP_X = CX - 74, ANGLE = -5

function elevation() {
  const x0 = 440, y0 = 296, L = 150, h = 9
  let out = `<text x="${x0 - 8}" y="${y0 - 34}" font-size="4" letter-spacing="1">ELEV · B</text>`
  out += line(x0, y0 - 26, x0 + L, y0 - 26, 'w0') + line(x0, y0 - 29, x0, y0 - 23, 'w0') + line(x0 + L, y0 - 29, x0 + L, y0 - 23, 'w0')
  out += `<rect x="${x0 + L / 2 - 10}" y="${y0 - 29.5}" width="20" height="7" class="pf ns"/><text x="${x0 + L / 2}" y="${y0 - 24.2}" font-size="4.6" letter-spacing="1" text-anchor="middle">356</text>`
  const arch = curve([x0, y0], [['C', [x0 + 20, y0 - 8], [x0 + L - 20, y0 - 8], [x0 + L, y0]]])
  const back = curve([x0, y0 + h], [['C', [x0 + 20, y0 + h + 6], [x0 + L - 20, y0 + h + 6], [x0 + L, y0 + h]]])
  out += path(arch.d, 'w1') + path(back.d, 'w1') + rect(x0, y0, L, h, 'w1 pf') + line(x0, y0 + 2, x0 + L, y0 + 2, 'w0') + line(x0, y0 + h - 2, x0 + L, y0 + h - 2, 'w0')
  out += ticks(arch.every(2.2), -2.6, 'w0', -1.6) + ticks(back.every(2.2), 2.6, 'w0', 1.6)
  for (let x = x0 + 4; x < x0 + L; x += 3) out += line(x, y0 + 2.6, x, y0 + h - 2.6, 'w0')
  out += path(`M${x0 + 70} ${y0 - 8}L${x0 + 76} ${y0 - 16}L${x0 + 80} ${y0 - 16}L${x0 + 82} ${y0 - 8}`, 'w1 pf')
  out += path(`M${x0} ${y0 - 2}L${x0 - 88} ${y0 - 14}L${x0 - 88} ${y0 - 8}L${x0} ${y0 + 4}`, 'w1 pf') + line(x0 + 76, y0 - 16, x0 - 88, y0 - 16 - 2, 'w0')
  out += path(`M${x0 - 88} ${y0 - 14}L${x0 - 120} ${y0 - 18}L${x0 - 120} ${y0 - 8}L${x0 - 88} ${y0 - 8}Z`, 'w1 pf')
  for (const dx of [-96, -104, -112]) out += line(x0 + dx, y0 - 22, x0 + dx, y0 - 4, 'w1')
  let d = ''
  for (let a = 0; a <= Math.PI * 4.6; a += Math.PI / 12) {
    const rad = 8 * (1 - a / (Math.PI * 4.6) * .85)
    d += `${d ? 'L' : 'M'}${r(x0 - 128 + Math.cos(a) * rad)} ${r(y0 - 13 + Math.sin(a) * rad)}`
  }
  out += circle(x0 - 128, y0 - 13, 8.4, 'w1 pf') + path(d, 'w0')
  out += line(x0 + L, y0 + 3, x0 + L + 6, y0 + 4.5, 'w1') + circle(x0 + L + 7, y0 + 4.5, 1.4, 'w1 pf')
  return out
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
    `<g class="${P}bowi">${bow(BOW)}</g></g></g>`
  const body = `<defs>${V.defs}${shadowDef(`${P}sh`)}</defs>` + shadow(`${P}sh`, CX + 8, 330, 120, 22) + V.markup + elevation() + bowG + rising() + chord() + plate(540, 372, 'VIOLINO · VII')
  return `<svg class="mu mu-violin" viewBox="0 0 640 400" role="img" aria-hidden="true">${body}</svg>`
}

const pluck = (i: number) => `.iso-host[data-open] .mu-violin .${P}s${i} { animation: ${P}pluck 900ms ${i * 90}ms ease-out 1 both; }`

export const VIOLIN_CSS = `
@keyframes ${P}hum { 0%, 100% { transform: none; } 25% { transform: translateX(.45px); } 75% { transform: translateX(-.45px); } }
@keyframes ${P}stroke { 0% { transform: translateX(-44px); } 100% { transform: translateX(44px); } }
@keyframes ${P}pluck { 0% { transform: none; } 8% { transform: translateX(1.4px); } 18% { transform: translateX(-1.1px); } 30% { transform: translateX(.8px); } 44% { transform: translateX(-.5px); } 60% { transform: translateX(.25px); } 80%, 100% { transform: none; } }
${riseFrames(`${P}up`, 60, -118, 70)}
@keyframes ${P}chord-up { 0% { opacity: 0; transform: translate(0, 0); } 12% { opacity: 1; } 70% { opacity: .85; } 100% { opacity: 0; transform: translate(70px, -120px); } }
.mu-violin .${P}rise, .mu-violin .${P}chord { opacity: 0; }
.mu-violin .${P}bow { transform: none; transition: transform 800ms cubic-bezier(.32,.72,0,1); }
.iso-host[data-open] .mu-violin .${P}bow { transform: translate(10px, 118px) rotate(2deg); }
.iso-host:hover:not([data-open]) .mu-violin .${P}bowi { animation: ${P}stroke 1.3s ease-in-out infinite alternate; }
.iso-host:hover:not([data-open]) .mu-violin .${P}s { animation: ${P}hum .12s linear infinite; }
.iso-host:hover:not([data-open]) .mu-violin .${P}rise { animation: ${P}up 3.1s cubic-bezier(.3,.6,.4,1) infinite; }
${[0, 1, 2, 3].map(pluck).join('\n')}
.iso-host[data-open] .mu-violin .${P}chord { animation: ${P}chord-up 2.2s 300ms cubic-bezier(.3,.6,.4,1) 1 both; }
`
