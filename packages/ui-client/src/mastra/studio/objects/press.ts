/**
 * [INPUT]: the kit in ./iso.ts; the solid layer in ./solid.ts (solid, cylinder, tones, pivot, along)
 * [OUTPUT]: pressSvg(): the flower press SVG (two square boards, four threaded posts with brass wing nuts, a stack of blotting paper with notched corners, a pressed
 *           leaf whose tip shows at the front-right edge); PRESS_CSS: --iso-spin (hover and open 1: the wing nuts turn a quarter) and --iso-lift (open 1: the top board,
 *           its washers and nuts climb the posts and the leaf shows)
 * [POS]: object 5 of studio/objects/, for the Takeaways view with nothing kept yet. It carries no data and follows no event. Posts are drawn once in full before the stack
 *        (they show in the gap when the board lifts) and again above each nut, shortened by the lift, so a nut always sits on a post that runs on above it
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { circle, css, grain, kit, line, rect, type Vec } from './iso.ts'
import { add, along, BRASS, DARK, IRON, mix, pivot, solids, WOOD } from './solid.ts'

const { face } = kit({ x0: 160, y0: 150 })        // model origin (the back corner of the bottom board) in the 320×300 viewBox
const { solid, cylinder } = solids(face)

/* ---------- Size · boards 130 square, 10 thick; seven sheets of 2.2 between; posts inset 9, radius 3.6, up to z 84; the top board climbs 30 when open ---------- */
const B = 130, T = 10, SHEET = 2.2, SHEETS = 7, NOTCH = 16
const STACK = T + SHEET * SHEETS, TOP = STACK + T             // the stack's top and the top board's top, at rest
const POSTS: [number, number][] = [[9, 9], [B - 9, 9], [9, B - 9], [B - 9, B - 9]]   // back, right, left, front: back to front
const PR = 3.6, POST_TOP = 84, LIFT = 30
const WASH = 1.2, HUB = 6, HUB_TOP = TOP + WASH + HUB
const UP = along([0, 0, LIFT], 'var(--iso-lift)')
const SPIN = (c: Vec) => pivot(c, [0, 0, 1], '90 * var(--iso-spin)')
const PAPER = ['#f6efe1', '#efdcd4', '#f6efe1', '#e4d2b0', '#f6efe1', '#efdcd4', '#f8f2e6']

/* ============================================================
   The boards · grain, a routed border on top, a blank brass plate on the front
   ============================================================ */
const bottom = solid([0, 0, 0], [[B, 0, 0], [0, B, 0], [0, 0, T]], DARK, { seed: 3, grains: 2 })
const topBoard = solid([0, 0, STACK], [[B, 0, 0], [0, B, 0], [0, 0, T]], WOOD, {
  seed: 8, grains: 3, extra: UP,
  detail: (normal, w, h) => {
    if (normal[2] > .9) return rect(9, 9, w - 18, h - 18, 'none', 'hair', 3) + rect(13, 13, w - 26, h - 26, 'none', 'grain', 2)
    if (normal[0] > .9) return rect(w / 2 - 15, 2.4, 30, h - 4.8, '#e3c27e', 'brass', 1) + rect(w / 2 - 12.5, 3.8, 25, h - 7.6, '#fffdf6', 'hair', .6) +
      circle(w / 2 - 13.4, h / 2, .7, '#2f2b25') + circle(w / 2 + 13.4, h / 2, .7, '#2f2b25')
    return ''
  },
})

/* ============================================================
   The stack · sheets the size of the boards with their corners notched for the posts; each edge sits a little off true, as paper does
   ============================================================ */
function sheet(i: number) {
  const z = T + SHEET * (i + 1), d = Math.sin(i * 2.1) * 1.2, fill = PAPER[i % PAPER.length]!, edge = mix(fill, '#6d6458', .18)
  const span = B - 2 * NOTCH
  return face([B + d, B - NOTCH, z], [0, -1, 0], [0, 0, -1], rect(0, 0, span, SHEET, mix(fill, '#d6cab2', .25), 'none') + line(0, SHEET, span, SHEET, 'hair').replace('hair', `hair" style="stroke:${edge}`)) +
    face([NOTCH, B - d * .6, z], [1, 0, 0], [0, 0, -1], rect(0, 0, span, SHEET, mix(fill, '#c9b996', .3), 'none') + line(0, SHEET, span, SHEET, 'hair').replace('hair', `hair" style="stroke:${edge}`))
}
const stackSides = face([B, B - NOTCH, STACK], [0, -1, 0], [0, 0, -1], rect(0, 0, B - 2 * NOTCH, STACK - T, 'none')) +
  face([NOTCH, B, STACK], [1, 0, 0], [0, 0, -1], rect(0, 0, B - 2 * NOTCH, STACK - T, 'none'))
