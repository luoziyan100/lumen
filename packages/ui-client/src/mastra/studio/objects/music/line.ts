/**
 * [INPUT]: escapeXml from ../iso.ts (the one escape for SVG text)
 * [OUTPUT]: the line-engraving kit of the music set: r (2-decimal rounding), curve (lines and cubics with d, arc-length points and normals), the brushes path/line/circle/ellipse/rect,
 *           dbl (a parallel double line from an ink stroke under a paper stroke), detail (a marked spot led to a round magnified window), inset (lines at fixed offsets inside a closed shape, clipped to it), ticks (engraved short lines along a
 *           curve's normals), hatch (parallel lines clipped to a shape), screw / rivet / knurl, note (a quarter, eighth, half or beamed pair drawn as paths), plate (a monospaced label in a
 *           double frame), shadow (a faint ground ellipse from a radial gradient), count (how many drawn primitives a markup holds), buzzFrames / riseFrames (a decaying shake, a one-shot rise inside a loop), MUSIC_BASE (the ink/paper rules every music object shares)
 * [POS]: the base of objects/music/. Ink is var(--text), paper var(--surface-base): every music object follows the skin, a dark skin turns them into light lines on a dark ground.
 *        Line weights are viewBox units in four steps (w0 .25, w1 .6, w2 1.2, w3 2). No bitmap, no <image>, no blur: volume is hatching and engraved ticks; the one soft fill is the ground shadow
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { escapeXml } from '../iso.ts'

export type Pt = [number, number]
export const r = (n: number) => Math.round(n * 100) / 100
const pt = (p: Pt) => `${r(p[0])} ${r(p[1])}`

/* ============================================================
   Curves · one description gives the d string and arc-length samples
   ============================================================ */
export type Seg = ['L', Pt] | ['C', Pt, Pt, Pt]
export interface Sample { p: Pt; n: Pt; s: number }

function cubic(a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt {
  const u = 1 - t
  return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]
}

/** A path from start through segments. points() holds a dense polyline with cumulative arc length; at(s) walks it; normals point to the left of travel */
export function curve(start: Pt, segs: Seg[], closed = false) {
  const dense: Pt[] = [start]
  let last = start
  for (const seg of segs) {
    if (seg[0] === 'L') { for (let i = 1; i <= 8; i++) dense.push([last[0] + (seg[1][0] - last[0]) * i / 8, last[1] + (seg[1][1] - last[1]) * i / 8]); last = seg[1] }
    else { for (let i = 1; i <= 48; i++) dense.push(cubic(last, seg[1], seg[2], seg[3], i / 48)); last = seg[3] }
  }
  if (closed) dense.push(start)
  const acc = [0]
  for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1]! + Math.hypot(dense[i]![0] - dense[i - 1]![0], dense[i]![1] - dense[i - 1]![1]))
  const length = acc[acc.length - 1]!
  const d = `M${pt(start)}` + segs.map(seg => seg[0] === 'L' ? `L${pt(seg[1])}` : `C${pt(seg[1])} ${pt(seg[2])} ${pt(seg[3])}`).join('') + (closed ? 'Z' : '')
  function at(s: number): Sample {
    const target = Math.max(0, Math.min(length, s))
    let lo = 0, hi = acc.length - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (acc[mid]! < target) lo = mid; else hi = mid }
    const span = acc[hi]! - acc[lo]! || 1, k = (target - acc[lo]!) / span
    const a = dense[lo]!, b = dense[hi]!, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1
    return { p: [a[0] + dx * k, a[1] + dy * k], n: [dy / len, -dx / len], s: target }
  }
  /** Samples every `step` units from `from` to `to` (arc length) */
  function every(step: number, from = 0, to = length) {
    const out: Sample[] = []
    for (let s = from; s <= to + 1e-6; s += step) out.push(at(s))
    return out
  }
  return { d, length, at, every, points: dense }
}
export type Curve = ReturnType<typeof curve>

/* ============================================================
   Brushes · class names carry weight and fill: w0..w3, pf (paper fill), if (ink fill), pw (paper stroke), ns (no stroke), dash, dot
   ============================================================ */
export const path = (d: string, cls = 'w1', style = '') => `<path d="${d}" class="${cls}"${style ? ` style="${style}"` : ''}/>`
export const line = (x1: number, y1: number, x2: number, y2: number, cls = 'w0') => `<path d="M${r(x1)} ${r(y1)}L${r(x2)} ${r(y2)}" class="${cls}"/>`
export const circle = (cx: number, cy: number, radius: number, cls = 'w1') => `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(radius)}" class="${cls}"/>`
export const ellipse = (cx: number, cy: number, rx: number, ry: number, cls = 'w1', rot = 0) =>
  `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(rx)}" ry="${r(ry)}" class="${cls}"${rot ? ` transform="rotate(${r(rot)} ${r(cx)} ${r(cy)})"` : ''}/>`
export const rect = (x: number, y: number, w: number, h: number, cls = 'w1', rx = 0) =>
  `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}"${rx ? ` rx="${r(rx)}"` : ''} class="${cls}"/>`

