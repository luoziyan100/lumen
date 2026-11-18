/**
 * [INPUT]: the kit in ./iso.ts; the solid layer in ./solid.ts (solid, flat, cylinder, toFlat, vectors, pivot, along, tones)
 * [OUTPUT]: lampSvg(): the desk lamp SVG (a small thick cast-iron base with a brass rocker switch, a brass collar and a shoulder yoke, twin-rod lower and upper arms balanced by two springs,
 *           brass joint knobs, a conical shade on a short neck clamped in the upper arm's fork, its mouth turned toward the viewer with the bulb inside);
 *           LAMP_CSS: --iso-dip (hover 1: the upper arm dips about the elbow) and --iso-light (open 1: the bulb and the shade's inner wall warm, and a pool of light
 *           lies on the desk where the shade points)
 * [POS]: object 7 of studio/objects/, for the Ideas view while it is a placeholder. It carries no data and follows no event. The pool is one ellipse with a radial
 *        gradient fill, never a blur filter, so nothing over it softens; the pool follows the shade as the arm dips
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { circle, css, kit, line, show, type Vec } from './iso.ts'
import { add, along, BRASS, crs, dot, IRON, len, mul, pivot, r3, ring, solids, sub, turn, unit } from './solid.ts'

const { face } = kit({ x0: 90, y0: 86 })           // model origin (the centre of the base on the desk) in the 213×182 viewBox: the lamp and its pool centred, no empty band under the pool
const { solid, flat, toFlat, cylinder } = solids(face)

/* ---------- Geometry · arms in the plane y = 0; P0 the shoulder, E the elbow, H the head. The shade turns toward the viewer so its mouth shows ---------- */
const BASE_R = 21, BASE_H = 11, CHAMFER = 3, COLLAR_H = 4
const P0: Vec = [0, 0, 32], E: Vec = [-22, 0, 94], H: Vec = [56, 0, 52]
const AXIS: Vec = [0, 1, 0]
const DIP = 8                                                  // degrees the upper arm dips on hover
const DIP_TURN = pivot(E, AXIS, `${DIP} * var(--iso-dip)`)
const SHADE_D = unit([.6, .55, -.45]), NECK = 7, SHADE_L = 34, RIM_R = 20, CAP_R = 6
const CAP_C = add(H, mul(SHADE_D, NECK)), RIM_C = add(CAP_C, mul(SHADE_D, SHADE_L))
const e1 = unit(crs(SHADE_D, [0, 0, 1])), e2 = crs(SHADE_D, e1)   // two directions across the shade's axis
const VIEW: Vec = [1, 1, 1]
const ENAMEL = { top: '#fffaf0', right: '#f3ebdb', left: '#e6dbc6' }
const WARM = '#ffe49a', GLOW = '#f7d98c'

/* ============================================================
   Arms · each is two square rods either side of the arm plane; the upper pair and everything beyond the elbow turn with the dip
   ============================================================ */
function rods(a: Vec, b: Vec, extra = '') {
  const d = sub(b, a), n = mul(unit([-d[2], 0, d[0]]), 3)
  const rod = (y: number) => solid(add(a, [0, y - 1.4, 0], mul(n, -.5)), [d, [0, 2.8, 0], n], ENAMEL, { extra })
  return { back: rod(-5.5), front: rod(5.5) }
}
const lower = rods(P0, E), upper = rods(E, H, DIP_TURN)
// A joint: a disc either side of the rods and a brass knob on the near one
const joint = (c: Vec, r: number, extra = '') => ({
  back: face(r3(add(c, [0, -7, 0])), [1, 0, 0], [0, 0, -1], circle(0, 0, r, ENAMEL.left, 'ln'), extra),
  front: face(r3(add(c, [0, 7, 0])), [1, 0, 0], [0, 0, -1], circle(0, 0, r, ENAMEL.right, 'ln') + circle(0, 0, r * .55, BRASS.right, 'brass') +
    line(-r * .45, -r * .2, r * .45, r * .2, 'ln') + circle(r * .72, -r * .55, .5, '#2f2b25'), extra),
})
const elbow = joint(E, 7.4), head = joint(H, 6.4, DIP_TURN)
// The shoulder: a brass yoke on the collar, one plate either side of the rods, the axle's knob on the near plate
const YOKE_Z = BASE_H + CHAMFER + COLLAR_H, YOKE_H = P0[2] - YOKE_Z
const yokePlate = (y: number, near: boolean) => face(r3([0, y, YOKE_Z]), [1, 0, 0], [0, 0, -1],
  `<path d="M-6 0V${-YOKE_H}A6 6 0 0 1 6 ${-YOKE_H}V0Z" class="brass" style="fill:${near ? BRASS.right : BRASS.left}"/>` +
  (near ? circle(0, -YOKE_H, 3, BRASS.top, 'ln') + line(-2, -YOKE_H - .8, 2, -YOKE_H + .8, 'ln') : ''))

