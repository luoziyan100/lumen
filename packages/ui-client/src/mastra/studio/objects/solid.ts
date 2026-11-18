/**
 * [INPUT]: the kit in ./iso.ts (face from kit(), the rect and grain brushes)
 * [OUTPUT]: vector helpers (add/mul/sub/dot/crs/len/unit/r3/turn), CSS motions in model space (pivot about any axis, along any vector), the shared tones
 *           (WOOD/DARK/BRASS/CHALK/CHAR/IRON), solids(face) → { solid, flat, cylinder }: solid draws the faces of a convex block that look toward the viewer, flat draws the
 *           outline of any set of model points on a face that squarely faces the viewer (cones, knobs), cylinder draws an upright n-sided post with its silhouette and top; mix blends two tones
 * [POS]: the solid-geometry layer of studio/objects/ over iso.ts; the press, cork board, lamp and type case are built on it. A block's visible faces never overlap
 *        each other, so their order inside one block never matters; order between blocks stays each object's job
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { grain, rect, type Vec } from './iso.ts'

/* ============================================================
   Vectors
   ============================================================ */
export const add = (...vs: Vec[]): Vec => vs.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0] as Vec)
export const mul = (v: Vec, k: number): Vec => [v[0] * k, v[1] * k, v[2] * k]
export const sub = (a: Vec, b: Vec): Vec => add(a, mul(b, -1))
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const crs = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const len = (v: Vec) => Math.hypot(...v)
export const unit = (v: Vec) => mul(v, 1 / len(v))
export const r3 = (v: Vec): Vec => v.map(n => Math.round(n * 1000) / 1000) as Vec
/** Rodrigues: v turned by deg about the unit axis k */
export function turn(v: Vec, k: Vec, deg: number): Vec {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
  return add(mul(v, c), mul(crs(k, v), s), mul(k, dot(k, v) * (1 - c)))
}
/** A turn about the axis through P along the unit k by a CSS degree expression; same sense as turn() */
export const pivot = (P: Vec, k: Vec, deg: string) => `translate3d(${r3(P).map(n => `${n}px`)}) rotate3d(${r3(k)}, calc((${deg}) * 1deg)) translate3d(${r3(P).map(n => `${-n}px`)})`
/** A move along v (model px) scaled by a CSS expression */
export const along = (v: Vec, amount: string) => `translate3d(${r3(v).map(n => (n ? `calc((${amount}) * ${n}px)` : '0px'))})`
/** CSS clamp of an expression to 0..1 */
export const unitClamp = (expr: string) => `clamp(0, ${expr}, 1)`

/* ============================================================
   Tones · top lightest, the face toward +x middle, toward +y darkest (the box's three tones)
   ============================================================ */
export const WOOD = { top: '#fbf7ee', right: '#f0e8d8', left: '#e4d9c4' }
export const DARK = { top: '#efe6d3', right: '#e4d9c4', left: '#d6cab2' }
export const BRASS = { top: '#f0d79d', right: '#e3c27e', left: '#c99f52' }
export const CHALK = { top: '#fffefa', right: '#f6f1e6', left: '#e9e1d1' }
export const CHAR = { top: '#8a8176', right: '#6d6458', left: '#5a5249' }
export const IRON = { top: '#b9b2a6', right: '#a39b8e', left: '#8a8176' }
export type Tones = typeof WOOD

const VIEW: Vec = [1, 1, 1]
const C = Math.cos(Math.PI / 6), S = .5
/** Screen offset of a model vector, before the viewBox origin */
export const screenOf = (v: Vec): [number, number] => [C * v[0] - C * v[1], S * v[0] + S * v[1] - v[2]]
// A face spanned by these two axes lies square to the line of sight: u runs straight right, v straight down, both at the same scale K
export const FLAT_U: Vec = unit([1, -1, 0]), FLAT_V: Vec = unit([1, 1, -2]), FLAT_K = screenOf(FLAT_U)[0]

function hull(points: [number, number][]) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const side = (o: number[], a: number[], b: number[]) => (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!)
  const half = (list: [number, number][]) => { const h: [number, number][] = []; for (const q of list) { while (h.length > 1 && side(h[h.length - 2]!, h[h.length - 1]!, q) <= 0) h.pop(); h.push(q) } h.pop(); return h }
  return [...half(p), ...half(p.reverse())]
}
/** n points on the circle about c with radius r in the plane spanned by the unit vectors e1, e2 */
export const ring = (c: Vec, e1: Vec, e2: Vec, r: number, n = 36): Vec[] =>
  Array.from({ length: n }, (_, i) => add(c, mul(e1, r * Math.cos(i * 2 * Math.PI / n)), mul(e2, r * Math.sin(i * 2 * Math.PI / n))))

type Face = (O: Vec, U: Vec, V: Vec, body: string, extra?: string) => string
export interface SolidOptions { seed?: number; grains?: number; extra?: string; detail?: (normal: Vec, w: number, h: number) => string; skip?: (normal: Vec) => boolean }