/** A parallel double line: an ink stroke gap+w wide under a paper stroke gap−w wide, so two lines of width w stand gap apart around d */
export function dbl(d: string, gap: number, w = .25, inner = 'pw') {
  return `<path d="${d}" class="ns-f" style="stroke-width:${r(gap + w)}"/><path d="${d}" class="${inner} ns-f" style="stroke-width:${r(gap - w)}"/>`
}

/** Lines at each offset inside a closed shape (clipped to it), drawn outermost-first; paints over what is inside the band, so draw it before the shape's content */
export function inset(d: string, clipId: string, offsets: number[], w = .25) {
  const sorted = [...offsets].sort((a, b) => b - a)
  return `<g clip-path="url(#${clipId})">` + sorted.map(o => `<path d="${d}" class="ns-f" style="stroke-width:${r(2 * o + w)}"/><path d="${d}" class="pw ns-f" style="stroke-width:${r(2 * o - w)}"/>`).join('') + `</g>`
}

/** Engraved short lines along a curve's normals; len alternates with alt so the edge reads as cut, not printed */
export function ticks(samples: Sample[], len: number, cls = 'w0', alt = len, offset = 0) {
  return samples.map((s, i) => {
    const l = i % 2 ? alt : len, x = s.p[0] + s.n[0] * offset, y = s.p[1] + s.n[1] * offset
    return line(x, y, x + s.n[0] * l, y + s.n[1] * l, cls)
  }).join('')
}

/** Parallel lines across a box at an angle, clipped to a shape */
export function hatch(clipId: string, box: [number, number, number, number], angle: number, gap: number, cls = 'w0') {
  const [x, y, w, h] = box, cx = x + w / 2, cy = y + h / 2, R = Math.hypot(w, h) / 2
  const a = angle * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx
  let out = ''
  for (let k = -R; k <= R; k += gap) out += line(cx + nx * k - dx * R, cy + ny * k - dy * R, cx + nx * k + dx * R, cy + ny * k + dy * R, cls)
  return `<g clip-path="url(#${clipId})">${out}</g>`
}

/** A slotted screw head: paper disc, rim, slot at an angle */
export function screw(x: number, y: number, radius: number, angle = 30) {
  const a = angle * Math.PI / 180, dx = Math.cos(a) * radius * .78, dy = Math.sin(a) * radius * .78
  return circle(x, y, radius, 'w1 pf') + circle(x, y, radius * .62, 'w0') + line(x - dx, y - dy, x + dx, y + dy, 'w1')
}
export const rivet = (x: number, y: number, radius: number) => circle(x, y, radius, 'w0 pf') + circle(x, y, radius * .4, 'if ns')
/** Radial ticks around a circle: a milled edge */
export function knurl(cx: number, cy: number, radius: number, n: number, len: number, cls = 'w0') {
  let out = ''
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); out += line(cx + c * radius, cy + s * radius, cx + c * (radius + len), cy + s * (radius + len), cls) }
  return out
}

/* ============================================================
   Notes · heads, stems, flags and beams as paths, never glyphs
   ============================================================ */
export type NoteKind = 'q' | 'e' | 'h' | 'b'
const head = (x: number, y: number, s: number, open: boolean) => {
  const rx = 3.3 * s, ry = 2.25 * s
  const e = ellipse(x, y, rx, ry, open ? 'w1 pf' : 'if ns', -22)
  return open ? e + ellipse(x, y, rx * .55, ry * .32, 'if ns', -22) : e
}
/** One note with its head centred at (x, y), stem up from the head's right side; s scales it. The group is `mu-note`, so the frame checks can find every note */
export function note(kind: NoteKind, x: number, y: number, s = 1) {
  const sx = x + 3 * s, top = y - 17 * s
  let out: string
  if (kind === 'b') {
    const x2 = x + 10 * s, y2 = y - 3 * s, sx2 = x2 + 3 * s, top2 = y2 - 17.5 * s
    out = head(x, y, s, false) + head(x2, y2, s, false) + line(sx, y - .8 * s, sx, top, 'w1') + line(sx2, y2 - .8 * s, sx2, top2, 'w1') +
      path(`M${r(sx)} ${r(top)}L${r(sx2)} ${r(top2)}L${r(sx2)} ${r(top2 + 2.6 * s)}L${r(sx)} ${r(top + 2.6 * s)}Z`, 'if ns')
  } else {
    out = head(x, y, s, kind === 'h') + line(sx, y - .8 * s, sx, top, 'w1')
    if (kind === 'e') out += path(`M${r(sx)} ${r(top)}C${r(sx + 1 * s)} ${r(top + 5 * s)} ${r(sx + 6 * s)} ${r(top + 6 * s)} ${r(sx + 5 * s)} ${r(top + 12 * s)}`, 'w1')
  }
  return `<g class="mu-note">${out}</g>`
}

/* ============================================================
   Plate, shadow and the shared rules
   ============================================================ */