// Springs: from the bracket on the collar to two fifths of the way up the lower arm, coils as narrow loops along the line
function spring(y: number) {
  const a: Vec = [10, y, YOKE_Z + 1], b = add(P0, mul(sub(E, P0), .42), [0, y, 0]), u = unit(sub(b, a)), v: Vec = [-u[2], 0, u[0]], L = len(sub(b, a))
  const coils = Array.from({ length: 24 }, (_, i) => `<ellipse cx="${(5 + i * (L - 10) / 23).toFixed(2)}" cy="0" rx="1.1" ry="3.2" fill="none" class="hair" style="stroke:#6d6458;stroke-width:.7"/>`).join('')
  return face(r3(a), r3(u), r3(v), line(0, 0, 5, 0, 'ln') + coils + line(L - 5, 0, L, 0, 'ln'))
}

/* ============================================================
   The shade · a neck from the head, then a cone from the cap to the rim. Its mouth faces the viewer: the outer cone first, then the inner wall
   inside the rim, the bulb clipped to the mouth, and the warm copies of both
   ============================================================ */
const rimPts = ring(RIM_C, e1, e2, RIM_R, 48), capPts = ring(CAP_C, e1, e2, CAP_R, 24)
// The visible half of a band round the cone: points whose outward direction looks toward the viewer
const band = (c: Vec, r: number) => 'M' + ring(c, e1, e2, r, 48).filter(p => dot(sub(p, c), VIEW) > 0).map(p => toFlat(H, p).join(' ')).join('L')
const mouth = 'M' + rimPts.map(p => toFlat(H, p).join(' ')).join('L') + 'Z'
// The bulb is a sphere: its outline is a circle square to the viewer
const BULB_C = add(CAP_C, mul(SHADE_D, SHADE_L * .62)), S1 = unit(crs(VIEW, [0, 0, 1])), S2 = unit(crs(S1, VIEW))
const bulbAt = (r: number) => 'M' + ring(BULB_C, S1, S2, r, 28).map(p => toFlat(H, p).join(' ')).join('L') + 'Z'
const shade = flat(H, [...rimPts, ...capPts], ENAMEL.right, {
  extra: DIP_TURN,
  body: [.3, .62].map(k => `<path d="${band(add(CAP_C, mul(SHADE_D, SHADE_L * k)), CAP_R + (RIM_R - CAP_R) * k)}" fill="none" class="grain"/>`).join('') +
    `<path d="${band(add(CAP_C, mul(SHADE_D, 2.5)), CAP_R + .9)}" fill="none" style="stroke:${BRASS.left};stroke-width:2"/>` +
    `<path d="${mouth}" fill="#e2d5bb" class="ln"/>` +
    `<g clip-path="url(#iso-lamp-mouth)">` +
    show('var(--iso-light)', `<path d="${mouth}" fill="${GLOW}" opacity=".75"/>`) +
    `<path d="${bulbAt(8.5)}" fill="#f2efe8" class="ln"/><path d="${bulbAt(5)}" fill="none" class="hair"/>` +
    show('var(--iso-light)', `<path d="${bulbAt(8.5)}" fill="${WARM}" class="ln"/><path d="${bulbAt(4.2)}" fill="#fff6d6"/>`) + '</g>' +
    `<path d="${mouth}" fill="none" class="ln" style="stroke-width:1.5"/>`,
})
const neck = flat(H, [...ring(H, e1, e2, 3.2, 16), ...ring(CAP_C, e1, e2, 3.2, 16)], BRASS.right, { extra: DIP_TURN, cls: 'brass' })

/* ============================================================
   The light · under the mouth at rest and dipped; the pool slides between the two as the arm dips.
   It is long along the way the shade points, as a cone cut by the desk is
   ============================================================ */
