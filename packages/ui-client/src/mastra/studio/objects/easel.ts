/**
 * [INPUT]: the kit in ./iso.ts
 * [OUTPUT]: easelSvg(): the easel SVG (a tripod leaning back 12°, a blank canvas on a tray with a brush and two chalk sticks, a cloth folded over the cross brace); EASEL_CSS:
 *           --iso-tilt (hover and open 7: the canvas swivels about the mast toward the viewer), --iso-brush (open 0→100: lift, one stroke, back to the tray) and --iso-wet
 *           (the stroke's paint; closing fades it, then the brush value resets while the brush already lies in the tray, so nothing jumps)
 * [POS]: object 4 of studio/objects/, for the board view with no sheets. It follows no event (the AI cannot draw without a sheet). Same strokes, three tones and brass as the box;
 *        inclined bars are drawn by solid(), which shows a convex block's three faces that look toward the viewer (1, 1, 1), so their order inside one block never matters
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { circle, grain, kit, line, rect, show, type Vec } from './iso.ts'

const { face } = kit({ x0: 214, y0: 300 })        // model origin in the 320×380 viewBox

/* ============================================================
   Vectors
   ============================================================ */
const add = (...vs: Vec[]): Vec => vs.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0] as Vec)
const mul = (v: Vec, k: number): Vec => [v[0] * k, v[1] * k, v[2] * k]
const sub = (a: Vec, b: Vec): Vec => add(a, mul(b, -1))
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const crs = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (v: Vec) => Math.hypot(...v)
const unit = (v: Vec) => mul(v, 1 / len(v))
const r3 = (v: Vec): Vec => v.map(n => Math.round(n * 1000) / 1000) as Vec
/** Rodrigues: v turned by deg about the unit axis k */
function turn(v: Vec, k: Vec, deg: number): Vec {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
  return add(mul(v, c), mul(crs(k, v), s), mul(k, dot(k, v) * (1 - c)))
}
/** A turn about the axis through P along k by a CSS degree expression */
const pivot = (P: Vec, k: Vec, deg: string) => `translate3d(${r3(P).map(n => `${n}px`)}) rotate3d(${r3(k)}, calc((${deg}) * 1deg)) translate3d(${r3(P).map(n => `${-n}px`)})`
/** A move along v (model px) scaled by a CSS expression */
const along = (v: Vec, amount: string) => `translate3d(${r3(v).map(n => (n ? `calc((${amount}) * ${n}px)` : '0px'))})`

/* ============================================================
   Tones and solids · the faces of a convex block that look toward the viewer, toned by the axis they face (top lightest, +x middle, +y darkest)
   ============================================================ */
const WOOD = { top: '#fbf7ee', right: '#f0e8d8', left: '#e4d9c4' }
const DARK = { top: '#efe6d3', right: '#e4d9c4', left: '#d6cab2' }
const BRASS = { top: '#f0d79d', right: '#e3c27e', left: '#c99f52' }
const CHALK = { top: '#fffefa', right: '#f6f1e6', left: '#e9e1d1' }
const CHAR = { top: '#8a8176', right: '#6d6458', left: '#5a5249' }
const VIEW: Vec = [1, 1, 1]
type Tones = typeof WOOD

function solid(O: Vec, E: [Vec, Vec, Vec], tones: Tones, { seed = 0, grains = 0, extra = '', detail, skip }: { seed?: number; grains?: number; extra?: string; detail?: (normal: Vec, w: number, h: number) => string; skip?: (normal: Vec) => boolean } = {}) {
  const centre = add(O, mul(add(...E), .5))
  let out = ''
  for (let k = 0; k < 3; k++) for (const f of [0, 1]) {
    const [Ei, Ej] = [E[(k + 1) % 3]!, E[(k + 2) % 3]!]
    const origin = add(O, mul(E[k]!, f))
    const n0 = unit(crs(Ei, Ej)), mid = add(origin, mul(add(Ei, Ej), .5))
    const normal = dot(sub(mid, centre), n0) > 0 ? n0 : mul(n0, -1)
    if (dot(normal, VIEW) <= 1e-6 || skip?.(normal)) continue
    // The longer edge runs along u, so grain follows the length of a bar
    const [A, B] = len(Ei) >= len(Ej) ? [Ei, Ej] : [Ej, Ei]
    const w = len(A), h = len(B), axis = normal.map(Math.abs)
    const fill = axis[2]! >= axis[0]! && axis[2]! >= axis[1]! ? tones.top : axis[0]! >= axis[1]! ? tones.right : tones.left
    out += face(r3(origin), r3(unit(A)), r3(unit(B)), rect(0, 0, +w.toFixed(2), +h.toFixed(2), fill) + (grains && w > 20 ? grain(+w.toFixed(2), +h.toFixed(2), seed + k * 2 + f, grains) : '') +
      (detail ? detail(normal, w, h) : ''), extra)
  }
  return out
}

