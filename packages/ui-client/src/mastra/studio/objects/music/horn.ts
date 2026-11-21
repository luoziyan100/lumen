/**
 * [INPUT]: r and Pt from ./line.ts
 * [OUTPUT]: hornSvg(spine, look): the gramophone horn as engraved 3D line art; hornAt(t): a spine point and its radius, for the bracket and the notes
 * [POS]: the horn modeller of gramophone.ts. The horn is a surface of revolution about a curved spine (a 3D cubic): a thin gooseneck rising from the swivel, then a flare.
 *        Ten petals bulge between their seams, and the rim is scalloped at the seams. The mesh is projected orthographically (screen x, y; z is depth away from the viewer)
 *        and painted far to near, so the throat shows through the mouth and the near wall hides the far one. Shade is hatch density only:
 *        the inside is hatched along the meridians and darkens toward the throat; the outside is hatched along the rings and darkens away from the light.
 *        Seams, silhouettes and the rim belong to the nearer of their two quads, so occlusion holds for lines too
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { r, type Pt } from './line.ts'

type V3 = [number, number, number]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V3) => mul(a, 1 / Math.hypot(a[0], a[1], a[2]))

export interface HornSpine { from: Pt; mouth: V3; axis: V3; rise: number; reach: number }

const PETALS = 10, PER_PETAL = 4, ROWS = 28, COLS = PETALS * PER_PETAL
const LIGHT = unit([-.5, -.7, -.5])
const radius = (t: number) => 3.6 + 4 * t + 70 * t ** 4.2

function model(spine: HornSpine) {
  const p0: V3 = [spine.from[0], spine.from[1], 0], p1 = add(p0, [0, -spine.rise, 0])
  const axis = unit(spine.axis), p3 = spine.mouth, p2 = sub(p3, mul(axis, spine.reach))
  const at = (t: number): V3 => { const u = 1 - t; return add(add(mul(p0, u * u * u), mul(p1, 3 * u * u * t)), add(mul(p2, 3 * u * t * t), mul(p3, t * t * t))) }
  const tangent = (t: number) => { const u = 1 - t; return unit(add(add(mul(sub(p1, p0), 3 * u * u), mul(sub(p2, p1), 6 * u * t)), mul(sub(p3, p2), 3 * t * t))) }
  const ts = Array.from({ length: ROWS + 1 }, (_, i) => 1 - (1 - i / ROWS) ** 1.6)
  let n: V3 = unit(cross(tangent(0), [0, 0, 1]))
  const frames = ts.map(t => { const T = tangent(t); n = unit(sub(n, mul(T, dot(n, T)))); return { c: at(t), n, b: cross(T, n) } })
  const point = (i: number, j: number, k = 1): V3 => {
    const t = ts[i]!, th = j / COLS * Math.PI * 2, bulge = Math.abs(Math.sin(th * PETALS / 2))
    const rr = radius(t) * (1 + (.04 * t * t + .07 * t ** 14) * (bulge - .55)) * k, f = frames[i]!
    return add(f.c, add(mul(f.n, Math.cos(th) * rr), mul(f.b, Math.sin(th) * rr)))
  }
  return { at, ts, frames, point }
}

/** A spine point (screen) and the horn's radius there, t in 0..1 */
export function hornAt(spine: HornSpine, t: number) {
  const m = model(spine), p = m.at(t)
  return { p: [p[0], p[1]] as Pt, radius: radius(t) }
}

interface Quad { depth: number; body: string }

export function hornSvg(spine: HornSpine) {
  const { ts, frames, point } = model(spine)
  const grid = ts.map((_, i) => Array.from({ length: COLS + 1 }, (_, j) => point(i, j % COLS)))
  const xy = (p: V3) => `${r(p[0])} ${r(p[1])}`
  const lerp = (a: V3, b: V3, k: number) => add(a, mul(sub(b, a), k))
  const face = (i: number, j: number) => {
    const a = grid[i]![j]!, b = grid[i]![j + 1]!, c = grid[i + 1]![j + 1]!, d = grid[i + 1]![j]!
    const centre = mul(add(add(a, b), add(c, d)), .25), mid = lerp(frames[i]!.c, frames[i + 1]!.c, .5)
    let nrm = unit(cross(sub(add(b, c), add(a, d)), sub(add(d, c), add(a, b))))
    if (dot(nrm, sub(centre, mid)) < 0) nrm = mul(nrm, -1)
    return { a, b, c, d, centre, nrm, outside: nrm[2] < 0 }
  }
  const faces = ts.slice(0, -1).map((_, i) => Array.from({ length: COLS }, (_, j) => face(i, j)))
  const seam = (j: number) => j % PER_PETAL === 0
  const quads: Quad[] = []
  faces.forEach((row, i) => row.forEach((q, j) => {
    const t = (ts[i]! + ts[i + 1]!) / 2
    let body = `<path d="M${xy(q.a)}L${xy(q.b)}L${xy(q.c)}L${xy(q.d)}Z" class="pf pw w0"/>`
    const light = Math.max(0, dot(q.outside ? q.nrm : mul(q.nrm, -1), LIGHT))
    const shade = q.outside ? (1 - light) * .7 : .35 * (1 - light) + .75 * (1 - t) ** 1.3
    const room = Math.hypot(q.a[0] - q.b[0], q.a[1] - q.b[1]) / (q.outside ? 2.4 : 1.4)
    const lines = Math.min(4, Math.floor(shade * 4.6), Math.floor(room))
    for (let k = 0; k < lines; k++) {
      const f = (k + .5) / lines
      body += q.outside
        ? `<path d="M${xy(lerp(q.a, q.d, f))}L${xy(lerp(q.b, q.c, f))}" class="w0"/>`
        : `<path d="M${xy(lerp(q.a, q.b, f))}L${xy(lerp(q.d, q.c, f))}" class="w0"/>`
    }
    const left = row[(j + COLS - 1) % COLS]!, right = row[(j + 1) % COLS]!
    const edge = (p: V3, s: V3, cls: string) => `<path d="M${xy(p)}L${xy(s)}" class="${cls}"/>`
    if (seam(j)) body += edge(q.a, q.d, (j / PER_PETAL) % 2 ? 'w1' : 'w0') + ((j / PER_PETAL) % 2 ? '' : edge(lerp(q.a, q.b, .12), lerp(q.d, q.c, .12), 'w0'))
    if (left.outside !== q.outside) body += edge(q.a, q.d, 'w2')
    if (right.outside !== q.outside) body += edge(q.b, q.c, 'w2')
    const below = faces[i - 1]?.[j], above = faces[i + 1]?.[j]
    if (i === 0 || below!.outside !== q.outside) body += edge(q.a, q.b, 'w1')
    if (above && above.outside !== q.outside) body += edge(q.d, q.c, 'w1')
    if (q.outside && i > 0 && i < ROWS / 2 && i % 4 === 0) body += edge(q.a, q.b, 'w1')
    quads.push({ depth: q.centre[2], body })
  }))
  const ring = (k: number) => 'M' + Array.from({ length: COLS * 8 }, (_, j) => xy(point(ROWS, j / 8, k))).join('L') + 'Z'
  const rim = `<path d="${ring(1.014)}" class="w0"/><path d="${ring(1)}" class="w2"/><path d="${ring(.975)}" class="w0"/>`
  return quads.sort((x, y) => y.depth - x.depth).map(q => q.body).join('') + rim
}
