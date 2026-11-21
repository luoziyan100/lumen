/**
 * [INPUT]: the engraving kit of ./line.ts
 * [OUTPUT]: bowedBody(spec): the front of a violin-family instrument (body, purfling, grain, f-holes, bridge, fingerboard, pegbox, scroll, tailpiece, strings) plus its geometry
 *           (string x at a depth, bridge and fingerboard-end depths, f-hole eyes, the contact depth for a bow); bow(L, id): a bow drawn along +x from tip (0, 0) to frog (L, 0), hair on y = 0, with a pointed head, an ebony frog (pearl eye, ferrule, slide) and the screw button
 * [POS]: the shared model of objects/music/violin.ts and cello.ts. One unit outline (body length 1, top at 0) is mirrored about the centre line and scaled, so both instruments
 *        keep the same structure: the bridge stands on the line through the f-hole notches, the fingerboard ends before the bridge, four strings run nut → bridge → tailpiece.
 *        Each string sits in its own group (`${prefix}s${i}`) so the owner can shake it; the bow's hair line is y = 0, so a translate along x keeps the contact point on the strings
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { circle, curve, dbl, ellipse, hatch, inset, line, path, r, rect, ticks, type Pt, type Seg } from './line.ts'

/* ============================================================
   Unit model · body top y = 0, bottom y = 1, x from the centre line (right half)
   ============================================================ */
const HALF: Seg[] = [
  ['C', [.12, 0], [.236, .06], [.236, .2]],
  ['C', [.236, .29], [.205, .33], [.2, .352]],
  ['L', [.222, .37]],
  ['L', [.19, .385]],
  ['C', [.16, .41], [.155, .45], [.157, .5]],
  ['C', [.158, .55], [.165, .6], [.198, .618]],
  ['L', [.23, .626]],
  ['L', [.222, .646]],
  ['C', [.27, .68], [.292, .72], [.292, .78]],
  ['C', [.292, .9], [.17, 1], [0, 1]],
]
const NUT = -.37, FB_END = .4, BRIDGE = .55, TAIL_TOP = .7, TAIL_END = .93
const AT_NUT = [-.023, -.0077, .0077, .023], AT_BRIDGE = [-.048, -.016, .016, .048], AT_TAIL = [-.032, -.011, .011, .032]
const PEGS: [number, number][] = [[-1, -.41], [1, -.44], [-1, -.48], [1, -.51]]

export interface BowedSpec { prefix: string; cx: number; top: number; len: number; chinrest?: boolean; endpin?: number }

