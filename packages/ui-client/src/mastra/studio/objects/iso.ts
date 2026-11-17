/**
 * [INPUT]: none (pure string builders; ported from the phase 1 kit doc/studio/prototype/objects/iso.js, which is git-ignored and stays the reference)
 * [OUTPUT]: the isometric kit: kit (projection + face), the brushes rect/line/circle/text/grain/joints, the motions hinge/move, the visibility helpers show/twin,
 *           BASE (shared strokes and the host rules), css (@property registration and hover/open/event rules for one object), escapeXml, textWidth and wrapText
 * [POS]: the base of studio/objects/: box, cabinet, typewriter and easel are built on it, and IsoObject mounts what they return. Markup is built once per data
 *        change; every state (hover, open, typing) moves only registered CSS variables, so a state change never rebuilds the SVG
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */

/* ============================================================
   Projection · model units are px; x runs front-right, y front-left, z up
   ============================================================ */
export type Vec = [number, number, number]

const C = Math.cos(Math.PI / 6), S = 0.5

function cross(a: Vec, b: Vec): Vec { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }

// Screen direction of a model vector (SVG y points down)
function screen(v: Vec) { return [C * v[0] - C * v[1], S * v[0] + S * v[1] - v[2]] as const }

/** A face reads unmirrored when u→right and v→down stay right and down on screen; every face that carries text must pass this */
export function facing(U: Vec, V: Vec) { const a = screen(U), b = screen(V); return a[0] * b[1] - a[1] * b[0] > 0 }

/**
 * One projection per object; (x0, y0) is where the model origin lands in the viewBox.
 * PROJ's third column is .3, not 0: the matrix must be invertible or the browser refuses to chain 3D transforms after it.
 */
export function kit({ x0, y0 }: { x0: number; y0: number }) {
  const PROJ = `matrix3d(${C},${S},.3,0,${-C},${S},.3,0,0,-1,.3,0,${x0},${y0},0,1)`
  /** A face: a flat drawing in (u, v) placed with its origin at O, u along U and v along V; extra is the motion between the projection and the face */
  function face(O: Vec, U: Vec, V: Vec, body: string, extra = '') {
    const N = cross(U, V)
    const M = `matrix3d(${U},0,${V},0,${N},0,${O},1)`
    return `<g class="f" style="transform:${PROJ} ${extra} ${M}">${body}</g>`
  }
  return { PROJ, face, x0, y0 }
}

/* ============================================================
   Text from data · escaped before it enters the markup, measured to fit
   ============================================================ */
