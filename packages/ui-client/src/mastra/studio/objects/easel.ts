/**
 * [INPUT]: shared White-Porcelain CAD helpers in ./instrument.ts
 * [OUTPUT]: easelSvg(): overhead gantry CNC drafting plotter SVG (640×400 monochrome white-porcelain CAD: bolted dual rails, gliding gantry,
 *           Y carriage with a 2-link truss arm whose pen draws one closed hypotrochoid, construction circles of that curve, rail-end pulley
 *           belted to a ribbed stepper by true tangents); EASEL_CSS (keyframes solved from the curve, reduced-motion rest on the loop's first frame)
 * [POS]: object 4 of studio/objects/, shown in the empty Board view. The curve drives the machine: gantry X, carriage Y and both arm angles
 *        come from one arc-length sample per keyframe, so the nib stays on the growing line (measured ≤0.1 unit in Chromium and WebKit).
 *        Pure valid XML SVG with uniquely prefixed ids (`ea-`)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { bolt, coolingFins, dotGridBackdrop, gearPath, instrumentDefs, r2, rivet, rivetRow, spinKeyframes, trussArm } from './instrument.ts'

const PFX = 'ea-'

/* ============================================================
   Plot kinematics: the curve drives the machine
   ------------------------------------------------------------
   The pen draws one closed hypotrochoid. The gantry and the carriage follow
   only its slow circle; the 2-link arm takes up the rest. Every keyframe is
   solved from the same arc-length sample, so the nib sits on the line's
   growing end at every instant and returns to its start for the next loop.
   ============================================================ */
const PLOT = { cx: 300, cy: 198, a: 52, d: 26, k: 4 }        // nib(t) = c + a·e^{it} + d·e^{-ikt}
const SHOULDER0 = { x: 311, y: 176 }                          // where the carriage is drawn at rest
const L1 = 66, L2 = 60                                        // reach 6..126; the plot needs 29..119
const STEPS = 96                                              // keyframes per loop
const DRAW_END = 80                                           // % of the loop spent drawing; then hold and fade

const nibAt = (t: number) => ({
  x: PLOT.cx + PLOT.a * Math.cos(t) + PLOT.d * Math.cos(PLOT.k * t),
  y: PLOT.cy + PLOT.a * Math.sin(t) - PLOT.d * Math.sin(PLOT.k * t),
})
const shoulderAt = (t: number) => ({ x: PLOT.cx - 70 + 0.6 * PLOT.a * Math.cos(t), y: PLOT.cy - 20 + 0.6 * PLOT.a * Math.sin(t) })

const KINEMATICS = (() => {
  // Arc-length table, so a linear dash reveal and linear keyframes advance together
  const N = 2400
  const ts: number[] = [0], lens: number[] = [0]
  for (let i = 1; i <= N; i++) {
    const t = (i / N) * Math.PI * 2
    const p = nibAt(t), q = nibAt(ts[i - 1]!)
    ts.push(t); lens.push(lens[i - 1]! + Math.hypot(p.x - q.x, p.y - q.y))
  }
  const total = lens[N]!
  const tAtLength = (l: number) => {
    let i = 1
    while (i < N && lens[i]! < l) i++
    const f = (l - lens[i - 1]!) / ((lens[i]! - lens[i - 1]!) || 1)
    return ts[i - 1]! + (ts[i]! - ts[i - 1]!) * f
  }
  // Two-link inverse kinematics, elbow always on the upper side; angles unwrapped so no keyframe spins the long way round
  const deg = (r: number) => (r * 180) / Math.PI
  const unwrap = (prev: number | undefined, a: number) => { if (prev === undefined) return a; while (a - prev > 180) a -= 360; while (a - prev < -180) a += 360; return a }
  const frames: { at: number, gx: number, cy: number, a1: number, a2: number }[] = []
  for (let i = 0; i <= STEPS; i++) {
    const t = tAtLength((i / STEPS) * total)
    const n = nibAt(t), s = shoulderAt(t)
    const dx = n.x - s.x, dy = n.y - s.y, dist = Math.hypot(dx, dy)
    const inner = Math.acos(Math.min(1, (dist * dist + L1 * L1 - L2 * L2) / (2 * dist * L1)))
    const a1 = Math.atan2(dy, dx) - inner
    const ex = s.x + L1 * Math.cos(a1), ey = s.y + L1 * Math.sin(a1)
    const a2 = Math.atan2(n.y - ey, n.x - ex)
    const prev = frames[i - 1]
    const u1 = unwrap(prev?.a1, deg(a1))
    const u2 = unwrap(prev && prev.a1 + prev.a2, deg(a2)) - u1     // the forearm turns relative to the upper arm
    frames.push({ at: (i / STEPS) * DRAW_END, gx: s.x - SHOULDER0.x, cy: s.y - SHOULDER0.y, a1: u1, a2: u2 })
  }
  let path = ''
  for (let i = 0; i <= 360; i++) { const p = nibAt((i / 360) * Math.PI * 2); path += `${i ? 'L' : 'M'}${r2(p.x)} ${r2(p.y)}` }
  return { frames, path: path + 'Z' }
})()