// The top sheet: the notched square, seen only while the board is up
const topSheet = face([0, B, STACK], [0, -1, 0], [1, 0, 0],
  `<path d="M${NOTCH} 0H${B - NOTCH}V${NOTCH}H${B}V${B - NOTCH}H${B - NOTCH}V${B}H${NOTCH}V${B - NOTCH}H0V${NOTCH}H${NOTCH}Z" fill="${PAPER[6]}" class="ln"/>` +
  [24, 40, 56, 72, 88, 104].map((v, i) => line(NOTCH + 6, v, B - NOTCH - 6 - (i % 3) * 10, v + .6, 'grain')).join(''))

/* ============================================================
   The leaf · on the top sheet, its tip out past the front-right edge. In (u, v): u runs along −y from y = 92, v along +x from x = 70; the edge is at v = 60.
   The part under the board is drawn before it, the tip after it, so the tip always lies in front of the board's side
   ============================================================ */
const LEAF_Y = 92, LEAF_X = 70, EDGE = B - LEAF_X
const leafBody = (() => {
  const mid = 14, tip = 76
  let veins = ''
  for (let i = 0; i < 7; i++) {
    const v = 10 + i * 8.2, spread = 9.5 * Math.sin(Math.PI * (v + 4) / (tip + 8))
    veins += `<path d="M${mid} ${v}Q${mid - spread * .5} ${v + 2} ${mid - spread} ${v + 6}" class="hair" style="stroke:#6f7f58"/>` +
      `<path d="M${mid} ${v + 2}Q${mid + spread * .5} ${v + 4} ${mid + spread} ${v + 8}" class="hair" style="stroke:#6f7f58"/>`
  }
  return `<path d="M${mid} 4C${mid - 13} 18 ${mid - 12} 50 ${mid} ${tip}C${mid + 12} 52 ${mid + 13} 18 ${mid} 4Z" fill="#b6c39a" class="ln"/>` +
    `<path d="M${mid} 0V${tip - 2}" class="hair" style="stroke:#6f7f58;stroke-width:.8"/>` + veins +
    // The stem, flattened and a little bent
    `<path d="M${mid} 4Q${mid - 1} -2 ${mid + 2} -7" fill="none" class="ln"/>`
})()
const leafAt = (clip: string) => face([LEAF_X, LEAF_Y, STACK + .05], [0, -1, 0], [1, 0, 0], `<g clip-path="url(#${clip})">${leafBody}</g>`)
// A pressed sprig on a lower sheet: only its two florets, out past the front-left edge (v < 0 is outside), are drawn; the rest is under the sheets above
const floret = (u: number, v: number) => [0, 72, 144, 216, 288].map(a => {
  const cx = +(u + 2 * Math.cos(a * Math.PI / 180)).toFixed(2), cy = +(v + 2 * Math.sin(a * Math.PI / 180)).toFixed(2)
  return `<ellipse cx="${cx}" cy="${cy}" rx="1.9" ry="1.1" transform="rotate(${a} ${cx} ${cy})" fill="#e7c3c7" class="hair"/>`
}).join('') + circle(u, v, .9, '#d9a95f')
const sprig = face([94, B, T + SHEET * 4 + .05], [1, 0, 0], [0, -1, 0],
  `<path d="M2 .2Q6 -1 12 -3.4" class="hair" style="stroke:#6f7f58"/>` + floret(12, -3.6) + floret(18, -2.2))

/* ============================================================
   Posts and nuts · threads are slanted hairlines across the post's face to the viewer
   ============================================================ */
const threads = (c: Vec, z0: number, z1: number, extra = '') => face(add(c, [0, 0, z1]), [.707, -.707, 0], [0, 0, -1],
  Array.from({ length: Math.floor((z1 - z0) / 2.6) }, (_, i) => `<path d="M${-PR} ${1.4 + i * 2.6}Q0 ${2.6 + i * 2.6} ${PR} ${1.8 + i * 2.6}" class="hair"/>`).join(''), extra)