const XML: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** Escape for SVG/XML text and attribute values: a title or a takeaway can never open a tag or end the text */
export const escapeXml = (value: string) => value.replace(/[&<>"']/g, ch => XML[ch]!)

// Wide glyphs (CJK, fullwidth forms) take a full em; everything else is estimated at .6em, the monospace advance
const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/
/** Estimated advance of a string at a font size; the paper and the card also clip, so an overshoot never leaves its sheet */
export function textWidth(value: string, size: number) {
  let em = 0
  for (const ch of value) em += WIDE.test(ch) ? 1 : 0.6
  return em * size
}

/** Break text into at most `lines` lines of `width`; Latin breaks at spaces when it can, CJK anywhere; the last line ends in … when text is left over */
export function wrapText(value: string, width: number, size: number, lines: number): string[] {
  const out: string[] = []
  let rest = value.replace(/\s+/g, ' ').trim()
  while (rest && out.length < lines) {
    let cut = 0, used = 0
    for (const ch of rest) { const w = textWidth(ch, size); if (used + w > width) break; used += w; cut += ch.length }
    if (cut >= rest.length) { out.push(rest); rest = ''; break }
    const space = rest.lastIndexOf(' ', cut)
    if (space > 0 && !WIDE.test(rest[cut]!)) cut = space
    out.push(rest.slice(0, Math.max(cut, 1)).trimEnd())
    rest = rest.slice(Math.max(cut, 1)).trimStart()
  }
  if (rest && out.length) {
    let last = out[out.length - 1]!
    while (last && textWidth(last + '…', size) > width) last = [...last].slice(0, -1).join('')
    out[out.length - 1] = last.trimEnd() + '…'
  }
  return out
}

/* ============================================================
   Brushes · all drawn in the face's own (u, v)
   ============================================================ */
export const rect = (x: number, y: number, w: number, h: number, fill: string, cls = 'ln', rx = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" class="${cls}"/>`
export const line = (x1: number, y1: number, x2: number, y2: number, cls = 'hair') => `<path d="M${x1} ${y1}L${x2} ${y2}" class="${cls}"/>`
export const circle = (cx: number, cy: number, r: number, fill: string, cls = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${cls ? ` class="${cls}"` : ''}/>`
/** Text is always escaped here, so labels and data take one path; attrs are the builders' own constants */
export const text = (x: number, y: number, size: number, value: string, attrs = '') => `<text x="${x}" y="${y}" font-size="${size}"${attrs ? ' ' + attrs : ''}>${escapeXml(value)}</text>`

/** A few long, slightly bent grain lines; seed makes each face's grain differ */
export function grain(w: number, h: number, seed: number, n = 5) {
  let out = ''
  for (let i = 0; i < n; i++) {
    const y = h * (i + .6) / (n + .4) + Math.sin(seed + i * 1.7) * 2
    const a = Math.sin(seed * 3 + i) * 2.2, b = Math.cos(seed + i * 2.3) * 2.2
    const x1 = 4 + ((i * 13 + seed * 7) % 9), x2 = w - 4 - ((i * 7 + seed * 5) % 11)
    out += `<path d="M${x1} ${y}C${w * .3} ${y + a},${w * .62} ${y + b},${x2} ${y + a * .4}" class="grain"/>`
  }
  return out
}

/** Finger joints on a vertical corner: at u = atU, one block every other 8 units */
export function joints(atU: number, w: number, h: number, start: number, fill = '#e9dfcb') {
  let out = ''
  for (let v = start, k = 0; v < h - 1; v += 8, k++) if (k % 2 === 0) out += rect(atU, v, w, Math.min(8, h - v), fill, 'hair')
  return out
}

/* ============================================================
   Motion · CSS functions between the projection and the face matrix, in model px
   ============================================================ */
const px = (n: number) => `${n}px`
/** Turn about the axis through P parallel to 'X' | 'Y' | 'Z'; deg is an expression such as 'var(--iso-lid) * -1' */
export function hinge(P: Vec, axis: 'X' | 'Y' | 'Z', deg: string) {
  return `translate3d(${P.map(px)}) rotate${axis}(calc(${deg}deg)) translate3d(${P.map(n => px(-n))})`
}
/** Move along dir by amount (an expression) per unit; zero components stay 0px */
export function move(dir: Vec, amount: string) {
  return `translate3d(${dir.map(k => (k ? `calc(${amount} * ${k}px)` : '0px'))})`
}

/* ============================================================
   Visibility and paint order · a part that turns from front to back is drawn twice and switched by the same variable
   ============================================================ */
/** Visible while the expression is > 0 (clamped to 0..1, so it switches within one unit) */
export const show = (expr: string, body: string) => `<g style="opacity:clamp(0, calc(${expr}), 1)">${body}</g>`
/** early is drawn first and shows past the threshold; late is drawn after and shows before it */
export function twin(v: string, at: number, early: string, late = early) {
  return { early: show(`var(${v}) - ${at}`, early), late: show(`${at} - var(${v})`, late) }
}

/* ============================================================
   CSS · shared drawing rules and each object's state rules
   ============================================================ */
// The host is a plain box: the SVG never takes pointer events (its overflow and shadows must not catch clicks meant for controls nearby)
export const BASE = `
.iso { display: block; width: 100%; height: auto; overflow: visible; pointer-events: none; }
.iso .f { transform-box: view-box; transform-origin: 0 0; }
.iso * { vector-effect: non-scaling-stroke; }
.iso .ln { stroke: #2f2b25; stroke-width: 1.1; stroke-linejoin: round; stroke-linecap: round; }
.iso .hair { fill: none; stroke: #6d6458; stroke-width: .6; stroke-linecap: round; }
.iso .grain { fill: none; stroke: #b9ad97; stroke-width: .55; stroke-linecap: round; }
.iso .brass { fill: #e3c27e; stroke: #2f2b25; stroke-width: 1; }
.iso .brass-d { fill: #c99f52; stroke: #2f2b25; stroke-width: .8; }
.iso text { font-family: var(--sans, -apple-system, "PingFang SC", sans-serif); fill: #3b362e; }
.iso-host { cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; }
`

export interface VarSpec { rest?: number; hover?: number; open?: number; ms?: number; ease?: string; [event: string]: number | string | undefined }

/**
 * One object's variables and states. vars: { '--iso-lid': { hover: 38, open: 104, ms: 900 } }.
 * sel sits on the .iso svg; the states are .iso-host:hover, .iso-host[data-open] and .iso-host.<event class>
 */
export function css(sel: string, vars: Record<string, VarSpec>, { ease = 'cubic-bezier(.32, .72, 0, 1)', events = {} as Record<string, string> } = {}) {
  const names = Object.keys(vars)
  let out = names.map(v => `@property ${v} { syntax: '<number>'; inherits: true; initial-value: 0; }`).join('\n') + '\n'
  out += `${sel} { ${names.map(v => `${v}: ${vars[v]!.rest ?? 0};`).join(' ')} transition: ${names.map(v => `${v} ${vars[v]!.ms ?? 900}ms ${vars[v]!.ease ?? ease}`).join(', ')}; }\n`
  const rule = (state: string, key: string) => {
    const set = names.filter(v => vars[v]![key] != null)
    if (set.length) out += `${state} ${sel} { ${set.map(v => `${v}: ${vars[v]![key]};`).join(' ')} }\n`
  }
  rule('.iso-host:hover', 'hover')
  rule('.iso-host[data-open]', 'open')
  for (const [cls, key] of Object.entries(events)) rule(`.iso-host.${cls}`, key)
  out += `@media (prefers-reduced-motion: reduce) { ${sel} { transition-duration: 1ms; } }\n`
  return out
}
