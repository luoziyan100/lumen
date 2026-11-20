/**
 * [INPUT]: shared White-Porcelain CAD helpers in ./instrument.ts
 * [OUTPUT]: lampSvg(): architectural optical bench SVG (640×400 monochrome white-porcelain CAD: graduated rail, bolted turret with a 2-link
 *           truss arm, a cable clipped along both arms into the head, ribbed shade hung on the head pivot, warm beam into a wireframe collector
 *           with rising motes, knurled micrometer slide); LAMP_CSS (off at rest; hover flips the base switch, the bulb flickers on, then beam, pool,
 *           collector core and motes appear; open brightens and nods the head; reduced-motion guard)
 * [POS]: object 7 of studio/objects/, shown in the Ideas placeholder view. The head pivot is the one fact: the shade's angle, its mouth, the
 *        beam's edges and the pool are solved from it and the collector's focus. Pure valid XML SVG with uniquely prefixed ids (`lm-`);
 *        light uses gradients only (no blur filter) so dark surfaces never band
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { bolt, coolingFins, dotGridBackdrop, instrumentDefs, r2, rivet, rivetRow, trussArm } from './instrument.ts'

const PFX = 'lm-'

/* ============================================================
   Head geometry: one pivot decides the shade, the beam and the pool
   ------------------------------------------------------------
   The upper arm ends in the head pivot H. The shade hangs on H and aims at the
   collector's focus, so its mouth, the beam's edges and the pool are all
   solved from H; nothing is placed by eye.
   ============================================================ */
const ELBOW = { x: 126, y: 168 }
const HEAD = { x: 258, y: 118 }
const FOCUS = { x: 384, y: 224 }                               // the collector's mouth centre
const MOUTH = 53, RIM = 42                                     // pivot → mouth centre; mouth half-width
const AIM = Math.atan2(FOCUS.y - HEAD.y, FOCUS.x - HEAD.x)
const SHADE_DEG = r2((AIM * 180) / Math.PI - 90)                // the shade is drawn mouth-down (+y); turn it onto the aim
const along = (d: number) => ({ x: HEAD.x + Math.cos(AIM) * d, y: HEAD.y + Math.sin(AIM) * d })
const RIM_A = { x: along(MOUTH).x + Math.sin(AIM) * RIM, y: along(MOUTH).y - Math.cos(AIM) * RIM }
// Cable offsets: left of the lower arm, above the upper arm
const SHOULDER = { x: 160, y: 272 }
const side = (a: { x: number, y: number }, b: { x: number, y: number }, d: number, t: number) => {
  const len = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len
  return { x: r2(a.x + (b.x - a.x) * t + nx * d), y: r2(a.y + (b.y - a.y) * t + ny * d) }
}
const LO = [0.12, 0.88].map(t => side(SHOULDER, ELBOW, -10, t))
const UP = [0.1, 0.94].map(t => side(ELBOW, HEAD, -8.5, t))
const CABLE = `M142 279 C140 274, ${LO[0]!.x - 1} ${LO[0]!.y + 5}, ${LO[0]!.x} ${LO[0]!.y} L${LO[1]!.x} ${LO[1]!.y} ` +
  `C${LO[1]!.x - 2} ${LO[1]!.y - 12}, ${UP[0]!.x - 6} ${UP[0]!.y - 4}, ${UP[0]!.x} ${UP[0]!.y} L${UP[1]!.x} ${UP[1]!.y} L${HEAD.x} ${HEAD.y}`
const clip = (p: { x: number, y: number }, deg: number) =>
  `<rect x="${r2(p.x - 3)}" y="${r2(p.y - 2)}" width="6" height="4" rx="1" fill="url(#${PFX}machined)" stroke="#7c766b" stroke-width="0.5" transform="rotate(${deg} ${p.x} ${p.y})"/>`
const CLIPS = clip(side(SHOULDER, ELBOW, -10, 0.5), 72) + clip(side(ELBOW, HEAD, -8.5, 0.36), -21) + clip(side(ELBOW, HEAD, -8.5, 0.7), -21)
const RIM_B = { x: along(MOUTH).x - Math.sin(AIM) * RIM, y: along(MOUTH).y + Math.cos(AIM) * RIM }

