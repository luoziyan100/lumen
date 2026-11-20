/**
 * [INPUT]: shared White-Porcelain CAD helpers in ./instrument.ts
 * [OUTPUT]: corkSvg(): orrery dish for concept mapping (640×400 monochrome white-porcelain CAD: vernier bezel and turning index ring,
 *           6 node medallions on one orbit with chords and a slack chord, hub gear carrying an amber sweep, sighting reader on the rim);
 *           CORK_CSS (sweep and node flashes on one 12s clock, hover/open sweep brightening, open chord tensioning, reduced-motion guard)
 * [POS]: object 6 of studio/objects/, shown in the Map placeholder view. Each node flashes when the sweep's leading edge reaches its
 *        angle (delay solved from the angle). Pure valid XML SVG with uniquely prefixed ids (`ck-`)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { bolt, dotGridBackdrop, gearPath, instrumentDefs, r2, rivet, spinKeyframes, trussArm, vernierRing } from './instrument.ts'

const PFX = 'ck-'

/* ============================================================
   The hub drives a sweep; the sweep wakes the nodes
   ------------------------------------------------------------
   Every node sits on one orbit. The hub gear carries the amber sweep round;
   each node's core flashes at the instant the sweep's leading edge reaches
   its angle (delay solved from that angle), so the light and the nodes keep
   one clock.
   ============================================================ */
const C = { x: 310, y: 202 }
const ORBIT = 94
const SWEEP = { from: -46, span: 40, period: 12 }              // degrees clockwise from 12 o'clock at rest; seconds per turn
const NODES = [
  { deg: 300, code: 'N.01' }, { deg: 32, code: 'N.02' }, { deg: 92, code: 'N.03' },
  { deg: 148, code: 'N.04' }, { deg: 212, code: 'N.05' }, { deg: 262, code: 'N.06' },
].map(n => {
  const a = ((n.deg - 90) * Math.PI) / 180
  return { ...n, x: r2(C.x + Math.cos(a) * ORBIT), y: r2(C.y + Math.sin(a) * ORBIT) }
})
const hitDelay = (deg: number) => {
  const t = ((((deg - SWEEP.from - SWEEP.span) % 360) + 360) % 360) / 360 * SWEEP.period
  return r2(t - SWEEP.period)
}