export function bowedBody(spec: BowedSpec) {
  const { prefix: P, cx, top, len } = spec
  const u = (x: number, y: number): Pt => [cx + x * len, top + y * len]
  const k = len / 160

  const mirror = (segs: Seg[]): Seg[] => {
    const pts: Pt[] = [[0, 0]]
    for (const s of segs) pts.push(s[0] === 'L' ? s[1] : s[3])
    const out: Seg[] = []
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i]!, to = pts[i]!
      out.push(s[0] === 'L' ? ['L', [-to[0], to[1]]] : ['C', [-s[2][0], s[2][1]], [-s[1][0], s[1][1]], [-to[0], to[1]]])
    }
    return out
  }
  const scale = (s: Seg): Seg => s[0] === 'L' ? ['L', u(...s[1])] : ['C', u(...s[1]), u(...s[2]), u(...s[3])]
  const OUT = curve(u(0, 0), [...HALF, ...mirror(HALF)].map(scale), true)

  const stringX = (i: number, y: number) => {
    if (y <= BRIDGE) { const t = (y - NUT) / (BRIDGE - NUT); return cx + (AT_NUT[i]! + (AT_BRIDGE[i]! - AT_NUT[i]!) * t) * len }
    const t = (y - BRIDGE) / (TAIL_TOP + .025 - BRIDGE)
    return cx + (AT_BRIDGE[i]! + (AT_TAIL[i]! - AT_BRIDGE[i]!) * t) * len
  }

  /* ------------------------------ body ------------------------------ */
  let body = `<path d="${OUT.d}" class="w2 pf"/>`
  let grain = ''
  for (let x = -.3; x <= .3; x += 2.6 / len) grain += line(...u(x, 0), ...u(x + .004, 1), 'w0 mu-gr')
  body += `<g clip-path="url(#${P}body)">${grain}</g>`
  body += inset(OUT.d, `${P}body`, [2.2 * k, 3.4 * k, 4 * k])
  body += `<g clip-path="url(#${P}body)">${ticks(OUT.every(1.5 * k), -1.9 * k, 'w0', -1.3 * k, -.2 * k)}</g>`
  const shade = OUT.every(2 * k).filter(s => s.p[0] > cx + .12 * len)
  body += `<g clip-path="url(#${P}body)">${ticks(shade, -4.2 * k, 'w0', -2.6 * k, -4.6 * k)}</g>`
  body += path(`M${u(-.045, .16).join(' ')}L${u(-.045, .84).join(' ')}`, 'w0 dash') + circle(...u(.052, .59), .008 * len, 'w0 dash')

  /* ------------------------------ f-holes ------------------------------ */
  const eyes: Pt[] = []
  let fholes = ''
  const W_MAX = .005 * len, EYE_UP = .0055 * len, EYE_LO = .0075 * len
  for (const side of [1, -1]) {
    const up = u(side * .06, .445), lo = u(side * .106, .655)
    eyes.push(up, lo)
    const c = curve([up[0] + side * EYE_UP * .6, up[1]], [
      ['C', u(side * .078, .445), u(side * .084, .47), u(side * .084, .5)],
      ['C', u(side * .084, .56), u(side * .086, .605), u(side * .09, .632)],
      ['C', u(side * .093, .652), u(side * .097, .656), [lo[0] - side * EYE_LO * .6, lo[1]]],
    ])
    const left: Pt[] = [], right: Pt[] = []
    for (let i = 0; i <= 32; i++) {
      const q = c.at(c.length * i / 32), w = .25 + W_MAX * Math.pow(Math.sin(Math.PI * i / 32), .9)
      left.push([q.p[0] + q.n[0] * w, q.p[1] + q.n[1] * w]); right.push([q.p[0] - q.n[0] * w, q.p[1] - q.n[1] * w])
    }
    fholes += path('M' + [...left, ...right.reverse()].map(p => `${r(p[0])} ${r(p[1])}`).join('L') + 'Z', 'if ns')
    fholes += circle(...up, EYE_UP, 'if ns') + circle(...up, EYE_UP + .7, 'w0') + circle(...lo, EYE_LO, 'if ns') + circle(...lo, EYE_LO + .7, 'w0')
    const mid = c.at(c.length / 2), tx = -mid.n[1], ty = mid.n[0], half = .004 * len, reach = W_MAX + .011 * len
    for (const dir of [1, -1]) {
      const base = (k: number): Pt => [mid.p[0] + tx * k * half + mid.n[0] * dir * W_MAX * .8, mid.p[1] + ty * k * half + mid.n[1] * dir * W_MAX * .8]
      const apex: Pt = [mid.p[0] + mid.n[0] * dir * reach - tx * half * .4, mid.p[1] + mid.n[1] * dir * reach - ty * half * .4]
      fholes += path(`M${r(base(-1)[0])} ${r(base(-1)[1])}L${r(apex[0])} ${r(apex[1])}L${r(base(1)[0])} ${r(base(1)[1])}Z`, 'if ns')
    }
  }

  /* ------------------------------ fingerboard, neck, pegbox, scroll ------------------------------ */
  const fb = `M${u(-.034, NUT).join(' ')}L${u(.034, NUT).join(' ')}L${u(.06, FB_END).join(' ')}C${u(.04, FB_END + .022).join(' ')} ${u(-.04, FB_END + .022).join(' ')} ${u(-.06, FB_END).join(' ')}Z`
  let neck = circle(...u(0, 0), .036 * len, 'w1 pf')
  neck += `<path d="${fb}" class="w1 pf"/>` + hatch(`${P}fb`, [cx - .07 * len, top + NUT * len, .14 * len, (FB_END - NUT + .03) * len], 64, 2.2 * k) + inset(fb, `${P}fb`, [1.1 * k])
  const box = `M${u(-.037, NUT).join(' ')}L${u(-.031, -.53).join(' ')}L${u(.031, -.53).join(' ')}L${u(.037, NUT).join(' ')}Z`
  neck += `<path d="${box}" class="w1 pf"/>` + rect(...u(-.017, -.515), .034 * len, .14 * len, 'w0 pf') + hatch(`${P}pb`, [cx - .02 * len, top - .52 * len, .04 * len, .15 * len], -50, 1.4 * k)
  neck += rect(...u(-.037, NUT - .006), .074 * len, .012 * len, 'w1 pf')
  for (const [side, y] of PEGS) {
    const a = u(side * .037, y), b = u(side * .12, y)
    neck += line(a[0], a[1], b[0], b[1], 'w2') + line(a[0], a[1] - .6, b[0], b[1] - .6, 'w0 pw')
    neck += ellipse(...u(side * .052, y), .006 * len, .014 * len, 'w1 pf') + line(...u(side * .06, y - .013), ...u(side * .06, y + .013), 'w0')
    neck += ellipse(...u(side * .118, y), .03 * len, .021 * len, 'w1 pf') + ellipse(...u(side * .118, y), .018 * len, .011 * len, 'w0') + circle(...u(side * .084, y), .006 * len, 'w0 pf')
  }
  const head = curve(u(.031, -.53), [['C', u(.066, -.555), u(.054, -.668), u(0, -.668)], ['C', u(-.054, -.668), u(-.066, -.555), u(-.031, -.53)]])
  let scroll = `<path d="${head.d}" class="w2 pf"/>` + ticks(head.every(1.1 * k), 1.5 * k, 'w0', 1, .5)
  for (const side of [1, -1]) {
    const c = u(side * .028, -.598)
    for (const [r0, ph, cls] of [[.029, 0, 'w1'], [.022, .7, 'w0']] as const) {
      let d = ''
      for (let a = 0; a <= Math.PI * 2 * 2.4; a += Math.PI / 14) {
        const rad = r0 * len * (1 - a / (Math.PI * 2 * 2.4) * .88), ang = side * (a + ph) - Math.PI / 2
        d += `${d ? 'L' : 'M'}${r(c[0] + Math.cos(ang) * rad)} ${r(c[1] + Math.sin(ang) * rad)}`
      }
      scroll += path(d, cls)
    }
    scroll += circle(...c, .0045 * len, 'if ns')
  }
  scroll += line(...u(-.006, -.666), ...u(-.006, -.53), 'w0') + line(...u(.006, -.666), ...u(.006, -.53), 'w0')

  /* ------------------------------ bridge, tailpiece, chinrest, endpin ------------------------------ */
  const by = BRIDGE
  let bridge = rect(...u(-.072, by - .004), .03 * len, .012 * len, 'w0 pf') + rect(...u(.042, by - .004), .03 * len, .012 * len, 'w0 pf')
  bridge += path(`M${u(-.085, by + .004).join(' ')}C${u(-.04, by - .012).join(' ')} ${u(.04, by - .012).join(' ')} ${u(.085, by + .004).join(' ')}L${u(.08, by + .011).join(' ')}C${u(.04, by - .002).join(' ')} ${u(-.04, by - .002).join(' ')} ${u(-.08, by + .011).join(' ')}Z`, 'w1 pf')
  bridge += path(`M${u(-.015, by + .006).join(' ')}C${u(-.01, by - .004).join(' ')} ${u(.01, by - .004).join(' ')} ${u(.015, by + .006).join(' ')}`, 'w0')
  const tail = `M${u(-.05, TAIL_TOP).join(' ')}C${u(-.02, TAIL_TOP - .012).join(' ')} ${u(.02, TAIL_TOP - .012).join(' ')} ${u(.05, TAIL_TOP).join(' ')}C${u(.046, .8).join(' ')} ${u(.03, .88).join(' ')} ${u(.026, TAIL_END).join(' ')}C${u(.01, TAIL_END + .012).join(' ')} ${u(-.01, TAIL_END + .012).join(' ')} ${u(-.026, TAIL_END).join(' ')}C${u(-.03, .88).join(' ')} ${u(-.046, .8).join(' ')} ${u(-.05, TAIL_TOP).join(' ')}Z`
  let tailpiece = line(...u(-.012, TAIL_END), ...u(-.02, .99), 'w1') + line(...u(.012, TAIL_END), ...u(.02, .99), 'w1')
  tailpiece += `<path d="${tail}" class="w1 pf"/>` + hatch(`${P}tp`, [cx - .06 * len, top + (TAIL_TOP - .02) * len, .12 * len, .26 * len], -58, 1.6 * k) + inset(tail, `${P}tp`, [1.2 * k])
  for (let i = 0; i < 4; i++) tailpiece += circle(stringX(i, TAIL_TOP + .025), top + (TAIL_TOP + .025) * len, .005 * len, 'w0 pf')
  tailpiece += circle(...u(.032, TAIL_TOP + .05), .009 * len, 'w1 pf') + line(...u(.025, TAIL_TOP + .05), ...u(.039, TAIL_TOP + .05), 'w0')
  tailpiece += rect(...u(-.04, .986), .08 * len, .014 * len, 'w1 pf')
  if (spec.endpin) {
    const [ex, ey] = u(0, 1.014)
    tailpiece += rect(ex - .02 * len, ey - 1, .04 * len, .03 * len, 'w1 pf') + line(ex - .02 * len, ey + 2, ex + .02 * len, ey + 2, 'w0')
    tailpiece += line(ex, ey + .03 * len, ex, ey + spec.endpin, 'w2') + line(ex - .6, ey + .03 * len, ex - .6, ey + spec.endpin - 2, 'w0 pw')
    tailpiece += circle(ex, ey + spec.endpin - 1.2, 2.2, 'w1 pf') + circle(ex, ey + spec.endpin - 1.2, .7, 'if ns')
  } else tailpiece += circle(...u(0, 1.012), .012 * len, 'w1 pf') + circle(...u(0, 1.012), .005 * len, 'w0')
  if (spec.chinrest) {
    const cr = curve(u(-.06, .84), [['C', u(-.08, .78), u(-.22, .78), u(-.24, .86)], ['C', u(-.25, .92), u(-.16, .97), u(-.1, .96)], ['C', u(-.05, .95), u(-.05, .9), u(-.06, .84)]], true)
    tailpiece += `<path d="${cr.d}" class="w1 pf"/>` + inset(cr.d, `${P}cr`, [2 * k, 3 * k]) + `<g clip-path="url(#${P}cr)">${ticks(cr.every(1.4 * k), -1.4 * k, 'w0', -.9)}</g>`
  }

  /* ------------------------------ strings ------------------------------ */
  let strings = ''
  for (let i = 0; i < 4; i++) {
    const cls = i < 2 ? 'w1' : 'w0', peg = PEGS[i]!
    const back = line(stringX(i, NUT), top + NUT * len, cx + peg[0] * .012 * len, top + peg[1] * len, 'w0')
    const fore = line(stringX(i, NUT), top + NUT * len, stringX(i, BRIDGE), top + BRIDGE * len, cls)
    strings += back + `<g class="${P}s ${P}s${i}">${fore}</g>` + line(stringX(i, BRIDGE), top + BRIDGE * len, stringX(i, TAIL_TOP + .025), top + (TAIL_TOP + .025) * len, cls)
  }

  const defs = `<clipPath id="${P}body"><path d="${OUT.d}"/></clipPath><clipPath id="${P}fb"><path d="${fb}"/></clipPath><clipPath id="${P}pb">${rect(...u(-.017, -.515), .034 * len, .14 * len, '')}</clipPath>` +
    `<clipPath id="${P}tp"><path d="${tail}"/></clipPath>` +
    (spec.chinrest ? `<clipPath id="${P}cr"><path d="M${u(-.06, .84).join(' ')}C${u(-.08, .78).join(' ')} ${u(-.22, .78).join(' ')} ${u(-.24, .86).join(' ')}C${u(-.25, .92).join(' ')} ${u(-.16, .97).join(' ')} ${u(-.1, .96).join(' ')}C${u(-.05, .95).join(' ')} ${u(-.05, .9).join(' ')} ${u(-.06, .84).join(' ')}Z"/></clipPath>` : '')
  const markup = body + fholes + neck + scroll + tailpiece + bridge + strings
  return {
    defs, markup, stringX, eyes,
    y: (v: number) => top + v * len,
    contact: top + (BRIDGE - .04) * len,
    bridge: top + BRIDGE * len, fbEnd: top + FB_END * len,
    halfWidth: (v: number) => { let m = 0; for (const p of OUT.points) if (Math.abs(p[1] - (top + v * len)) < .8) m = Math.max(m, p[0] - cx); return m },
  }
}

