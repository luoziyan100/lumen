/**
 * [INPUT]: escapeXml from ../iso.ts; BoxWords and BOX_CARD from ../box.ts (the front card keeps the sidebar box's words contract); the engraving kit of ./line.ts; the Score type and ms from ./pitch.ts
 * [OUTPUT]: musicBoxSvg({ words }): CARILLON · V, a cylinder music box in cabinet oblique (260×220) for the topic sidebar; MUSIC_BOX_CSS; MUSIC_BOX_SCORE (the click score); MUSIC_BOX_TEETH (18)
 * [POS]: music object M5, the counterpart of the takeaway box; the front card shows the newest takeaway (stamp and two lines, escaped, clipped to the card) or stays blank.
 *        The box recedes up-right by D. The lid's top face turns about its back edge (HINGE); its inner face rises from the box's back edge (BACK). Hover cracks it: the top face shortens toward the hinge and the front band lifts, showing a dark slit.
 *        Click folds the top face onto the hinge, then raises the lid's inner face (an engraved staff of the box's tune). Inside, a pinned strip slides down the cylinder;
 *        each pin reaches the comb at the tooth under it, that tooth twitches and a note rises into the blank upper left. Every timing comes from one table (TUNE):
 *        it gives the pluck cues of MUSIC_BOX_SCORE, and the teeth, the notes and the strip read their delays from those cues
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { escapeXml } from '../iso.ts'
import { BOX_CARD, type BoxWords } from '../box.ts'
import { circle, hatch, knurl, line, note, path, plate, r, rect, rivet, screw, shadow, shadowDef } from './line.ts'
import { cycle, restFrames } from './cycle.ts'
import { ms, type Score } from './pitch.ts'

const P = 'mb-'
const FRONT = { x0: 40, x1: 200, top: 122, bottom: 186 }, BAND = 108, D = 26, HINGE = BAND - D, BACK = FRONT.top - D
export const MUSIC_BOX_TEETH = 18
const TOOTH = (i: number) => 90 + i * 5
const TUNE = [2, 5, 8, 10, 13, 15, 11, 6]
const LOOP = 4, SP = 3.2, OPEN_MS = 900
const CYL = { x: 86, y: 100, w: 108, h: 8 }

const poly = (pts: [number, number][], cls: string) => path('M' + pts.map(p => `${r(p[0])} ${r(p[1])}`).join('L') + 'Z', cls)

function body() {
  const { x0, x1, top, bottom } = FRONT
  let out = poly([[x1, top], [x1 + D, top - D], [x1 + D, bottom - D], [x1, bottom]], 'w1 pf')
  out += hatch(`${P}side`, [x1, top - D, D, bottom - top + D], 90, 1.6)
  out += rect(x0, top, x1 - x0, bottom - top, 'w2 pf') + rect(x0 + 3, top + 3, x1 - x0 - 6, bottom - top - 6, 'w0') + rect(x0 + 4.6, top + 4.6, x1 - x0 - 9.2, bottom - top - 9.2, 'w0')
  for (const [x, y] of [[x0 + 8, top + 8], [x1 - 8, top + 8], [x0 + 8, bottom - 8], [x1 - 8, bottom - 8]] as const) out += circle(x, y, 2.4, 'w0') + circle(x, y, 1, 'w0') + knurl(x, y, 2.4, 10, .9)
  for (let y = top + 14; y < bottom - 6; y += 2.2) out += line(x0 + 5, y, x0 + 20, y + .3, 'w0') + line(x1 - 20, y + .3, x1 - 5, y, 'w0')
  for (const x of [x0 + 6, x1 - 18]) out += path(`M${x} ${bottom}L${x + 12} ${bottom}L${x + 10} ${bottom + 6}L${x + 2} ${bottom + 6}Z`, 'w1 pf') + line(x + 1, bottom + 2, x + 11, bottom + 2, 'w0')
  out += path(`M${x1 + D - 6} ${bottom - D - 4}L${x1 + D} ${bottom - D - 10}L${x1 + D} ${bottom - D + 2}`, 'w0')
  const kx = x1 + D / 2 + 1, ky = (top + bottom) / 2 - D / 2
  out += rect(kx - 1, ky - 1, 6, 2, 'w1 pf') + path(`M${kx + 5} ${ky}C${kx + 7} ${ky - 9} ${kx + 13} ${ky - 9} ${kx + 13} ${ky}C${kx + 13} ${ky + 9} ${kx + 7} ${ky + 9} ${kx + 5} ${ky}Z`, 'w1 pf') + circle(kx + 10, ky, 1.2, 'w0')
  return out
}

function card(words: BoxWords | null) {
  const x = 66, y = 128, w = 108, h = 40
  let out = rect(x - 2, y - 2, w + 4, h + 4, 'w1 pf', 1) + rect(x, y, w, h, 'w0 pf') + screw(x + 2, y + 2, 1.3, 30) + screw(x + w - 2, y + 2, 1.3, 120) + screw(x + 2, y + h - 2, 1.3, 70) + screw(x + w - 2, y + h - 2, 1.3, 10)
  if (!words) return out + line(x + 10, y + 20, x + w - 10, y + 20, 'w0 dash')
  out += `<g clip-path="url(#${P}card)"><text x="${x + 8}" y="${y + 10.5}" font-size="4.6" class="${P}stamp">${escapeXml(words.stamp)}</text>`
  out += words.lines.slice(0, BOX_CARD.lines).map((value, i) => `<text x="${x + 8}" y="${r(y + 21.5 + i * 9.5)}" font-size="${BOX_CARD.size}">${escapeXml(value)}</text>`).join('') + `</g>`
  return out
}

function interior() {
  const { x0, x1, top } = FRONT
  let out = poly([[x0, top], [x1, top], [x1 + D, top - D], [x0 + D, top - D]], 'w0 pf')
  out += hatch(`${P}in`, [x0, top - D, x1 - x0 + D, D], -45, 1.1)
  out += poly([[x0 + 4, top - 2], [x1 - 2, top - 2], [x1 + D - 4, top - D + 2], [x0 + D + 2, top - D + 2]], 'w0 pf')
  out += rect(CYL.x - 4, CYL.y - 1, 4, CYL.h + 2, 'w1 pf') + rect(CYL.x + CYL.w, CYL.y - 1, 4, CYL.h + 2, 'w1 pf')
  out += rect(CYL.x, CYL.y, CYL.w, CYL.h, 'w1 pf') + line(CYL.x, CYL.y + 2, CYL.x + CYL.w, CYL.y + 2, 'w0') + line(CYL.x, CYL.y + CYL.h - 1.6, CYL.x + CYL.w, CYL.y + CYL.h - 1.6, 'w0')
  let pins = ''
  for (const copy of [0, 1]) TUNE.forEach((t, k) => { pins += circle(TOOTH(t) + 6, CYL.y + CYL.h - (k + 1) * SP - copy * TUNE.length * SP, .55, 'if ns') })
  for (let i = 0; i < 26; i++) pins += circle(CYL.x + 3 + (i * 37) % (CYL.w - 6), CYL.y + CYL.h - ((i * 13) % 24) - 1, .3, 'if ns')
  out += `<g clip-path="url(#${P}cyl)"><g class="${P}pins">${pins}</g></g>`
  out += poly([[84, 118], [182, 118], [186, 114], [88, 114]], 'w1 pf') + rivet(92, 116, .9) + rivet(178, 116, .9)
  for (let i = 0; i < MUSIC_BOX_TEETH; i++) {
    const x = TOOTH(i), cls = `w1 ${P}t ${P}t${i}`
    out += `<path d="M${x} 114L${x + 6} ${CYL.y + CYL.h}" class="${cls}" style="transform-box:view-box;transform-origin:${x}px 114px"/>`
  }
  out += circle(66, 112, 5.5, 'w1 pf') + knurl(66, 112, 5.5, 22, 1) + circle(66, 112, 1.6, 'w0')
  out += circle(206, 106, 3.4, 'w0 pf') + line(203, 106, 209, 106, 'w1') + line(206, 103, 206, 109, 'w0')
  return out
}

function lid() {
  const { x0, x1 } = FRONT
  let top = poly([[x0, BAND], [x1, BAND], [x1 + D, HINGE], [x0 + D, HINGE]], 'w1 pf')
  for (let k = 1; k < 7; k++) { const y = BAND - k * 3, s = BAND - y; top += line(x0 + s + 3, y, x1 + s - 3, y, 'w0') }
  top += poly([[x0 + 24, BAND - 4], [x1 - 14, BAND - 4], [x1 - 4, BAND - 14], [x0 + 34, BAND - 14]], 'w0 pf') + `<text x="${(x0 + x1) / 2}" y="${BAND - 7.6}" font-size="4.4" letter-spacing="1.2" text-anchor="middle" transform="skewX(-45) translate(${BAND} 0)">CARILLON</text>`
  let band = rect(x0, BAND, x1 - x0, FRONT.top - BAND, 'w1 pf') + line(x0 + 2, BAND + 3, x1 - 2, BAND + 3, 'w0') + line(x0 + 2, FRONT.top - 3, x1 - 2, FRONT.top - 3, 'w0')
  for (let x = x0 + 6; x < x1 - 4; x += 3.4) band += line(x, BAND + 4.6, x, FRONT.top - 4.6, 'w0')
  band += poly([[x1, FRONT.top], [x1 + D, FRONT.top - D], [x1 + D, HINGE], [x1, BAND]], 'w1 pf') + rect(116, FRONT.top - 2, 8, 4, 'w1 pf')
  const slit = rect(x0 + 1, BAND, x1 - x0 - 2, FRONT.top - BAND, `if ns ${P}slit`)
  return slit + `<g class="${P}top" style="transform-box:view-box;transform-origin:0 ${HINGE}px">${top}</g>` + `<g class="${P}band" style="transform-box:view-box;transform-origin:0 ${BAND}px">${band}</g>`
}

function innerFace() {
  const x = FRONT.x0 + D, w = FRONT.x1 - FRONT.x0, h = 58, y = BACK - h
  let out = rect(x, y, w, h, 'w1 pf') + rect(x + 3, y + 3, w - 6, h - 6, 'w0') + rect(x + 5, y + 5, w - 10, h - 10, 'w0')
  const st = { x0: x + 14, x1: x + w - 14, top: y + 18, gap: 3.4 }
  for (let i = 0; i < 5; i++) out += line(st.x0, st.top + i * st.gap, st.x1, st.top + i * st.gap, 'w0')
  TUNE.forEach((t, k) => { out += note(k % 4 === 3 ? 'h' : 'q', st.x0 + 14 + k * 15, st.top + 4 * st.gap - (t - 2) * st.gap / 4, .6) })
  out += line(st.x0 + 72, st.top, st.x0 + 72, st.top + 4 * st.gap, 'w0') + line(st.x1, st.top, st.x1, st.top + 4 * st.gap, 'w1')
  return `<g class="${P}inner" style="transform-box:view-box;transform-origin:0 ${BACK}px">${out}</g>`
}

function rising() {
  return TUNE.map((_, k) => `<g class="${P}n ${P}n${k}">${note((['e', 'q', 'e', 'q'] as const)[k % 4]!, 52 - (k % 3) * 4, 100, .7)}</g>`).join('')
}

export function musicBoxSvg({ words }: { words: BoxWords | null }) {
  const defs = `<defs>${shadowDef(`${P}sh`)}<clipPath id="${P}card"><rect x="68" y="130" width="104" height="36"/></clipPath>` +
    `<clipPath id="${P}side"><path d="M${FRONT.x1} ${FRONT.top}L${FRONT.x1 + D} ${FRONT.top - D}L${FRONT.x1 + D} ${FRONT.bottom - D}L${FRONT.x1} ${FRONT.bottom}Z"/></clipPath>` +
    `<clipPath id="${P}in"><path d="M${FRONT.x0} ${FRONT.top}L${FRONT.x1} ${FRONT.top}L${FRONT.x1 + D} ${FRONT.top - D}L${FRONT.x0 + D} ${FRONT.top - D}Z"/></clipPath>` +
    `<clipPath id="${P}cyl">${rect(CYL.x, CYL.y, CYL.w, CYL.h, '')}</clipPath></defs>`
  const content = defs + shadow(`${P}sh`, 130, 194, 110, 9) + body() + card(words) + interior() + innerFace() + lid() + rising() + plate(130, 208, 'CARILLON · V', 4.4)
  return `<svg class="mu mu-box" viewBox="0 0 260 220" role="img" aria-hidden="true">${content}</svg>`
}

/* ============================================================
   Motion · pin k reaches the comb at (k + 1) / N of the loop
   ============================================================ */