const postFull = ([x, y]: [number, number]) => cylinder([x, y, T], PR, POST_TOP - T, IRON, { n: 14 }) + threads([x, y, 0], T, POST_TOP)
// Above the nut: the same post from the nut's top to its end; as the nut climbs, the stretch shortens about the post's end
function postAbove([x, y]: [number, number]) {
  const len = POST_TOP - HUB_TOP, shrink = `translate3d(0px, 0px, ${POST_TOP}px) scale3d(1, 1, calc((${len} - ${LIFT} * var(--iso-lift)) / ${len})) translate3d(0px, 0px, ${-POST_TOP}px)`
  return cylinder([x, y, HUB_TOP], PR, len, IRON, { n: 14, extra: shrink, top: circle(0, 0, PR * .45, '#8a8176') }) + threads([x, y, 0], HUB_TOP, POST_TOP, shrink)
}
// A wing: an ear-shaped brass plate standing on the hub, in the plane of its direction and z
const wingPath = 'M3.6 0L4.4 -5C5.4 -11.5 12.6 -14.4 14.4 -9.4C15.4 -5.6 11 -1.6 4.8 .6Z'
const wing = (c: Vec, dir: Vec) => face(add(c, [0, 0, TOP + WASH + 1.5]), dir, [0, 0, -1], `<path d="${wingPath}" class="brass"/><path d="M5.6 -4.2C7 -9 11.2 -11 12.6 -8.6" class="hair"/>`, `${UP} ${SPIN(c)}`)
function nut([x, y]: [number, number]) {
  const c: Vec = [x, y, 0]
  const washer = cylinder([x, y, TOP], 7, WASH, BRASS, { n: 20, extra: UP, top: circle(0, 0, PR + .4, '#c99f52', 'hair') })
  const hub = cylinder([x, y, TOP + WASH], 4.6, HUB, BRASS, { n: 6, extra: `${UP} ${SPIN(c)}`, cut: true })
  const hubTop = face([x, y, HUB_TOP], [0, -1, 0], [1, 0, 0], `<path d="${Array.from({ length: 6 }, (_, i) => `${i ? 'L' : 'M'}${(4.6 * Math.cos(i * Math.PI / 3)).toFixed(2)} ${(4.6 * Math.sin(i * Math.PI / 3)).toFixed(2)}`).join('')}Z" fill="${BRASS.top}" class="ln"/>`, `${UP} ${SPIN(c)}`)
  // Wings start along x and turn to y: both planes face the viewer at either end (along the diagonal they would be edge-on). The +x wing stays in the
  // front half through the quarter turn and goes over the post above it; the −x wing stays behind and goes under the hub
  return { back: washer + wing(c, [-1, 0, 0]), front: hub + hubTop + postAbove([x, y]) + wing(c, [1, 0, 0]) }
}

const shadow = face([-8, B + 14, 0], [0, -1, 0], [1, 0, 0],
  `<rect x="0" y="0" width="${B + 26}" height="${B + 22}" rx="20" fill="#3b2f1e" opacity=".15" filter="url(#iso-press-soft)"/>`)

export function pressSvg() {
  const nuts = POSTS.map(nut)
  return `<svg class="iso iso-press" viewBox="0 0 320 300" role="img" aria-hidden="true">
    <defs><filter id="iso-press-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
    <clipPath id="iso-press-under" clipPathUnits="userSpaceOnUse"><rect x="-20" y="-20" width="60" height="${EDGE + 20}"/></clipPath>
    <clipPath id="iso-press-tip" clipPathUnits="userSpaceOnUse"><rect x="-20" y="${EDGE}" width="60" height="40"/></clipPath></defs>
    ${shadow}${bottom}
    ${POSTS.map(postFull).join('')}
    ${stackSides}${Array.from({ length: SHEETS }, (_, i) => sheet(i)).join('')}${sprig}${topSheet}${leafAt('iso-press-under')}
    ${topBoard}
    ${nuts.map(n => n.back + n.front).join('')}
    ${leafAt('iso-press-tip')}
  </svg>`
}

export const PRESS_CSS = css('.iso-press', { '--iso-spin': { hover: 1, open: 1, ms: 700 }, '--iso-lift': { open: 1, ms: 1100 } })