const keyframes = (name: string, value: (f: (typeof KINEMATICS.frames)[number]) => string) => {
  const rows = KINEMATICS.frames.map(f => `${r2(f.at)}% { transform: ${value(f)}; }`)
  return `@keyframes ${name} { ${rows.join(' ')} 100% { transform: ${value(KINEMATICS.frames[0]!)}; } }`
}
const START = KINEMATICS.frames[0]!

// The construction the plot is built from: the hypotrochoid's envelope (a ± d), its slow circle and centre
const BLUEPRINT = `<g class="ea-blueprint">` +
  `<circle cx="${PLOT.cx}" cy="${PLOT.cy}" r="${PLOT.a + PLOT.d}" fill="none" stroke="#a49e93" stroke-width="0.6" stroke-dasharray="3 2.5"/>` +
  `<circle cx="${PLOT.cx}" cy="${PLOT.cy}" r="${PLOT.a}" fill="none" stroke="#b2aca1" stroke-width="0.55"/>` +
  `<circle cx="${PLOT.cx}" cy="${PLOT.cy}" r="${PLOT.a - PLOT.d}" fill="none" stroke="#a49e93" stroke-width="0.55" stroke-dasharray="2 2"/>` +
  `<line x1="${PLOT.cx - 96}" y1="${PLOT.cy}" x2="${PLOT.cx + 96}" y2="${PLOT.cy}" stroke="#c0bab0" stroke-width="0.5"/>` +
  `<line x1="${PLOT.cx}" y1="${PLOT.cy - 92}" x2="${PLOT.cx}" y2="${PLOT.cy + 92}" stroke="#c0bab0" stroke-width="0.5"/>` +
  // The one warm-amber line: the pen's own trace
  `<path d="${KINEMATICS.path}" fill="none" stroke="#dfae52" stroke-width="1.2" stroke-linejoin="round" pathLength="100" class="ea-trace"/>` +
  `<circle cx="${PLOT.cx}" cy="${PLOT.cy}" r="2.6" fill="#ffffff" stroke="#7c766b" stroke-width="0.7"/>` +
  `<text x="458" y="286" font-size="4.6" fill="#9a9489" text-anchor="end" letter-spacing="1.2" font-family="var(--font-mono, ui-monospace, monospace)">PLOT · X:${PLOT.cx} Y:${PLOT.cy} R:${PLOT.a + PLOT.d}.0</text>` +
  `<text x="458" y="110" font-size="4.6" fill="#9a9489" text-anchor="end" letter-spacing="1.2" font-family="var(--font-mono, ui-monospace, monospace)">DRAFT · II</text>` +
`</g>`