const OPTICAL_BENCH = (() => {
  // Fine millimeter graduation ticks along the dovetail optical rail (96..544)
  let railTicks = ''
  for (let i = 0; i <= 56; i++) {
    const x = 96 + i * 8
    const major = i % 8 === 0
    railTicks += `<line x1="${x}" y1="326" x2="${x}" y2="${major ? 334 : 330.5}" stroke="${major ? '#7c766b' : '#b2aca1'}" stroke-width="${major ? 0.6 : 0.38}"/>`
  }

  // Wireframe-ribbed parabolic collector funnel (inspired by Roulette's collector cone!) centered at cx=384, mouth y=224
  const fx = 384, fy = 224
  const funnelMeridians = [-38, -26, -14, 0, 14, 26, 38].map((dx) =>
    `<path d="M${r2(fx + dx)} ${fy} Q${r2(fx + dx * 0.48)} ${fy + 28} ${r2(fx + dx * 0.24)} ${fy + 52}" fill="none" stroke="#9e988d" stroke-width="0.55"/>`,
  ).join('')

  return `<g class="lm-bench">` +
    `<ellipse cx="320" cy="356" rx="236" ry="10" fill="#2d261c" opacity="0.1" filter="url(#${PFX}soft-blur)"/>` +

    // Pure radial-gradient luminous light cone + soft pool (no blur filters!)
    `<g class="lm-light-pool">` +
      `<ellipse cx="${fx}" cy="226" rx="74" ry="20" fill="url(#${PFX}pool-grad)"/>` +
      `<path d="M${r2(RIM_A.x)} ${r2(RIM_A.y)} L${fx + 46} ${fy} L${fx - 46} ${fy + 4} L${r2(RIM_B.x)} ${r2(RIM_B.y)} Z" fill="url(#${PFX}beam-grad)" opacity="0.8"/>` +
    `</g>` +

    // Heavy machined white-porcelain dovetail optical rail along base
    `<rect x="104" y="344" width="34" height="8" rx="2" fill="url(#${PFX}machined-h)" stroke="#857f74" stroke-width="0.7"/>` +
    `<rect x="502" y="344" width="34" height="8" rx="2" fill="url(#${PFX}machined-h)" stroke="#857f74" stroke-width="0.7"/>` +
    `<rect x="84" y="324" width="472" height="22" rx="4" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.85"/>` +
    `<line x1="90" y1="327.5" x2="550" y2="327.5" stroke="#ffffff" stroke-width="0.85" opacity="0.88"/>` +
    railTicks +
    rivetRow(96, 341, 544, 341, 15, PFX, 1.05) +
    // Rail code plate
    `<rect x="284" y="330" width="72" height="10.5" rx="1.8" fill="#ffffff" stroke="#a6a095" stroke-width="0.55"/>` +
    `<text x="320" y="337" font-size="5" fill="#6f695e" text-anchor="middle" letter-spacing="1.7" font-family="var(--font-mono, ui-monospace, monospace)">SPARK · VI</text>` +

    // Center-right Wireframe Parabolic Collector Funnel on twin vertical stanchions
    `<g class="lm-collector">` +
      // Sliding bench saddle
      `<rect x="${fx - 34}" y="308" width="68" height="17" rx="3" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.78"/>` +
      bolt(fx - 26, 316.5, PFX, 1.5, 22) + bolt(fx + 26, 316.5, PFX, 1.5, -24) +
      // Twin slender porcelain stanchion columns supporting the funnel throat
      `<rect x="${fx - 13}" y="274" width="5" height="34" rx="1" fill="url(#${PFX}porcelain-h)" stroke="#857f74" stroke-width="0.65"/>` +
      `<rect x="${fx + 8}" y="274" width="5" height="34" rx="1" fill="url(#${PFX}porcelain-h)" stroke="#857f74" stroke-width="0.65"/>` +
      // Ribbed throat collar
      `<rect x="${fx - 16}" y="268" width="32" height="14" rx="2.5" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.72"/>` +
      coolingFins(fx - 12, 271, 24, 8, 5, true) +
      // Parabolic collector body (outer shell + concentric latitude rings + meridian ribs)
      `<path d="M${fx - 46} ${fy} Q${fx - 24} ${fy + 30} ${fx - 13} ${fy + 46} L${fx + 13} ${fy + 46} Q${fx + 24} ${fy + 30} ${fx + 46} ${fy} Z" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.8"/>` +
      funnelMeridians +
      `<ellipse cx="${fx}" cy="${fy + 20}" rx="31" ry="6.5" fill="none" stroke="#a6a095" stroke-width="0.55"/>` +
      `<ellipse cx="${fx}" cy="${fy + 36}" rx="18" ry="4" fill="none" stroke="#a6a095" stroke-width="0.55"/>` +
      // Top flared porcelain aperture lip
      `<ellipse cx="${fx}" cy="${fy}" rx="47" ry="12.5" fill="url(#${PFX}drum-outer)" stroke="#7c766b" stroke-width="0.82"/>` +
      `<ellipse cx="${fx}" cy="${fy}" rx="41" ry="9.8" fill="url(#${PFX}recess)" stroke="#a39d92" stroke-width="0.6"/>` +
      `<ellipse cx="${fx}" cy="${fy + 1.5}" rx="33" ry="6.8" fill="url(#${PFX}dial-face)" stroke="#bbb5aa" stroke-width="0.5"/>` +
      // Floating luminous focal core inside funnel
      `<circle cx="${fx}" cy="${fy + 1}" r="3.4" fill="#f3d285" stroke="#9e8247" stroke-width="0.55" class="lm-lit lm-core-pulse"/>` +
    `</g>` +

    // Gentle rising pale-amber spark motes lifted from collector dish into light cone
    `<g class="lm-motes">` +
      `<circle cx="${fx - 14}" cy="212" r="1.7" fill="#e8ba5e" class="lm-mote lm-m1"/>` +
      `<circle cx="${fx + 6}" cy="204" r="1.4" fill="#89bbd2" class="lm-mote lm-m2"/>` +
      `<circle cx="${fx + 18}" cy="216" r="1.5" fill="#e8ba5e" class="lm-mote lm-m3"/>` +
      `<circle cx="${fx - 4}" cy="220" r="1.2" fill="#f5d98e" class="lm-mote lm-m4"/>` +
    `</g>` +

    // Right End · Precision Knurled Micrometer Focus Vernier & Sliding Lens Carrier
    `<g class="lm-micrometer">` +
      `<rect x="478" y="294" width="60" height="31" rx="3.5" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.78"/>` +
      `<rect x="484" y="300" width="28" height="18" rx="2" fill="url(#${PFX}recess)" stroke="#a39d92" stroke-width="0.55"/>` +
      `<text x="498" y="311.5" font-size="5.2" fill="#6f695e" text-anchor="middle" letter-spacing="0.8" font-family="var(--font-mono, ui-monospace, monospace)">2.7K</text>` +
      // Knurled micrometer barrel extending right
      `<rect x="538" y="301" width="24" height="16" rx="2.5" fill="url(#${PFX}machined)" stroke="#7c766b" stroke-width="0.72"/>` +
      coolingFins(542, 303, 16, 12, 7, true) +
      // Slender vertical optical lens ring mounted above carriage
      `<rect x="494" y="274" width="8" height="20" rx="1.5" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.65"/>` +
      `<ellipse cx="498" cy="252" rx="12" ry="22" fill="url(#${PFX}glass)" stroke="#7c766b" stroke-width="0.8"/>` +
      `<ellipse cx="498" cy="252" rx="8.5" ry="17" fill="none" stroke="#ffffff" stroke-width="0.85" opacity="0.85"/>` +
      `<circle cx="525" cy="306" r="1.8" fill="#e5b34f" class="lm-core-pulse"/>` +
    `</g>` +

    // Left Bolted Lamp Turret + 2-Link Weight-Relieved Porcelain Truss Arm & Ribbed Reflector Shade
    `<g class="lm-turret">` +
      `<rect x="122" y="296" width="76" height="29" rx="4" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.82"/>` +
      `<path d="M132 296 L140 278 L180 278 L188 296 Z" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.78"/>` +
      bolt(130, 310, PFX, 1.8, 18) + bolt(190, 310, PFX, 1.8, -22) +
      // Monochrome machined toggle rocker switch
      `<rect x="172" y="272" width="11" height="6" rx="1.5" fill="url(#${PFX}machined)" stroke="#7c766b" stroke-width="0.65"/>` +
      `<path d="M175 272 L177.5 266 L181.5 267 L179.5 272 Z" fill="#857f74" class="lm-rocker" style="transform-box:view-box;transform-origin:177.5px 272px"/>` +
      // Lower truss arm from shoulder (160, 272) to elbow (126, 168)
      trussArm(160, 272, 126, 168, 15, 12, 4, PFX) +
      // Tension linkage bar parallel to lower truss
      `<line x1="170" y1="274" x2="137" y2="170" stroke="#9e988d" stroke-width="0.85" stroke-dasharray="2 1.5"/>` +

      // Power cable: from the base's left shoulder, clipped along the lower arm's right edge, over the elbow, along the upper arm's top edge into the head
      `<path d="${CABLE}" fill="none" stroke="#857f74" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${CABLE}" fill="none" stroke="#f7f5ef" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round"/>` +
      CLIPS +

      // Counterweight tail behind the elbow
      `<line x1="${ELBOW.x}" y1="${ELBOW.y}" x2="96" y2="184" stroke="#7c766b" stroke-width="4.2" stroke-linecap="round"/>` +
      `<line x1="${ELBOW.x}" y1="${ELBOW.y}" x2="96" y2="184" stroke="#f7f5ef" stroke-width="2.4" stroke-linecap="round"/>` +
      `<circle cx="92" cy="186" r="10" fill="url(#${PFX}drum-outer)" stroke="#7c766b" stroke-width="0.8"/>` +
      `<circle cx="92" cy="186" r="6" fill="url(#${PFX}machined)" stroke="#9a9489" stroke-width="0.55"/>` +

      // Shade on the head pivot. Its neck is centred on H; it nods about H on hover
      `<g class="lm-head" style="transform-box:view-box;transform-origin:${HEAD.x}px ${HEAD.y}px">` +
        `<g transform="translate(${HEAD.x} ${HEAD.y}) rotate(${SHADE_DEG}) translate(0 11)">` +
          `<rect x="-13" y="-18" width="26" height="14" rx="3" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.78"/>` +
          coolingFins(-9, -15, 18, 8, 5, true) +
          `<path d="M-14 -4 C-18 8, -36 26, -42 42 L42 42 C36 26, 18 8, 14 -4 Z" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.85"/>` +
          `<path d="M10 -2 C13 9, 29 24, 34 37" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.82"/>` +
          `<line x1="-25" y1="18" x2="25" y2="18" stroke="#c8c2b7" stroke-width="0.55"/>` +
          `<ellipse cx="0" cy="42" rx="42" ry="11" fill="#ede9e0" stroke="#7c766b" stroke-width="0.85"/>` +
          `<ellipse cx="0" cy="42" rx="37" ry="8.5" fill="#f7e2b2" class="lm-shade-inner"/>` +
          `<circle cx="0" cy="39" r="9" fill="#faf8f3" stroke="#8d877c" stroke-width="0.7"/>` +
          `<circle cx="0" cy="39" r="9" fill="#fbe4a6" class="lm-bulb-warm"/>` +
          `<circle cx="-2" cy="37" r="3" fill="#ffffff" class="lm-bulb-warm"/>` +
        `</g>` +
      `</g>` +
      // Upper arm runs into the pivot; the knuckle and its bolt sit on top of the clevis
      trussArm(ELBOW.x, ELBOW.y, HEAD.x, HEAD.y, 12, 9.5, 4, PFX) +
      `<circle cx="${HEAD.x}" cy="${HEAD.y}" r="7.2" fill="url(#${PFX}drum-outer)" stroke="#7c766b" stroke-width="0.78"/>` +
      bolt(HEAD.x, HEAD.y, PFX, 2.6, -20) +
    `</g>` +
  `</g>`
})()