export function solids(face: Face) {
  /** The faces of the convex block O + a·E0 + b·E1 + c·E2 (0 ≤ a, b, c ≤ 1) that look toward the viewer; the longer edge runs along u, so grain follows a bar */
  function solid(O: Vec, E: [Vec, Vec, Vec], tones: Tones, { seed = 0, grains = 0, extra = '', detail, skip }: SolidOptions = {}) {
    const centre = add(O, mul(add(...E), .5))
    let out = ''
    for (let k = 0; k < 3; k++) for (const f of [0, 1]) {
      const [Ei, Ej] = [E[(k + 1) % 3]!, E[(k + 2) % 3]!]
      const origin = add(O, mul(E[k]!, f))
      const n0 = unit(crs(Ei, Ej)), mid = add(origin, mul(add(Ei, Ej), .5))
      const normal = dot(sub(mid, centre), n0) > 0 ? n0 : mul(n0, -1)
      if (dot(normal, VIEW) <= 1e-6 || skip?.(normal)) continue
      const [A, B] = len(Ei) >= len(Ej) ? [Ei, Ej] : [Ej, Ei]
      const w = len(A), h = len(B), axis = normal.map(Math.abs)
      const fill = axis[2]! >= axis[0]! && axis[2]! >= axis[1]! ? tones.top : axis[0]! >= axis[1]! ? tones.right : tones.left
      out += face(r3(origin), r3(unit(A)), r3(unit(B)), rect(0, 0, +w.toFixed(2), +h.toFixed(2), fill) + (grains && w > 20 ? grain(+w.toFixed(2), +h.toFixed(2), seed + k * 2 + f, grains) : '') +
        (detail ? detail(normal, w, h) : ''), extra)
    }
    return out
  }
  /** Map model points to (u, v) on a viewer-square face at O */
  const toFlat = (O: Vec, P: Vec): [number, number] => { const [x, y] = screenOf(sub(P, O)); return [+(x / FLAT_K).toFixed(2), +(y / FLAT_K).toFixed(2)] }
  const pathOf = (O: Vec, points: Vec[]) => 'M' + hull(points.map(P => toFlat(O, P))).map(p => p.join(' ')).join('L') + 'Z'
  /** The outline of model points, filled, on a face square to the viewer at O; body adds more drawing in the same (u, v) */
  function flat(O: Vec, points: Vec[], fill: string, { cls = 'ln', extra = '', body = '' }: { cls?: string; extra?: string; body?: string } = {}) {
    return face(r3(O), r3(FLAT_U), r3(FLAT_V), `<path d="${pathOf(O, points)}" fill="${fill}" class="${cls}"/>` + body, extra)
  }
  /**
   * An upright cylinder (n-sided prism) standing at c: the sides that face the viewer, toned from the +x tone to the +y tone by where they face, the two
   * silhouette edges, and the top disc. Every side face is vertical, so a motion that scales z about a point keeps it a cylinder (a post shortening as a nut climbs).
   * cut drops the top disc (a post that runs into something); extra moves every face
   */
  function cylinder(c: Vec, r: number, h: number, tones: Tones, { n = 16, extra = '', cut = false, top = '' }: { n?: number; extra?: string; cut?: boolean; top?: string } = {}) {
    let out = ''
    const at = (a: number): Vec => add(c, [r * Math.cos(a), r * Math.sin(a), h])
    for (let i = 0; i < n; i++) {
      const a0 = i * 2 * Math.PI / n, a1 = (i + 1) * 2 * Math.PI / n, m = (a0 + a1) / 2
      if (Math.cos(m) + Math.sin(m) <= 0) continue
      const P0 = at(a0), P1 = at(a1), w = len(sub(P1, P0))
      // -1 faces +x, +1 faces +y; the side between gets the blend. Each side overlaps the next by a hair so no seam shows
      const k = (Math.sin(m) - Math.cos(m)) / Math.SQRT2
      out += face(r3(P0), r3(unit(sub(P1, P0))), [0, 0, -1], `<rect x="-.2" y="0" width="${(w + .4).toFixed(2)}" height="${h}" fill="${mix(tones.right, tones.left, (k + 1) / 2)}"/>`, extra)
    }
    // The silhouette edges sit where the sides turn away: at 135° and −45°
    for (const a of [3 * Math.PI / 4, -Math.PI / 4]) out += face(r3(at(a)), r3(unit([1, -1, 0])), [0, 0, -1], `<path d="M0 0V${h}" class="ln"/>`, extra)
    if (!cut) out += face(r3(add(c, [0, 0, h])), [0, -1, 0], [1, 0, 0], `<circle cx="0" cy="0" r="${r}" fill="${tones.top}" class="ln"/>` + top, extra)
    return out
  }
  return { solid, flat, toFlat, pathOf, cylinder }
}

/** Linear blend of two #rrggbb colours, t in 0..1 */
export function mix(a: string, b: string, t: number) {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return '#' + [0, 1, 2].map(i => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')
}