/** Open belt between two pulleys: the two outer tangents */
function belt(x1: number, y1: number, r1: number, x2: number, y2: number, r2_: number) {
  const th = Math.atan2(y2 - y1, x2 - x1)
  const b = Math.acos((r1 - r2_) / Math.hypot(x2 - x1, y2 - y1))
  return [th + b, th - b].map(a =>
    `<line x1="${r2(x1 + r1 * Math.cos(a))}" y1="${r2(y1 + r1 * Math.sin(a))}" x2="${r2(x2 + r2_ * Math.cos(a))}" y2="${r2(y2 + r2_ * Math.sin(a))}" stroke="#8d877c" stroke-width="1.1" stroke-linecap="round"/>`,
  ).join('')
}

const PLOTTER_BED = (() => {
  // Fine architectural drafting grid inside vellum sheet (122..468 × 98..296)
  let grid = ''
  for (let x = 140; x <= 452; x += 24) grid += `<line x1="${x}" y1="100" x2="${x}" y2="294" stroke="#e4dfd4" stroke-width="0.45"/>`
  for (let y = 118; y <= 280; y += 24) grid += `<line x1="124" y1="${y}" x2="466" y2="${y}" stroke="#e4dfd4" stroke-width="0.45"/>`

  // Precision millimeter scale ticks along top and bottom rails
  let railTicks = ''
  for (let i = 0; i <= 72; i++) {
    const x = 114 + i * 5
    const major = i % 10 === 0
    const mid = i % 5 === 0
    const h = major ? 6.5 : mid ? 4.2 : 2.4
    railTicks += `<line x1="${x}" y1="84" x2="${x}" y2="${r2(84 + h)}" stroke="${major ? '#7c766b' : '#b2aca1'}" stroke-width="${major ? 0.6 : 0.38}"/>`
    railTicks += `<line x1="${x}" y1="312" x2="${x}" y2="${r2(312 - h)}" stroke="${major ? '#7c766b' : '#b2aca1'}" stroke-width="${major ? 0.6 : 0.38}"/>`
    if (major && i > 0 && i < 70) {
      railTicks += `<text x="${x}" y="81.5" font-size="4.4" fill="#9a9489" text-anchor="middle" font-family="var(--font-mono, ui-monospace, monospace)">${String(i * 5).padStart(3, '0')}</text>`
    }
  }

  return `<g class="ea-bed">` +
    `<ellipse cx="320" cy="356" rx="236" ry="11" fill="#2d261c" opacity="0.1" filter="url(#${PFX}soft-blur)"/>` +

    // Machined porcelain flatbed plinth with double-bevel flange & corner leveling feet
    `<rect x="86" y="330" width="38" height="12" rx="2.5" fill="url(#${PFX}machined-h)" stroke="#888277" stroke-width="0.7"/>` +
    `<rect x="466" y="330" width="38" height="12" rx="2.5" fill="url(#${PFX}machined-h)" stroke="#888277" stroke-width="0.7"/>` +
    `<rect x="74" y="68" width="442" height="266" rx="10" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.85"/>` +
    `<rect x="77" y="71" width="436" height="260" rx="8" fill="none" stroke="#ffffff" stroke-width="0.85" opacity="0.9"/>` +
    `<rect x="82" y="76" width="426" height="250" rx="6" fill="url(#${PFX}porcelain-top)" stroke="#cbc5b9" stroke-width="0.55"/>` +

    // Signature architectural flange rivet rows along left & right side bulkheads
    rivetRow(80, 96, 80, 304, 11, PFX, 1.2) +
    rivetRow(510, 96, 510, 304, 11, PFX, 1.2) +
    bolt(88, 82, PFX, 2.2, 22) + bolt(502, 82, PFX, 2.2, -32) +
    bolt(88, 320, PFX, 2.2, -18) + bolt(502, 320, PFX, 2.2, 40) +

    // Top & bottom machined linear guide rails + timing belts
    `<rect x="102" y="74" width="386" height="14" rx="2.5" fill="url(#${PFX}machined)" stroke="#8a8479" stroke-width="0.65"/>` +
    `<rect x="102" y="308" width="386" height="14" rx="2.5" fill="url(#${PFX}machined)" stroke="#8a8479" stroke-width="0.65"/>` +
    `<line x1="108" y1="78.5" x2="482" y2="78.5" stroke="#a6a095" stroke-width="0.7" stroke-dasharray="2.5 1.8"/>` +
    `<line x1="108" y1="317.5" x2="482" y2="317.5" stroke="#a6a095" stroke-width="0.7" stroke-dasharray="2.5 1.8"/>` +
    railTicks +

    // Recessed vellum drafting platen + precision corner magnetic clamps
    `<rect x="114" y="94" width="362" height="208" rx="3" fill="url(#${PFX}recess)" stroke="#a39d92" stroke-width="0.65"/>` +
    `<rect x="120" y="98" width="350" height="200" rx="1.5" fill="url(#${PFX}paper-grad)" stroke="#bdb7ac" stroke-width="0.55"/>` +
    grid +
    // Magnetic porcelain paper clamps
    `<rect x="126" y="95" width="34" height="7" rx="1.5" fill="url(#${PFX}porcelain-v)" stroke="#857f74" stroke-width="0.6"/>` +
    `<rect x="430" y="95" width="34" height="7" rx="1.5" fill="url(#${PFX}porcelain-v)" stroke="#857f74" stroke-width="0.6"/>` +
    `<rect x="126" y="294" width="34" height="7" rx="1.5" fill="url(#${PFX}porcelain-v)" stroke="#857f74" stroke-width="0.6"/>` +
    `<rect x="430" y="294" width="34" height="7" rx="1.5" fill="url(#${PFX}porcelain-v)" stroke="#857f74" stroke-width="0.6"/>` +
    rivet(132, 98.5, PFX, 0.9) + rivet(154, 98.5, PFX, 0.9) +
    rivet(436, 98.5, PFX, 0.9) + rivet(458, 98.5, PFX, 0.9) +

    BLUEPRINT +
  `</g>`
})()