/* ============================================================
   The frame · the front legs and the mast lie in one plane leaning back 12°; P(y, s) is the point at y, s up that plane from the floor
   ============================================================ */
const LEAN = 12 * Math.PI / 180
const N: Vec = [Math.cos(LEAN), 0, Math.sin(LEAN)]           // the plane's front normal
const UPW: Vec = [-Math.sin(LEAN), 0, Math.cos(LEAN)]        // up along the plane
const P = (y: number, s: number): Vec => add([0, y, 0], mul(UPW, s))
const APEX = 238, MID = 60, LEFT_FOOT = 132, RIGHT_FOOT = -12, BRACE_S = 22

function frontLeg(footY: number, seed: number) {
  const foot = P(footY, 0), top = P(MID, APEX), d = unit(sub(top, foot)), w = unit(crs(N, d))
  return solid(sub(foot, mul(w, 3.5)), [mul(d, len(sub(top, foot))), mul(w, 7), mul(N, -6)], WOOD, { seed, grains: 3 }) +
    solid(add(sub(foot, mul(w, 4)), mul(N, .5)), [mul(d, 7), mul(w, 8), mul(N, -7)], BRASS) +           // the brass shoe
    face(r3(add(P(footY + (MID - footY) * (BRACE_S + 3) / APEX, BRACE_S + 3), mul(N, .3))), [0, -1, 0], r3(mul(UPW, -1)), circle(0, 0, 2.2, '#e3c27e', 'brass') + circle(0, 0, .8, '#2f2b25'))   // the brace bolt
}
// A cross brace between the front legs, a little behind their fronts, so the legs overlap its ends
const brace = solid(add(P(RIGHT_FOOT + (MID - RIGHT_FOOT) * BRACE_S / APEX, BRACE_S), mul(N, -1)), [[0, (LEFT_FOOT - RIGHT_FOOT) * (1 - BRACE_S / APEX), 0], mul(UPW, 6), mul(N, -4)], DARK, { seed: 9, grains: 2 })
const BACK_TOP = add(P(MID, APEX - 6), mul(N, -6)), BACK_FOOT: Vec = [-84, MID, 0]
const backD = unit(sub(BACK_FOOT, BACK_TOP)), backT = unit(crs([0, 1, 0], backD))
const backLeg = solid(sub(BACK_TOP, [0, 3.5, 0]), [mul(backD, len(sub(BACK_FOOT, BACK_TOP))), [0, 7, 0], mul(backT, 6)], DARK, { seed: 7, grains: 3 }) +
  solid(add(sub(BACK_FOOT, mul(backD, 7)), [0, -4, 0]), [mul(backD, 7), [0, 8, 0], mul(backT, 7)], BRASS)
// The mast: height holes above the clamp, a brass cap on top
const MAST_LOW = 52, MAST_HIGH = 258
const mast = solid(P(MID - 4, MAST_LOW), [mul(UPW, MAST_HIGH - MAST_LOW), [0, 8, 0], mul(N, -6)], WOOD, {
  seed: 3, grains: 2,
  detail: (normal, w, h) => dot(normal, N) > .9 ? Array.from({ length: 5 }, (_, i) => circle(154 + i * 6, h / 2, 1.1, '#6d6458')).join('') : '',
}) + solid(add(P(MID - 5, MAST_HIGH), mul(N, .5)), [mul(UPW, 5), [0, 10, 0], mul(N, -7)], BRASS)
// The wing nut where the legs meet
const wingNut = face(r3(add(P(MID, APEX - 3), mul(N, .4))), [0, -1, 0], r3(mul(UPW, -1)),
  `<path d="M-2.6 -1.6L-9 -4.2Q-10.6 0 -9 4.2L-2.6 1.6Z" class="brass"/><path d="M2.6 -1.6L9 -4.2Q10.6 0 9 4.2L2.6 1.6Z" class="brass"/>` +
  circle(0, 0, 3.6, '#e3c27e', 'brass') + circle(0, 0, 1.2, '#2f2b25'))

/* ============================================================
   The cloth · a linen rag folded over the cross brace: its top lies on the brace with a rounded fold at the front edge, the front half hangs before the brace,
   the back half hangs behind it a little longer and shows below; the fringe grows from each hem and the brass stripes follow the folds
   ============================================================ */