/** A monospaced label in a double frame with two screws; centred on (cx, cy) */
export function plate(cx: number, cy: number, label: string, size = 5.2) {
  const w = label.length * size * .84 + size * 3.6, h = size * 2.6, x = cx - w / 2, y = cy - h / 2
  return rect(x, y, w, h, 'w1 pf', .6) + rect(x + 1.2, y + 1.2, w - 2.4, h - 2.4, 'w0') +
    screw(x + size * .95, cy, size * .32, 20) + screw(x + w - size * .95, cy, size * .32, -40) +
    `<text x="${r(cx)}" y="${r(cy + size * .36)}" font-size="${size}" letter-spacing="${r(size * .22)}" text-anchor="middle">${escapeXml(label)}</text>`
}

/** A drafting detail: a thin circle marks the spot on the main view, a leader runs to a round window holding the magnified mechanism (content, drawn in window coordinates and clipped to it), labelled under the window */
export function detail(id: string, mark: { x: number; y: number; r: number }, win: { x: number; y: number; r: number }, label: string, content: string) {
  const dx = win.x - mark.x, dy = win.y - mark.y, d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d
  return circle(mark.x, mark.y, mark.r, 'w0') + line(mark.x + ux * mark.r, mark.y + uy * mark.r, win.x - ux * (win.r + 2), win.y - uy * (win.r + 2), 'w0') +
    `<clipPath id="${id}"><circle cx="${r(win.x)}" cy="${r(win.y)}" r="${r(win.r)}"/></clipPath>` + circle(win.x, win.y, win.r, 'w1 pf') +
    `<g clip-path="url(#${id})">${content}</g>` + circle(win.x, win.y, win.r, 'w1') + circle(win.x, win.y, win.r + 2, 'w0') +
    `<text x="${r(win.x)}" y="${r(win.y + win.r + 10)}" font-size="4.4" letter-spacing="1.2" text-anchor="middle">${escapeXml(label)}</text>`
}

/** The gradient a shadow uses; put it in the object's <defs> */
export const shadowDef = (id: string) =>
  `<radialGradient id="${id}"><stop offset="0" style="stop-color:var(--ink);stop-opacity:.11"/><stop offset=".7" style="stop-color:var(--ink);stop-opacity:.04"/><stop offset="1" style="stop-color:var(--ink);stop-opacity:0"/></radialGradient>`
export const shadow = (id: string, cx: number, cy: number, rx: number, ry: number) => `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(rx)}" ry="${r(ry)}" fill="url(#${id})" class="ns"/>`

/** Drawn primitives in a markup (the detail measure the contract counts) */
export function count(markup: string) {
  return (markup.match(/<(path|line|circle|ellipse|rect|polygon|polyline)\b/g) ?? []).length
}

/** A decaying shake along one axis that lives in the first `until` percent of its loop and rests for the rest */
export function buzzFrames(name: string, axis: 'X' | 'Y', until: number, amp = .7) {
  const steps = 12
  let frames = ''
  for (let i = 0; i <= steps; i++) {
    const at = r(i / steps * until), k = i === steps ? 0 : (i % 2 ? 1 : -1) * amp * (1 - i / steps)
    frames += `${at}% { transform: translate${axis}(${r(k)}px); } `
  }
  return `@keyframes ${name} { ${frames}100% { transform: none; } }\n`
}

/** A one-shot rise inside a loop: hidden, appears at 0, drifts by (dx, dy) and fades out by `until` percent */
export function riseFrames(name: string, dx: number, dy: number, until: number) {
  return `@keyframes ${name} { 0% { opacity: 0; transform: translate(0, 0); } ${r(until * .12)}% { opacity: 1; } ${r(until * .7)}% { opacity: .85; } ${r(until)}% { opacity: 0; transform: translate(${dx}px, ${dy}px); } 100% { opacity: 0; transform: translate(${dx}px, ${dy}px); } }\n`
}

export const MUSIC_BASE = `
.mu { display: block; width: 100%; height: auto; overflow: hidden; pointer-events: none; --ink: var(--text, #1c1a17); --pap: var(--surface-base, #faf8f4); }
.mu path, .mu circle, .mu ellipse, .mu rect { fill: none; stroke: var(--ink); stroke-linecap: round; stroke-linejoin: round; }
.mu .w0 { stroke-width: .25; } .mu .w1 { stroke-width: .6; } .mu .w2 { stroke-width: 1.2; } .mu .w3 { stroke-width: 2; }
.mu .pf { fill: var(--pap); } .mu .if { fill: var(--ink); } .mu .ns { stroke: none; } .mu .pw { stroke: var(--pap); } .mu .ns-f { fill: none; }
.mu .dash { stroke-dasharray: 2.2 1.6; } .mu .dot { stroke-dasharray: .1 1.4; }
.mu text { fill: var(--ink); stroke: none; font-family: var(--font-mono, ui-monospace, Menlo, monospace); }
@media (prefers-reduced-motion: reduce) { .mu, .mu * { animation: none !important; transition: none !important; } }
`