/* ============================================================
   Gliding Overhead Porcelain Gantry Bridge & Articulated Weight-Relieved Truss Arm
   ============================================================ */
const GANTRY_BRIDGE = (() => {
  return `<g class="ea-gantry">` +
    // Top & bottom rail carriage trucks
    `<rect x="292" y="65" width="38" height="24" rx="3" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.75"/>` +
    `<rect x="292" y="307" width="38" height="24" rx="3" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.75"/>` +
    rivet(298, 71, PFX, 1.1) + rivet(324, 71, PFX, 1.1) +
    rivet(298, 325, PFX, 1.1) + rivet(324, 325, PFX, 1.1) +

    // Twin vertical machined porcelain bridge spars with lightening slot
    `<rect x="301" y="88" width="20" height="220" rx="2" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.75"/>` +
    `<rect x="307.5" y="102" width="7" height="192" rx="3" fill="url(#${PFX}recess)" stroke="#a39d92" stroke-width="0.5"/>` +
    `<line x1="304" y1="94" x2="304" y2="302" stroke="#ffffff" stroke-width="0.7" opacity="0.85"/>` +

    // Y carriage riding the spar; the arm's shoulder bearing is bolted through it
    `<g class="ea-y-carriage">` +
      `<ellipse cx="314" cy="${SHOULDER0.y + 18}" rx="20" ry="5" fill="#2d261c" opacity="0.08" filter="url(#${PFX}soft-blur)"/>` +
      `<rect x="296" y="156" width="30" height="34" rx="3.5" fill="url(#${PFX}porcelain-v)" stroke="#787267" stroke-width="0.78"/>` +
      `<rect x="300" y="160" width="22" height="26" rx="2" fill="url(#${PFX}porcelain-top)" stroke="#bcb6ab" stroke-width="0.5"/>` +
      `<rect x="304" y="162.5" width="14" height="3" rx="1.2" fill="url(#${PFX}accent-amber)" opacity="0.85"/>` +
      // Upper arm about the shoulder; the forearm turns about the elbow inside it. Drawn straight out (angle 0), posed by keyframes
      `<g class="ea-link1" style="transform-box:view-box;transform-origin:${SHOULDER0.x}px ${SHOULDER0.y}px">` +
        `<g class="ea-link2" style="transform-box:view-box;transform-origin:${SHOULDER0.x + L1}px ${SHOULDER0.y}px">` +
          trussArm(SHOULDER0.x + L1, SHOULDER0.y, SHOULDER0.x + L1 + L2, SHOULDER0.y, 9.5, 7.5, 3, PFX) +
          // Pen holder: collar, spring clip and the nib on the paper
          `<circle cx="${SHOULDER0.x + L1 + L2}" cy="${SHOULDER0.y}" r="8" fill="url(#${PFX}porcelain-v)" stroke="#787267" stroke-width="0.75"/>` +
          `<circle cx="${SHOULDER0.x + L1 + L2}" cy="${SHOULDER0.y}" r="5" fill="url(#${PFX}recess)" stroke="#a39d92" stroke-width="0.5"/>` +
          `<circle cx="${SHOULDER0.x + L1 + L2}" cy="${SHOULDER0.y}" r="2" fill="#e6b655" stroke="#787267" stroke-width="0.5" class="ea-nib ea-nib-glow"/>` +
        `</g>` +
        trussArm(SHOULDER0.x, SHOULDER0.y, SHOULDER0.x + L1, SHOULDER0.y, 12, 9.5, 4, PFX) +
      `</g>` +
      bolt(SHOULDER0.x, SHOULDER0.y, PFX, 2.4, 30) +
    `</g>` +
  `</g>`
})()