const BRACE_TOP = BRACE_S + 6, CLOTH_Y = 104, CLOTH_W = 32, BACK_SHIFT = -4
const LINEN = '#ebe1cc', LINEN_BACK = '#d9ccb2', LINEN_TOP = '#f4ecdb', STRIPE = 'hair" style="stroke:#c99f52'
// The hem: a soft wave whose depth at u is hem(u); fringe threads start on it, so they never float
const hem = (u: number, base: number) => base + Math.sin(u * .42) * 1.3 + Math.sin(u * .17 + 1) * 1.1
const hemPath = (w: number, base: number) => Array.from({ length: 13 }, (_, i) => { const u = w * (12 - i) / 12; return `L${u.toFixed(2)} ${hem(u, base).toFixed(2)}` }).join('')
const fringe = (w: number, base: number, n: number) => Array.from({ length: n }, (_, i) => { const u = 2.5 + i * (w - 5) / (n - 1), v = hem(u, base); return line(+u.toFixed(2), +(v - .3).toFixed(2), +(u + .3).toFixed(2), +(v + 2.6).toFixed(2), 'hair') }).join('')
// The stripes run parallel to the hem, kinked where the folds cross them
const stripe = (w: number, at: number) => `<path d="M1 ${hem(1, at).toFixed(2)}${[8, 15, 22, 29].filter(u => u < w).map(u => `L${u} ${(hem(u, at) + (u % 2 ? .5 : -.4)).toFixed(2)}`).join('')}L${w - 1} ${hem(w - 1, at).toFixed(2)}" fill="none" class="${STRIPE}"/>`
const clothBack = (() => {
  const w = CLOTH_W, base = 27.5
  return face(r3(add(P(CLOTH_Y + BACK_SHIFT, BRACE_TOP), mul(N, -5.6))), [0, -1, 0], r3(mul(UPW, -1)),
    `<path d="M0 0H${w}${hemPath(w, base)}Z" fill="${LINEN_BACK}" class="ln"/>` + line(9, 1, 8.5, base - 1, 'hair') + line(20, 1, 20.5, base - 1, 'hair') + fringe(w, base, 6))
})()
const clothFront = (() => {
  const w = CLOTH_W, base = 19
  return face(r3(add(P(CLOTH_Y, BRACE_TOP + .5), mul(N, -.6))), [0, -1, 0], r3(mul(UPW, -1)),
    `<path d="M0 0H${w}${hemPath(w, base)}Z" fill="${LINEN}" class="ln"/>` +
    // The fold: a rounded band where the cloth turns over the brace's front edge
    `<path d="M0 1.2Q0 -3.4 3 -3.4H${w - 3}Q${w} -3.4 ${w} 1.2Q${w / 2} 2.2 0 1.2Z" fill="${LINEN_TOP}" class="ln"/>` + line(3, -1.6, w - 3, -1.6, 'grain') +
    // Folds: hairlines that fan out a little toward the hem
    [[7, 6.2], [13.5, 14], [21, 22], [27, 28.4]].map(([a, b], i) => line(a!, 2.6, b!, hem(b!, base) - 1.2, i % 2 ? 'grain' : 'hair')).join('') +
    stripe(w, base - 4.2) + stripe(w, base - 2.6) + fringe(w, base, 9))
})()

/* ============================================================
   The canvas and its clamp · they swivel together about the mast by --iso-tilt
   ============================================================ */
const TRAY_Z = 66, TRAY_S = TRAY_Z / Math.cos(LEAN), XP = -TRAY_Z * Math.tan(LEAN)   // the tray's top, its distance up the plane, the plane's x there
const CW = 108, CH = 124, BACK = 4, THICK = 7, FRONT = BACK + THICK
const CANVAS_TOP = TRAY_S + CH
const SWIVEL = pivot([0, MID, 0], UPW, 'var(--iso-tilt)')
const TILT_OPEN = 7

const canvasFace: { O: Vec; U: Vec; V: Vec } = { O: add(P(MID + CW / 2, CANVAS_TOP), mul(N, FRONT)), U: [0, -1, 0], V: mul(UPW, -1) }
// The stroke: u(s) = U0 + DU·s, v(s) = V0 + DV·s − A·sin(πs), a short rising swoosh; the brush tip follows the same curve
const U0 = 30, DU = 46, V0 = 74, DV = -16, ARC = 9
const B = 'var(--iso-brush)'
const LIFT = `clamp(0, ${B} / 28, 1)`, STROKE = `clamp(0, (${B} - 30) / 42, 1)`, BACKTO = `clamp(0, (${B} - 78) / 22, 1)`
const strokePath = Array.from({ length: 25 }, (_, i) => { const s = i / 24; return `${i ? 'L' : 'M'}${(U0 + DU * s).toFixed(2)} ${(V0 + DV * s - ARC * Math.sin(Math.PI * s)).toFixed(2)}` }).join('')