const ORRERY = (() => {
  const cx = C.x, cy = C.y

  // 4 cardinal degree numerals around outer vernier ring
  const numerals = [
    { deg: 0, label: '000' },
    { deg: 45, label: '045' },
    { deg: 90, label: '090' },
    { deg: 135, label: '135' },
    { deg: 180, label: '180' },
    { deg: 225, label: '225' },
    { deg: 270, label: '270' },
    { deg: 315, label: '315' },
  ].map(({ deg, label }) => {
    const a = (deg - 90) * (Math.PI / 180)
    const tx = r2(cx + Math.cos(a) * 141)
    const ty = r2(cy + Math.sin(a) * 141)
    return `<text x="${tx}" y="${ty}" font-size="5" fill="#8b857a" text-anchor="middle" dominant-baseline="central" transform="rotate(${deg} ${tx} ${ty})" font-family="var(--font-mono, ui-monospace, monospace)">${label}</text>`
  }).join('')

  // 16 outer flange perimeter rivets (like Roulette's multi-ring bezel!)
  const bezelRivets = Array.from({ length: 16 }, (_, i) => {
    const a = (i * 22.5) * (Math.PI / 180)
    return rivet(cx + Math.cos(a) * 155, cy + Math.sin(a) * 155, PFX, 1.35)
  }).join('')

  const nodeMarkup = NODES.map((n, i) =>
    `<g class="ck-node ck-node-${i}">` +
      `<circle cx="${n.x + 1.5}" cy="${n.y + 2}" r="13.5" fill="#2d261c" opacity="0.08"/>` +
      `<circle cx="${n.x}" cy="${n.y}" r="13.5" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.78"/>` +
      `<circle cx="${n.x}" cy="${n.y}" r="10.2" fill="url(#${PFX}porcelain-top)" stroke="#c7c1b6" stroke-width="0.5"/>` +
      `<circle cx="${n.x}" cy="${n.y}" r="9" fill="#f5d98e" class="ck-halo" style="animation-delay:${hitDelay(n.deg)}s"/>` +
      `<circle cx="${n.x}" cy="${n.y}" r="2.2" fill="#ffffff" stroke="#7c766b" stroke-width="0.6"/>` +
      `<circle cx="${n.x}" cy="${n.y}" r="2.2" fill="#e5b34f" class="ck-core" style="animation-delay:${hitDelay(n.deg)}s"/>` +
      `<text x="${n.x}" y="${r2(n.y + 7.5)}" font-size="3.9" fill="#8d877c" text-anchor="middle" letter-spacing="0.6" font-family="var(--font-mono, ui-monospace, monospace)">${n.code}</text>` +
    `</g>`,
  ).join('')
  const ring = NODES.map((n, i) => `${i ? 'L' : 'M'}${n.x} ${n.y}`).join(' ') + ' Z'
  const [n0, n1, , n3, n4] = NODES as [typeof NODES[0], typeof NODES[0], typeof NODES[0], typeof NODES[0], typeof NODES[0]]
  const mid = { x: r2((n0.x + n1.x) / 2), y: r2((n0.y + n1.y) / 2) }
  const sag = { x: r2(mid.x + (C.x - mid.x) * 0.35), y: r2(mid.y + (C.y - mid.y) * 0.35) }
  const rad = (d: number) => ((d - 90) * Math.PI) / 180
  const wedge = `M${cx} ${cy} L${r2(cx + 132 * Math.cos(rad(SWEEP.from)))} ${r2(cy + 132 * Math.sin(rad(SWEEP.from)))} A132 132 0 0 1 ${r2(cx + 132 * Math.cos(rad(SWEEP.from + SWEEP.span)))} ${r2(cy + 132 * Math.sin(rad(SWEEP.from + SWEEP.span)))} Z`
  const edge = `M${cx} ${cy} L${r2(cx + 132 * Math.cos(rad(SWEEP.from + SWEEP.span)))} ${r2(cy + 132 * Math.sin(rad(SWEEP.from + SWEEP.span)))}`

  return `<g class="ck-orrery">` +
    `<ellipse cx="${cx}" cy="364" rx="164" ry="11" fill="#2d261c" opacity="0.1" filter="url(#${PFX}soft-blur)"/>` +

    // Outer fixed sculpted porcelain astrolabe bezel (r=162)
    `<circle cx="${cx}" cy="${cy}" r="162" fill="url(#${PFX}drum-outer)" stroke="#7c766b" stroke-width="0.88"/>` +
    `<circle cx="${cx}" cy="${cy}" r="158.5" fill="none" stroke="#ffffff" stroke-width="0.85" opacity="0.85"/>` +
    `<circle cx="${cx}" cy="${cy}" r="149" fill="url(#${PFX}recess)" stroke="#a39d92" stroke-width="0.65"/>` +
    `<circle cx="${cx}" cy="${cy}" r="133" fill="url(#${PFX}dial-face)" stroke="#8e887d" stroke-width="0.7"/>` +
    bezelRivets +
    vernierRing(cx, cy, 148, 144.5, 141.5, 120, 5) +
    numerals +

    // Outer index ring turning slowly past the sighting reader
    `<g class="ck-ring-outer" style="transform-box:view-box;transform-origin:${cx}px ${cy}px">` +
      `<circle cx="${cx}" cy="${cy}" r="118" fill="none" stroke="#b9b3a8" stroke-width="0.65" stroke-dasharray="3 2.5"/>` +
      vernierRing(cx, cy, 132, 128, 124, 72, 6) +
    `</g>` +

    // Middle machined porcelain azimuth track ring (r=92)
    `<circle cx="${cx}" cy="${cy}" r="94" fill="none" stroke="#c8c2b7" stroke-width="0.7"/>` +
    `<circle cx="${cx}" cy="${cy}" r="66" fill="none" stroke="#d5cfc4" stroke-width="0.6" stroke-dasharray="2 3"/>` +
    // Subtle cross-axis engineering hairlines
    `<line x1="${cx - 130}" y1="${cy}" x2="${cx + 130}" y2="${cy}" stroke="#d8d2c6" stroke-width="0.5"/>` +
    `<line x1="${cx}" y1="${cy - 130}" x2="${cx}" y2="${cy + 130}" stroke="#d8d2c6" stroke-width="0.5"/>` +

    // The sweep, carried by the hub (drawn under the chords and nodes)
    `<g class="ck-hub-spin" style="transform-box:view-box;transform-origin:${cx}px ${cy}px">` +
      `<path d="${wedge}" fill="url(#${PFX}sweep)" class="ck-sweep"/>` +
      `<path d="${edge}" stroke="#dfae52" stroke-width="0.9" opacity="0.7"/>` +
    `</g>` +
    // Chords between the nodes
    `<path d="${ring}" fill="none" stroke="#9e988d" stroke-width="0.75"/>` +
    `<path d="M${n0.x} ${n0.y} L${n3.x} ${n3.y} M${n1.x} ${n1.y} L${n4.x} ${n4.y}" fill="none" stroke="#bdb7ac" stroke-width="0.65" stroke-dasharray="3 2"/>` +
    // Slack chord N.01–N.02 pulls taut on open
    `<g class="ck-slack-wrap" style="transform-box:view-box;transform-origin:${mid.x}px ${mid.y}px">` +
      `<path d="M${n0.x} ${n0.y} Q${sag.x} ${sag.y} ${n1.x} ${n1.y}" fill="none" stroke="#dfae52" stroke-width="1.15" stroke-linecap="round"/>` +
    `</g>` +

    // Central rotating precision gimbal spider hub (echoes Roulette's 4-spoke inner hub!)
    `<g class="ck-hub-spin" style="transform-box:view-box;transform-origin:${cx}px ${cy}px">` +
      `<path d="${gearPath(cx, cy, 34, 30.5, 24)}" fill="url(#${PFX}machined)" stroke="#888277" stroke-width="0.58"/>` +
      `<circle cx="${cx}" cy="${cy}" r="25" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.75"/>` +
      `<circle cx="${cx}" cy="${cy}" r="18" fill="url(#${PFX}porcelain-top)" stroke="#bcb6ab" stroke-width="0.55"/>` +
      `<line x1="${cx - 17}" y1="${cy}" x2="${cx + 17}" y2="${cy}" stroke="#8d877c" stroke-width="0.7"/>` +
      `<line x1="${cx}" y1="${cy - 17}" x2="${cx}" y2="${cy + 17}" stroke="#8d877c" stroke-width="0.7"/>` +
      rivet(cx - 12, cy - 12, PFX, 1.1) + rivet(cx + 12, cy - 12, PFX, 1.1) +
      rivet(cx - 12, cy + 12, PFX, 1.1) + rivet(cx + 12, cy + 12, PFX, 1.1) +
    `</g>` +
    `<circle cx="${cx}" cy="${cy}" r="7" fill="url(#${PFX}porcelain-rivet)" stroke="#7c766b" stroke-width="0.7"/>` +
    `<circle cx="${cx}" cy="${cy}" r="2.2" fill="#ffffff" stroke="#857f74" stroke-width="0.5"/>` +

    nodeMarkup +

    // Oblique right-side articulated sighting vernier arm + stepped optical reader pod (breaks circular symmetry!)
    `<g class="ck-sight-arm">` +
      // Bolted anchor turret at lower right (524, 306)
      `<rect x="496" y="328" width="56" height="10" rx="2.5" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.78"/>` +
      bolt(503, 333, PFX, 1.5, 18) + bolt(545, 333, PFX, 1.5, -24) +
      `<rect x="506" y="294" width="36" height="34" rx="4" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.78"/>` +
      `<text x="524" y="322" font-size="4.4" fill="#857f74" text-anchor="middle" letter-spacing="1.1" font-family="var(--font-mono, ui-monospace, monospace)">ORBIT · V</text>` +
      // Tapered weight-relieved porcelain truss arm reaching toward outer bezel
      trussArm(524, 304, 466, 206, 14, 9.5, 3, PFX) +
      // Stepped optical reticle reader head locked over rim
      `<rect x="448" y="196" width="28" height="20" rx="3" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.75"/>` +
      `<rect x="453" y="201" width="12" height="10" rx="1.5" fill="#faf8f3" stroke="#9e988d" stroke-width="0.5"/>` +
      `<line x1="459" y1="201" x2="459" y2="211" stroke="#e5b34f" stroke-width="0.9"/>` +
      rivet(470, 201, PFX, 1) + rivet(470, 211, PFX, 1) +
    `</g>` +
  `</g>`
})()