export function lampSvg() {
  return `<svg class="iso iso-lamp" viewBox="0 0 640 400" role="img" aria-hidden="true">
    <defs>
      ${instrumentDefs(PFX, 640, 400)}
      <radialGradient id="${PFX}pool-grad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#f7dc96" stop-opacity="0.65"/>
        <stop offset="38%" stop-color="#f7dc96" stop-opacity="0.3"/>
        <stop offset="72%" stop-color="#f7dc96" stop-opacity="0.09"/>
        <stop offset="100%" stop-color="#f7dc96" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="${PFX}beam-grad" gradientUnits="userSpaceOnUse" x1="${r2(along(MOUTH).x)}" y1="${r2(along(MOUTH).y)}" x2="${FOCUS.x}" y2="${FOCUS.y}">
        <stop offset="0%" stop-color="#f9e6b2" stop-opacity="0.5"/>
        <stop offset="70%" stop-color="#f7dc96" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="#f7dc96" stop-opacity="0.04"/>
      </linearGradient>
    </defs>
    ${dotGridBackdrop(PFX, 640, 400, 354)}
    ${OPTICAL_BENCH}
  </svg>`
}

/*
 * The lamp is off until someone comes near. Hover throws the base switch, the bulb flickers on, and only then
 * do the beam, the pool, the collector's core and the motes appear: light first, its effects after.
 */