const canvas = solid(add(P(MID - CW / 2, TRAY_S), mul(N, BACK)), [mul(UPW, CH), [0, CW, 0], mul(N, THICK)], { top: '#fbf7ee', right: '#fffefa', left: '#efe6d3' }, {
  extra: SWIVEL,
  skip: normal => dot(normal, N) > .9,                                         // the front is drawn on its own face below, with the stroke
  detail: (normal, w, h) => {
    if (normal[1] > .9) return Array.from({ length: 11 }, (_, i) => circle(8 + i * 11, h / 2, .55, '#6d6458')).join('') + line(4, h - 1.6, w - 4, h - 1.6, 'grain')   // tacks on the wrap
    return line(3, h - 2, w - 3, h - 2, 'hair') + [14, 36, 54, 72, 94].map(u => line(u, h - 4.4, u + 3, h - 4.4, 'hair')).join('')   // the fold over the stretcher's top, and its staples
  },
}) + face(r3(canvasFace.O), canvasFace.U, r3(canvasFace.V),
  rect(0, 0, CW, CH, '#fffefa') + rect(3, 3, CW - 6, CH - 6, 'none', 'grain', 1) +
  `<path d="${strokePath}" pathLength="100" fill="none" style="vector-effect:none; stroke:#4a4339; stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round;` +
  ` stroke-dasharray:100 100; stroke-dashoffset:calc(100 - 100 * ${STROKE}); opacity:calc(var(--iso-wet) * clamp(0, ${STROKE} * 60, 1))"/>`, SWIVEL)
const clamp = solid(add(P(MID - 7, CANVAS_TOP - 6), mul(N, BACK)), [mul(UPW, 16), [0, 14, 0], mul(N, THICK + 4)], WOOD, {
  extra: SWIVEL, seed: 5, grains: 1,
  detail: (normal, w, h) => dot(normal, N) > .9 ? circle(w / 2, h / 2, 3, '#e3c27e', 'brass') + circle(w / 2, h / 2, 1, '#2f2b25') : '',
})

/* ============================================================
   The tray · a shelf on the front legs; its right end sits behind what lies in it, the lip and the left end in front
   ============================================================ */
const TD = 24, TY0 = -4, TY1 = 124, LIP = 3.5
const trayBase = solid([XP, TY0, TRAY_Z - 5], [[TD, 0, 0], [0, TY1 - TY0, 0], [0, 0, 5]], WOOD, { seed: 12, grains: 2 })
const trayRight = solid([XP, TY0, TRAY_Z], [[TD, 0, 0], [0, 3, 0], [0, 0, LIP]], WOOD)
const trayLip = solid([XP + TD - 3, TY0 + 3, TRAY_Z], [[3, 0, 0], [0, TY1 - TY0 - 6, 0], [0, 0, LIP]], WOOD, {
  detail: (normal, w, h) => normal[0] > .9 ? [18, w - 18].map(u => circle(u, h / 2, .9, '#e3c27e', 'brass-d')).join('') : '',
})
const trayLeft = solid([XP, TY1 - 3, TRAY_Z], [[TD, 0, 0], [0, 3, 0], [0, 0, LIP]], WOOD)
const dust = face([XP + 2, 118, TRAY_Z + .05], [0, -1, 0], [1, 0, 0],
  [[3, 6, .7], [8, 9, .5], [12, 5, .6], [17, 11, .45], [22, 7, .55], [6, 14, .4]].map(([u, v, r]) => circle(u!, v!, r!, '#e9e1d1')).join(''))
const chalk = dust + solid([XP + 9, 86, TRAY_Z], [[4, 0, 0], [0, 15, 0], [0, 0, 4]], CHALK) + solid([XP + 15, 104, TRAY_Z], [[3.4, 0, 0], [0, 11, 0], [0, 0, 3.4]], CHAR)

/* ============================================================
   The brush · a profile in its own plane, tip at the origin. At rest it lies in the tray along y; open lifts it, lays its plane parallel to the
   turned canvas (lean, then swivel), runs the tip along the stroke and brings it back. One variable drives the phases: lift 0–28, stroke 30–72, return 78–100
   ============================================================ */