const OPEN = OPEN_MS / 1000, RISE = .4 * LOOP
const PLUCKS = TUNE.map((t, k) => ({ at: r(((k + 1) / TUNE.length * LOOP) % LOOP), dur: .7, part: `t${t}`, sound: { kind: 'reed' as const, tooth: t }, level: .6 }))
const PASS = cycle(r(Math.max(...PLUCKS.map(p => p.at)) + RISE))
const toothRules = TUNE.map((t, k) => `.iso-host[data-open] .mu-box .${P}t${t} { animation: ${P}pluck ${PASS.total}s ${r(OPEN + PLUCKS[k]!.at)}s linear infinite; }\n.iso-host[data-open] .mu-box .${P}n${k} { animation: ${P}up ${PASS.total}s ${r(OPEN + PLUCKS[k]!.at)}s cubic-bezier(.3,.6,.4,1) infinite; }`).join('\n')

/* Score · the pointer cracks the lid with a light knock. Open: the strip slides once (from 0.9 s) and each pin's pluck sounds its tooth, one pass of TUNE until the last note
   has risen, then the cylinder stops and rests; that first pass is the click's sound. Closing, the lid lands with a light knock and the tune fades */
export const MUSIC_BOX_SCORE: Score = {
  open: [],
  close: [{ at: .62, dur: .2, part: 'top', sound: { kind: 'noise', noise: 'wood' }, level: .7 }],
  hoverIn: [{ at: .06, dur: .12, part: 'top', sound: { kind: 'noise', noise: 'wood' }, level: .35 }],
  loops: [{ when: { open: true }, cycle: PASS, clock: { animation: `${P}slide`, target: `${P}pins`, delay: OPEN }, cues: [...PLUCKS].sort((a, b) => a.at - b.at) }],
  limit: 1.8,
}