export function corkSvg() {
  return `<svg class="iso iso-cork" viewBox="0 0 640 400" role="img" aria-hidden="true">
    <defs>
      ${instrumentDefs(PFX, 640, 400)}
      <radialGradient id="${PFX}sweep" gradientUnits="userSpaceOnUse" cx="${C.x}" cy="${C.y}" r="132">
        <stop offset="20%" stop-color="#f7e2b2" stop-opacity="0.15"/><stop offset="100%" stop-color="#f7e2b2" stop-opacity="0.55"/>
      </radialGradient>
    </defs>
    ${dotGridBackdrop(PFX, 640, 400, 360)}
    ${ORRERY}
  </svg>`
}

export const CORK_CSS = `
${spinKeyframes('ck-spin')}
@keyframes ck-flash { 0% { opacity: 1; } 30%, 100% { opacity: 0; } }
@keyframes ck-halo { 0% { opacity: 0.55; } 30%, 100% { opacity: 0; } }

.iso-cork .ck-ring-outer { animation: ck-spin 48s linear infinite; }
.iso-cork .ck-hub-spin { animation: ck-spin ${SWEEP.period}s linear infinite; }
.iso-cork .ck-core { opacity: 0; animation: ck-flash ${SWEEP.period}s linear infinite; }
.iso-cork .ck-halo { opacity: 0; animation: ck-halo ${SWEEP.period}s linear infinite; }
.iso-cork .ck-sweep { opacity: 0.7; transition: opacity 0.5s ease; }

.iso-cork .ck-slack-wrap {
  transform: scaleY(1);
  transition: transform 0.72s cubic-bezier(.22, 1, .36, 1);
}

.iso-host:hover .iso-cork .ck-sweep { opacity: 1; }
.iso-host[data-open] .iso-cork .ck-sweep { opacity: 1; }
.iso-host[data-open] .iso-cork .ck-slack-wrap { transform: scaleY(0.08); }

@media (prefers-reduced-motion: reduce) {
  .iso-cork .ck-ring-outer,
  .iso-cork .ck-hub-spin,
  .iso-cork .ck-core,
  .iso-cork .ck-halo { animation: none; }
  .iso-cork .ck-sweep,
  .iso-cork .ck-slack-wrap { transition-duration: 1ms; }
}
`