const REST: Vec = [XP + 13, 20, TRAY_Z + 2.2]
const brushProfile = `<path d="M-50 -1.3Q-52 0 -50 1.3L-16 2.1H-16V-2.1Z" fill="#f0e8d8" class="ln"/>` + line(-46, 0, -20, 0, 'grain') +
  rect(-16, -2.3, 7, 4.6, '#e3c27e', 'brass', .8) + line(-13.5, -2.3, -13.5, 2.3, 'hair') + line(-11.5, -2.3, -11.5, 2.3, 'hair') +
  `<path d="M-9 -2.4Q-3 -2.6 0 0Q-3 2.6 -9 2.4Z" fill="#4a4339" class="ln"/>` + line(-8, -1, -3, -.4, 'hair').replace('hair', 'hair" style="stroke:#8a8176')
const brushTurned = (() => {
  // Where the tip touches the canvas: the canvas face point turned by the open swivel, 1.5 in front of the cloth
  const axis = UPW, at = (u: number, v: number) => add(turn(sub(add(canvasFace.O, mul(canvasFace.U, u), mul(canvasFace.V, v), mul(N, 1.5)), [0, MID, 0]), axis, TILT_OPEN), [0, MID, 0])
  const S0 = at(U0, V0), S1 = at(U0 + DU, V0 + DV), Uw = turn(canvasFace.U, axis, TILT_OPEN), Vw = turn(canvasFace.V, axis, TILT_OPEN)
  const held = `(${LIFT}) * (1 - ${BACKTO})`
  const path = along(sub(S0, REST), LIFT) + ' ' + along(Uw, `${DU} * ${STROKE}`) + ' ' + along(Vw, `${DV} * ${STROKE} - ${ARC} * sin(${STROKE} * 3.14159)`) + ' ' +
    along(sub(REST, S1), BACKTO) + ' ' + along([0, 0, 1], `16 * sin(${LIFT} * 3.14159) + 14 * sin(${BACKTO} * 3.14159)`)
  const pose = pivot(REST, axis, `${TILT_OPEN} * ${held}`) + ' ' + pivot(REST, [0, 1, 0], `${-12} * ${held}`) + ' ' + pivot(REST, [1, 0, 0], `-146 * ${held}`)
  return { held, motion: `${path} ${pose}` }
})()
const brush = face(r3(REST), [0, -1, 0], [0, 0, -1], brushProfile, brushTurned.motion)

const shadow = face([-96, 140, 0], [0, -1, 0], [1, 0, 0],
  `<rect x="0" y="0" width="160" height="128" rx="40" fill="#3b2f1e" opacity=".14" filter="url(#iso-easel-soft)"/>`)

export function easelSvg() {
  return `<svg class="iso iso-easel" viewBox="0 0 320 380" role="img" aria-hidden="true">
    <defs><filter id="iso-easel-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8"/></filter></defs>
    ${shadow}${backLeg}${clothBack}${brace}${clothFront}${frontLeg(RIGHT_FOOT, 1)}${frontLeg(LEFT_FOOT, 4)}${mast}${wingNut}
    ${canvas}${clamp}
    ${trayBase}${trayRight}${show(`1 - ${brushTurned.held} * 40`, brush)}${chalk}${trayLip}${trayLeft}
    ${show(`${brushTurned.held} * 40`, brush)}
  </svg>`
}

/* ---------- States · hover and open turn the canvas; open paints (2.6s), closing fades the paint and then resets the brush, which already lies in the tray ---------- */
export const EASEL_CSS = ['--iso-tilt', '--iso-brush', '--iso-wet'].map(v => `@property ${v} { syntax: '<number>'; inherits: true; initial-value: 0; }`).join('\n') + `
.iso-easel { --iso-tilt: 0; --iso-brush: 0; --iso-wet: 0; transition: --iso-tilt 700ms cubic-bezier(.32, .72, 0, 1), --iso-brush 0ms linear 520ms, --iso-wet 500ms ease; }
.iso-host:hover .iso-easel { --iso-tilt: ${TILT_OPEN}; }
.iso-host[data-open] .iso-easel { --iso-tilt: ${TILT_OPEN}; --iso-brush: 100; --iso-wet: 1;
  transition: --iso-tilt 700ms cubic-bezier(.32, .72, 0, 1), --iso-brush 2600ms cubic-bezier(.45, .05, .4, .95), --iso-wet 0ms; }
@media (prefers-reduced-motion: reduce) { .iso-easel, .iso-host[data-open] .iso-easel { transition-duration: 1ms; transition-delay: 0ms; } }
`