export const MUSIC_BOX_CSS = `
${restFrames(`@keyframes ${P}slide { 0% { transform: translateY(0); } 100% { transform: translateY(${r(TUNE.length * SP)}px); } }`, LOOP, PASS)}
${restFrames(`@keyframes ${P}pluck { 0% { transform: none; } 2% { transform: rotate(-9deg); } 5% { transform: rotate(5deg); } 8% { transform: rotate(-3deg); } 11% { transform: rotate(1.4deg); } 14%, 100% { transform: none; } }`, LOOP, PASS)}
${restFrames(`@keyframes ${P}up { 0% { opacity: 0; transform: translate(0, 0); } 6% { opacity: 1; } 40% { opacity: 0; transform: translate(-18px, -60px); } 100% { opacity: 0; transform: translate(-18px, -60px); } }`, LOOP, PASS)}
.mu-box .${P}n { opacity: 0; }
.mu-box .${P}slit { opacity: 0; transition: opacity 200ms; }
.iso-host:hover:not([data-open]) .mu-box .${P}slit { opacity: 1; }
.mu-box .${P}stamp { opacity: .62; }
.mu-box .${P}top, .mu-box .${P}band { transform: none; transition: transform 380ms cubic-bezier(.32,.72,0,1) 460ms; }
.mu-box .${P}inner { transform: scaleY(0); transition: transform 460ms cubic-bezier(.32,.72,0,1); }
.iso-host:hover:not([data-open]) .mu-box .${P}top { transform: scaleY(.65); transition-delay: 0ms; }
.iso-host:hover:not([data-open]) .mu-box .${P}band { transform: translateY(-9px); transition-delay: 0ms; }
.iso-host[data-open] .mu-box .${P}top { transform: scaleY(0); transition-delay: 0ms; }
.iso-host[data-open] .mu-box .${P}band { transform: translateY(-${FRONT.top - BAND}px) scaleY(0); transition-delay: 0ms; }
.iso-host[data-open] .mu-box .${P}inner { transform: scaleY(1); transition-delay: 360ms; }
.iso-host[data-open] .mu-box .${P}pins { animation: ${P}slide ${PASS.total}s ${ms(OPEN)}ms linear infinite; }
${toothRules}
`