// The pool lies just under the mouth, a little out the way the shade points: the light reads as leaving the mouth, not landing far off
const hit = (dip: number): Vec => {
  const h = add(turn(sub(H, E), AXIS, dip), E), d = turn(SHADE_D, AXIS, dip), c = add(h, mul(d, NECK + SHADE_L))
  return [c[0] + d[0] * 14, c[1] + d[1] * 14, 0]
}
const POOL0 = hit(0), POOL1 = hit(DIP)
const POOL_SHIFT = along(sub(POOL1, POOL0), 'var(--iso-dip)')
const POOL_DEG = (Math.atan2(SHADE_D[0], -SHADE_D[1]) * 180 / Math.PI).toFixed(1)   // the shade's heading in the desk face's (u, v) = (−y, x)
const pool = face(r3([POOL0[0], POOL0[1], .05]), [0, -1, 0], [1, 0, 0],
  `<ellipse rx="39" ry="27" fill="url(#iso-lamp-pool)" style="opacity:var(--iso-light)" transform="rotate(${POOL_DEG})"/>`, POOL_SHIFT)
// A gradient fill, not a filter: the light fades smoothly to nothing, with no rings on a dark canvas, and nothing over it softens.
// Its focus sits a little back toward the lamp, where the light is strongest
const POOL_FILL = `<radialGradient id="iso-lamp-pool" fx=".42"><stop offset="0" stop-color="${GLOW}" stop-opacity=".75"/>` +
  [.25, .5, .7, .85].map(o => `<stop offset="${o}" stop-color="${GLOW}" stop-opacity="${(.75 * (1 - o) ** 1.6).toFixed(3)}"/>`).join('') +
  `<stop offset="1" stop-color="${GLOW}" stop-opacity="0"/></radialGradient>`

/* ============================================================
   Base · a short thick cast-iron drum with a chamfered top, the rocker switch, a brass collar and the spring bracket
   ============================================================ */
const arc = (r: number, from: number, to: number, n = 48) => Array.from({ length: n + 1 }, (_, i) => { const a = from + (to - from) * i / n; return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}` })
const rivets = Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return circle(+(15.5 * Math.cos(a)).toFixed(2), +(15.5 * Math.sin(a)).toFixed(2), .55, '#5a5249') }).join('')
// The drum's top is a ring (the shoulder round the chamfer), so the chamfer stands on it
const base = cylinder([0, 0, 0], BASE_R, BASE_H, IRON, { n: 28, cut: true }) +
  face([0, 0, BASE_H], [0, -1, 0], [1, 0, 0], `<path d="M${arc(BASE_R, 0, 2 * Math.PI).join('L')}ZM${arc(BASE_R - 3, 0, -2 * Math.PI).join('L')}Z" fill="${IRON.top}" fill-rule="evenodd" class="ln"/>`) +
  cylinder([0, 0, BASE_H], BASE_R - 3, CHAMFER, IRON, { n: 28, top: rivets + circle(0, 0, 11, 'none', 'hair') })
const collar = cylinder([0, 0, BASE_H + CHAMFER], 8, COLLAR_H, BRASS, { n: 20 })
const bracket = solid([7, -8, YOKE_Z], [[6, 0, 0], [0, 16, 0], [0, 0, 3]], BRASS)
// The switch: a brass rocker on the chamfer, toward the viewer
const rocker = solid([4, 9, BASE_H + CHAMFER], [[6, 0, 0], [0, 4, 0], [0, 0, 1.6]], BRASS) + solid([5.5, 10.2, BASE_H + CHAMFER + 1.6], [[3, 0, 0], [0, 1.6, 0], [0, 0, 2.2]], IRON)

const shadow = face([-30, 30, 0], [0, -1, 0], [1, 0, 0], `<ellipse cx="30" cy="30" rx="31" ry="30" fill="#3b2f1e" opacity=".2" filter="url(#iso-lamp-soft)"/>`)

export function lampSvg() {
  // The mouth's clip is in the shade face's (u, v), the same space as the mouth path
  return `<svg class="iso iso-lamp" viewBox="0 0 213 182" role="img" aria-hidden="true">
    <defs><filter id="iso-lamp-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>${POOL_FILL}
    <clipPath id="iso-lamp-mouth" clipPathUnits="userSpaceOnUse"><path d="${mouth}"/></clipPath></defs>
    ${shadow}${pool}${base}${rocker}${collar}${bracket}
    ${yokePlate(-7, false)}${elbow.back}${lower.back}${upper.back}${head.back}
    ${spring(-5)}${lower.front}${upper.front}${spring(5)}
    ${yokePlate(7, true)}${elbow.front}
    ${neck}${shade}${head.front}
  </svg>`
}

export const LAMP_CSS = css('.iso-lamp', { '--iso-dip': { hover: 1, ms: 800 }, '--iso-light': { open: 1, ms: 600, ease: 'ease' } })