/* ============================================================
   Right Side · Ribbed Porcelain Stepper Drive Motor & Belt Coupler (Factory-style)
   ============================================================ */
const STEPPER_DRIVE = (() => {
  const cx = 556, cy = 274
  return `<g class="ea-stepper">` +
    `<ellipse cx="554" cy="342" rx="34" ry="6" fill="#2d261c" opacity="0.1" filter="url(#${PFX}soft-blur)"/>` +
    // Drive belt: true outer tangents from the rail's end pulley to the motor pulley, so it wraps both
    belt(482, 315, 7, cx, cy, 13.5) +
    // Rail end pulley, seated in the bottom rail's end cap
    `<circle cx="482" cy="315" r="7" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.7"/>` +
    `<g class="ea-pulley-spin" style="transform-box:view-box;transform-origin:482px 315px">` +
      `<line x1="477.5" y1="315" x2="486.5" y2="315" stroke="#857f74" stroke-width="0.7"/>` +
      `<line x1="482" y1="310.5" x2="482" y2="319.5" stroke="#857f74" stroke-width="0.7"/>` +
    `</g>` +
    `<circle cx="482" cy="315" r="1.6" fill="#ffffff" stroke="#7c766b" stroke-width="0.5"/>` +
    // Motor base plate
    `<rect x="524" y="328" width="60" height="10" rx="2.5" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.75"/>` +
    bolt(530, 333, PFX, 1.5, 20) + bolt(578, 333, PFX, 1.5, -25) +
    // Ribbed motor housing with cooling fins
    `<rect x="530" y="286" width="48" height="42" rx="4" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.8"/>` +
    coolingFins(536, 294, 36, 26, 7, false) +
    // Top exposed spoked flywheel pulley
    `<circle cx="${cx}" cy="${cy}" r="18" fill="url(#${PFX}drum-outer)" stroke="#7c766b" stroke-width="0.8"/>` +
    `<g class="ea-motor-spin" style="transform-box:view-box;transform-origin:${cx}px ${cy}px">` +
      `<path d="${gearPath(cx, cy, 13.5, 11.2, 14)}" fill="url(#${PFX}machined)" stroke="#8a8479" stroke-width="0.55"/>` +
      `<circle cx="${cx}" cy="${cy}" r="7.5" fill="url(#${PFX}porcelain-top)" stroke="#9a9489" stroke-width="0.55"/>` +
      `<line x1="${cx - 6}" y1="${cy}" x2="${cx + 6}" y2="${cy}" stroke="#857f74" stroke-width="0.75"/>` +
      `<line x1="${cx}" y1="${cy - 6}" x2="${cx}" y2="${cy + 6}" stroke="#857f74" stroke-width="0.75"/>` +
    `</g>` +
    `<circle cx="${cx}" cy="${cy}" r="2.6" fill="#ffffff" stroke="#7c766b" stroke-width="0.6"/>` +
    // Small terminal junction box + single 2px warm amber status dot
    `<rect x="538" y="317" width="32" height="8" rx="1.5" fill="#fbf9f4" stroke="#9a9489" stroke-width="0.5"/>` +
    `<circle cx="543" cy="321" r="1.5" fill="#e5b34f" class="ea-nib-glow"/>` +
    `<text x="557" y="322.6" font-size="4.1" fill="#7c766b" text-anchor="middle" letter-spacing="0.8" font-family="var(--font-mono, ui-monospace, monospace)">DRV.02</text>` +
  `</g>`
})()