/* ============================================================
   Bow · tip at (0, 0), frog at (L, 0); hair (two lines) on y = 0, the stick above it (−y) with its camber toward the hair.
   The head is a pointed hatchet with a face plate; the frog is an ebony block with a pearl eye, a metal ferrule where the hair enters,
   a slide along its underside, and behind it the adjusting screw button. `id` prefixes the frog's clip
   ============================================================ */
export function bow(L: number, id: string) {
  const s = L / 320
  const lift = (x: number) => -(5.4 - 2.4 * Math.sin(Math.PI * x / L)) * s - 1.4
  const stick = curve([L * .03, lift(L * .03)], [['C', [L * .3, lift(L * .3)], [L * .6, lift(L * .6)], [L * .9, lift(L * .9)]]])
  const fx = L * .855, fw = L * .085, fy0 = lift(fx) + 1.2 * s, fy1 = 5.2 * s
  let out = line(L * .02, 0, fx + 1, 0, 'w0') + line(L * .02, 1.1 * s, fx + 1, 1.1 * s, 'w0')
  out += dbl(stick.d, 1.9 * s + .6, .3)
  for (const q of stick.every(9 * s, L * .05, L * .74)) out += line(q.p[0], q.p[1] - .9 * s - .2, q.p[0] + 1.6, q.p[1] + .9 * s + .2, 'w0')
  for (let x = L * .76; x < L * .84; x += 1.1) out += line(x, lift(x) - 1.1 * s - .3, x + .5, lift(x) + 1.1 * s + .3, 'w0')
  const hy = lift(0)
  out += path(`M${r(L * .05)} ${r(lift(L * .05) - .8 * s)}C${r(L * .03)} ${r(hy - 1 * s)} ${r(3 * s)} ${r(hy - 6 * s)} ${r(-.8 * s)} ${r(hy - 7.2 * s)}L${r(-.2 * s)} ${r(hy - 5.4 * s)}L${r(1 * s)} ${r(1.8 * s)}L${r(L * .03)} ${r(1.8 * s)}L${r(L * .05)} ${r(lift(L * .05) + 1.2 * s)}Z`, 'w1 pf')
  out += path(`M${r(.7 * s)} ${r(hy - 5.2 * s)}L${r(1.9 * s)} ${r(1.2 * s)}`, 'w0') + line(1 * s, 1.8 * s, L * .03, 1.8 * s, 'w1')
  const frog = `M${r(fx)} ${r(fy0)}L${r(fx + fw)} ${r(fy0)}L${r(fx + fw)} ${r(fy1 - 1.2 * s)}C${r(fx + fw * .7)} ${r(fy1 + .6 * s)} ${r(fx + fw * .35)} ${r(fy1 + .6 * s)} ${r(fx + 3 * s)} ${r(fy1 - .4 * s)}L${r(fx)} ${r(1.8 * s)}Z`
  out += `<clipPath id="${id}frog"><path d="${frog}"/></clipPath><path d="${frog}" class="w1 pf"/>` + hatch(`${id}frog`, [fx - 2, fy0 - 2, fw + 4, fy1 - fy0 + 4], 70, .7 * s + .25)
  const ex = fx + fw * .55, ey = (fy0 + fy1) / 2 - .4 * s
  out += circle(ex, ey, 2.2 * s + .4, 'w1 pf') + circle(ex, ey, 1.4 * s + .2, 'w0') + circle(ex, ey, .5 * s + .1, 'w0')
  out += path(`M${r(fx + 3.4 * s)} ${r(fy1 - .2 * s)}C${r(fx + fw * .4)} ${r(fy1 + .9 * s)} ${r(fx + fw * .7)} ${r(fy1 + .9 * s)} ${r(fx + fw - .6)} ${r(fy1 - .8 * s)}`, 'w0')
  out += rect(fx - .4, -.8 * s, 2.6 * s, 2.8 * s + .4, 'w1 pf') + line(fx + .9 * s, -.8 * s, fx + .9 * s, 2.4 * s, 'w0')
  const bx = fx + fw + .6
  out += rect(bx, lift(bx) - .4, 2.2 * s, 2.6 * s + .8, 'w1 pf')
  out += rect(bx + 2.2 * s, lift(bx) - .6, L - bx - 2.2 * s, 2.6 * s + 1.2, 'w1 pf', .8)
  for (let x = bx + 3.4 * s; x < L - 1; x += 1.3 * s + .3) out += line(x, lift(bx) - .2, x, lift(bx) + 2.6 * s + .4, 'w0')
  out += rect(L - 1.6 * s, lift(bx) - .2, 1.6 * s, 2.6 * s + .4, 'w0 pf')
  return out
}