export const LAMP_CSS = `
@keyframes lm-core { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
@keyframes lm-mote-rise { 0% { transform: translateY(8px); opacity: 0; } 25% { opacity: 0.85; } 80% { opacity: 0.4; } 100% { transform: translateY(-48px); opacity: 0; } }
@keyframes lm-flicker { 0% { opacity: 0; } 12% { opacity: 1; } 22% { opacity: 0.1; } 34% { opacity: 0.85; } 44% { opacity: 0.25; } }

.iso-lamp .lm-mote { animation: lm-mote-rise 6.4s ease-out infinite; }
.iso-lamp .lm-m2 { animation-delay: 1.6s; }
.iso-lamp .lm-m3 { animation-delay: 3.1s; }
.iso-lamp .lm-m4 { animation-delay: 4.7s; }
.iso-lamp .lm-core-pulse { animation: lm-core 3.6s ease-in-out infinite; }

/* Off */
.iso-lamp .lm-rocker { transform: scaleX(1); transition: transform 0.12s ease; }
.iso-lamp .lm-shade-inner,
.iso-lamp .lm-bulb-warm { opacity: 0; transition: opacity 0.3s ease; }
.iso-lamp .lm-light-pool,
.iso-lamp .lm-motes { opacity: 0; transition: opacity 0.4s ease; }
.iso-lamp .lm-lit { animation: none; opacity: 0.25; transition: opacity 0.4s ease; }
.iso-lamp .lm-head { transform: rotate(0deg); transition: transform 0.72s cubic-bezier(.22, 1, .36, 1); }

/* On: switch, flicker, then the light and what it reaches */
.iso-host:hover .iso-lamp .lm-rocker,
.iso-host[data-open] .iso-lamp .lm-rocker { transform: scaleX(-1); }
.iso-host:hover .iso-lamp .lm-shade-inner,
.iso-host:hover .iso-lamp .lm-bulb-warm { opacity: 0.85; animation: lm-flicker 0.7s linear 0.12s 1 backwards; }
.iso-host:hover .iso-lamp .lm-light-pool { opacity: 0.74; transition-delay: 0.6s; }
.iso-host:hover .iso-lamp .lm-motes { opacity: 1; transition-delay: 0.8s; }
.iso-host:hover .iso-lamp .lm-lit { opacity: 1; animation: lm-core 3.6s ease-in-out 0.8s infinite; }
.iso-host:hover .iso-lamp .lm-head { transform: rotate(-2deg); }

.iso-host[data-open] .iso-lamp .lm-shade-inner,
.iso-host[data-open] .iso-lamp .lm-bulb-warm { opacity: 1; }
.iso-host[data-open] .iso-lamp .lm-light-pool { opacity: 1; }
.iso-host[data-open] .iso-lamp .lm-motes { opacity: 1; }
.iso-host[data-open] .iso-lamp .lm-lit { opacity: 1; }
.iso-host[data-open] .iso-lamp .lm-head { transform: rotate(-3deg); }

@media (prefers-reduced-motion: reduce) {
  .iso-lamp .lm-core-pulse,
  .iso-lamp .lm-mote,
  .iso-host:hover .iso-lamp .lm-lit,
  .iso-host:hover .iso-lamp .lm-shade-inner,
  .iso-host:hover .iso-lamp .lm-bulb-warm { animation: none; }
  .iso-lamp .lm-rocker,
  .iso-lamp .lm-head,
  .iso-lamp .lm-light-pool,
  .iso-lamp .lm-motes,
  .iso-lamp .lm-lit,
  .iso-lamp .lm-shade-inner,
  .iso-lamp .lm-bulb-warm { transition-duration: 1ms; transition-delay: 0s; }
}
`