export function easelSvg() {
  return `<svg class="iso iso-easel" viewBox="0 0 640 400" role="img" aria-hidden="true">
    <defs>
      ${instrumentDefs(PFX, 640, 400)}
    </defs>
    ${dotGridBackdrop(PFX, 640, 400, 344)}
    ${PLOTTER_BED}
    ${STEPPER_DRIVE}
    ${GANTRY_BRIDGE}
  </svg>`
}

export const EASEL_CSS = ['--iso-tilt', '--iso-brush', '--iso-wet'].map(v => `@property ${v} { syntax: '<number>'; inherits: true; initial-value: 0; }`).join('\n') + `
.iso-easel { --iso-tilt: 0; --iso-brush: 0; --iso-wet: 0; transition: --iso-tilt 700ms cubic-bezier(.22, 1, .36, 1), --iso-brush 900ms cubic-bezier(.22, 1, .36, 1); }
.iso-host:hover .iso-easel { --iso-tilt: 1; }
.iso-host[data-open] .iso-easel { --iso-tilt: 1; --iso-brush: 1; --iso-wet: 1; }

${spinKeyframes('ea-spin')}
${keyframes('ea-gantry-plot', f => `translateX(${r2(f.gx)}px)`)}
${keyframes('ea-carriage-plot', f => `translateY(${r2(f.cy)}px)`)}
${keyframes('ea-link1-plot', f => `rotate(${r2(f.a1)}deg)`)}
${keyframes('ea-link2-plot', f => `rotate(${r2(f.a2)}deg)`)}
@keyframes ea-trace { 0% { stroke-dashoffset: 100; opacity: 1; } ${DRAW_END}% { stroke-dashoffset: 0; opacity: 1; } 90% { stroke-dashoffset: 0; opacity: 1; } 97% { stroke-dashoffset: 0; opacity: 0; } 100% { stroke-dashoffset: 100; opacity: 0; } }
@keyframes ea-glow { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }

/* One clock for the pen and its line: same duration, linear between solved keyframes. The rest pose is the loop's first frame, so reduced motion still shows the nib on the finished curve */
.iso-easel .ea-gantry { transform: translateX(${r2(START.gx)}px); animation: ea-gantry-plot 18s linear infinite; }
.iso-easel .ea-y-carriage { transform: translateY(${r2(START.cy)}px); animation: ea-carriage-plot 18s linear infinite; }
.iso-easel .ea-link1 { transform: rotate(${r2(START.a1)}deg); animation: ea-link1-plot 18s linear infinite; }
.iso-easel .ea-link2 { transform: rotate(${r2(START.a2)}deg); animation: ea-link2-plot 18s linear infinite; }
.iso-easel .ea-trace { stroke-dasharray: 100 100; stroke-dashoffset: 0; animation: ea-trace 18s linear infinite; }
.iso-easel .ea-motor-spin { animation: ea-spin 14s linear infinite; }
.iso-easel .ea-pulley-spin { animation: ea-spin 9s linear infinite; }
.iso-easel .ea-nib-glow { animation: ea-glow 2.8s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  .iso-easel, .iso-easel * { animation: none !important; transition-duration: 1ms !important; }
}
`
