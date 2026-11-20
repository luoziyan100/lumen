/**
 * [INPUT]: shared White-Porcelain CAD helpers in ./instrument.ts
 * [OUTPUT]: pressSvg(): white-porcelain nipping press coupled to a ribbed motor and cutaway turbine (640×400 monochrome CAD: bolted
 *           crown with the screw's nut, screw + T-handle + platen travelling as one piece, folio stack whose top face carries the pressed leaf
 *           and seal, shaft-coupled motor and turbine); PRESS_CSS (--iso-lift travel, handle half-turn per state change, turbine/needle idle,
 *           reduced-motion guard)
 * [POS]: object 5 of studio/objects/, shown in the empty Takeaways view. At rest the plate presses the folio; hover lifts it a crack,
 *        open lifts it clear to show the leaf. Pure valid XML SVG with uniquely prefixed ids (`pr-`)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { bolt, coolingFins, dotGridBackdrop, gearPath, instrumentDefs, r2, rivet, rivetRow, spinKeyframes, vernierRing } from './instrument.ts'

const PFX = 'pr-'

/* ============================================================
   Left & Center · Monolithic Bolted Porcelain Arch Specimen Press (SEAL · III)
   ============================================================ */
const PRESS_FRAME = (() => {
  const threads = (x: number, y0: number, y1: number, w: number) => {
    let s = ''
    for (let y = y0; y <= y1; y += 4.2) s += `<line x1="${x}" y1="${r2(y)}" x2="${r2(x + w)}" y2="${r2(y + 1.5)}" stroke="#a49e93" stroke-width="0.5"/>`
    return s
  }

  return `<g class="pr-frame">` +
    `<ellipse cx="228" cy="356" rx="154" ry="11" fill="#2d261c" opacity="0.11" filter="url(#${PFX}soft-blur)"/>` +

    // Twin precision-ground steel/porcelain vertical guide columns + acme thread ticks
    `<rect x="128" y="114" width="12" height="202" rx="2" fill="url(#${PFX}machined-h)" stroke="#7f796e" stroke-width="0.72"/>` +
    threads(129, 122, 298, 10) +
    `<rect x="316" y="114" width="12" height="202" rx="2" fill="url(#${PFX}machined-h)" stroke="#7f796e" stroke-width="0.72"/>` +
    threads(317, 122, 298, 10) +

    // Screw, handle and platen are one piece: they travel together through the crown's nut
    `<g class="pr-travel">` +
      `<rect x="221" y="44" width="14" height="172" rx="2" fill="url(#${PFX}machined-h)" stroke="#7f796e" stroke-width="0.75"/>` +
      threads(222, 52, 206, 12) +
      `<g class="pr-handle" style="transform-box:view-box;transform-origin:228px 41px">` +
        `<rect x="158" y="36" width="140" height="10" rx="5" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.8"/>` +
        `<line x1="164" y1="39" x2="292" y2="39" stroke="#ffffff" stroke-width="0.8" opacity="0.85"/>` +
        `<circle cx="158" cy="41" r="7.5" fill="url(#${PFX}porcelain-rivet)" stroke="#7c766b" stroke-width="0.75"/>` +
        `<circle cx="298" cy="41" r="7.5" fill="url(#${PFX}porcelain-rivet)" stroke="#7c766b" stroke-width="0.75"/>` +
      `</g>` +
      `<rect x="213" y="30" width="30" height="22" rx="4" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.8"/>` +
      rivet(228, 41, PFX, 2) +
    `</g>` +

    // Sculpted overhead cast-porcelain arch bridge with weight-relief recess & rivet rows
    `<path d="M108 106 Q108 92 122 92 L334 92 Q348 92 348 106 L348 128 L108 128 Z" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.85"/>` +
    `<path d="M114 96 L342 96" stroke="#ffffff" stroke-width="0.9" opacity="0.85"/>` +
    `<rect x="148" y="102" width="160" height="16" rx="3" fill="url(#${PFX}recess)" stroke="#b3ada2" stroke-width="0.55"/>` +
    rivetRow(118, 121, 142, 121, 3, PFX, 1.15) +
    rivetRow(314, 121, 338, 121, 3, PFX, 1.15) +
    bolt(118, 104, PFX, 2.1, 24) + bolt(338, 104, PFX, 2.1, -28) +
    // The nut the screw turns in: the screw shows through the crown's window
    `<rect x="219" y="100" width="18" height="20" rx="1.5" fill="url(#${PFX}machined-h)" stroke="#7f796e" stroke-width="0.7"/>` +
    threads(220, 103, 116, 16) +

    // Heavy stepped architectural bedplate + recessed instrument window (0042)
    `<rect x="116" y="346" width="32" height="8" rx="2" fill="url(#${PFX}machined-h)" stroke="#857f74" stroke-width="0.7"/>` +
    `<rect x="308" y="346" width="32" height="8" rx="2" fill="url(#${PFX}machined-h)" stroke="#857f74" stroke-width="0.7"/>` +
    `<rect x="98" y="308" width="260" height="38" rx="6" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.85"/>` +
    `<line x1="104" y1="311.5" x2="352" y2="311.5" stroke="#ffffff" stroke-width="0.9" opacity="0.88"/>` +
    `<rect x="108" y="317" width="240" height="22" rx="3" fill="url(#${PFX}porcelain-top)" stroke="#cbc5b9" stroke-width="0.55"/>` +
    rivetRow(114, 342, 342, 342, 13, PFX, 1.05) +
    bolt(108, 328, PFX, 2.1, 18) + bolt(348, 328, PFX, 2.1, -30) +
    // Recessed monochrome mechanical counter on left of bedplate
    `<rect x="122" y="322" width="44" height="12" rx="2" fill="url(#${PFX}recess)" stroke="#9a9489" stroke-width="0.55"/>` +
    `<text x="144" y="330" font-size="6.4" fill="#6b655c" text-anchor="middle" letter-spacing="1.6" font-family="var(--font-mono, ui-monospace, monospace)">0042</text>` +
    // Center engraved code plate
    `<rect x="192" y="322" width="72" height="12" rx="2" fill="#ffffff" stroke="#a6a095" stroke-width="0.55"/>` +
    `<text x="228" y="329.8" font-size="5.6" fill="#6d675d" text-anchor="middle" letter-spacing="1.8" font-family="var(--font-mono, ui-monospace, monospace)">SEAL · III</text>` +
    // Tiny functional warm-amber status bar on right of bedplate (3% accent)
    `<rect x="292" y="325.5" width="22" height="4.5" rx="1.5" fill="url(#${PFX}recess)" stroke="#a39d92" stroke-width="0.45"/>` +
    `<rect x="294" y="326.8" width="12" height="2" rx="0.8" fill="#e5b34f" class="pr-glow"/>` +

    // Folio stack seen slightly from above: its top face carries the pressed leaf and the seal, under the plate at rest
    `<g class="pr-specimen">` +
      `<path d="M156 272 L300 272 L306 286 L150 286 Z" fill="url(#${PFX}paper-grad)" stroke="#8f897e" stroke-width="0.7" stroke-linejoin="round"/>` +
      `<rect x="150" y="286" width="156" height="22" rx="1.5" fill="url(#${PFX}paper-grad)" stroke="#8f897e" stroke-width="0.72"/>` +
      `<line x1="153" y1="292" x2="303" y2="292" stroke="#ded9ce" stroke-width="0.6"/>` +
      `<line x1="153" y1="297" x2="303" y2="297" stroke="#d5cfc3" stroke-width="0.6"/>` +
      `<line x1="153" y1="302" x2="303" y2="302" stroke="#ded9ce" stroke-width="0.6"/>` +
      // The leaf, pressed flat: its outline foreshortened onto the top face
      `<g class="pr-leaf">` +
        `<path d="M182 281 C200 271, 240 271, 258 278 C240 283, 202 284, 182 281 Z" fill="#f3f1eb" stroke="#7d776c" stroke-width="0.7"/>` +
        `<path d="M182 281 Q220 276 256 278" fill="none" stroke="#857f74" stroke-width="0.55"/>` +
        `<path d="M200 279 L208 274.5 M216 278.5 L225 274 M232 278.5 L241 275 M206 280.5 L214 282 M224 280 L232 281.8" fill="none" stroke="#9e988d" stroke-width="0.45"/>` +
      `</g>` +
      `<ellipse cx="282" cy="279" rx="10" ry="4" fill="#f5d98e" opacity="0.3" class="pr-glow"/>` +
      `<ellipse cx="282" cy="279" rx="6.5" ry="2.6" fill="url(#${PFX}accent-amber)" stroke="#9a7e46" stroke-width="0.6"/>` +
      `<ellipse cx="282" cy="279" rx="3.8" ry="1.5" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.85"/>` +
    `</g>` +

    // Movable machined porcelain platen + twin guide bushings (lifts smoothly on hover/click)
    `<g class="pr-travel">` +
      `<rect x="116" y="214" width="224" height="24" rx="4.5" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.8"/>` +
      `<line x1="122" y1="217.5" x2="334" y2="217.5" stroke="#ffffff" stroke-width="0.85" opacity="0.88"/>` +
      `<rect x="122" y="210" width="24" height="32" rx="2.5" fill="url(#${PFX}machined)" stroke="#7c766b" stroke-width="0.72"/>` +
      `<rect x="310" y="210" width="24" height="32" rx="2.5" fill="url(#${PFX}machined)" stroke="#7c766b" stroke-width="0.72"/>` +
      rivet(134, 218, PFX, 1.3) + rivet(134, 234, PFX, 1.3) +
      rivet(322, 218, PFX, 1.3) + rivet(322, 234, PFX, 1.3) +
      // Pressing plate as wide as the folio; the screw's swivel foot bolts it to the platen
      `<rect x="146" y="238" width="164" height="9" rx="1.5" fill="url(#${PFX}machined)" stroke="#7c766b" stroke-width="0.72"/>` +
      `<line x1="150" y1="240" x2="306" y2="240" stroke="#ffffff" stroke-width="0.6" opacity="0.8"/>` +
      `<rect x="216" y="208" width="24" height="8" rx="2" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.7"/>` +
    `</g>` +
  `</g>`
})()

/* ============================================================
   Right Side · Ribbed Electric-Porcelain Drive Motor & Cutaway Rotary Turbine (Factory-inspired)
   ============================================================ */
const RIGHT_TURBINE = (() => {
  const cx = 508, cy = 286
  return `<g class="pr-turbine">` +
    `<ellipse cx="478" cy="355" rx="92" ry="8" fill="#2d261c" opacity="0.1" filter="url(#${PFX}soft-blur)"/>` +

    // Shared heavy bolted machine skid tying motor + turbine together
    `<rect x="382" y="340" width="186" height="10" rx="2.5" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.8"/>` +
    rivetRow(390, 345, 560, 345, 9, PFX, 1.1) +

    // Exposed horizontal drive shaft & flange couplings connecting Press bed -> Ribbed Motor -> Turbine
    `<rect x="358" y="318" width="38" height="10" rx="1.5" fill="url(#${PFX}machined)" stroke="#7c766b" stroke-width="0.7"/>` +
    `<rect x="370" y="314" width="6" height="18" rx="1" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.65"/>` +
    `<rect x="378" y="314" width="6" height="18" rx="1" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.65"/>` +

    // Compact ribbed porcelain motor housing
    `<rect x="394" y="276" width="56" height="64" rx="4" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.8"/>` +
    `<rect x="398" y="280" width="48" height="56" rx="2.5" fill="url(#${PFX}porcelain-top)" stroke="#cbc5b9" stroke-width="0.5"/>` +
    coolingFins(402, 286, 40, 34, 8, false) +
    // Motor coupling shaft into cutaway turbine
    `<rect x="450" y="282" width="22" height="10" rx="1" fill="url(#${PFX}machined)" stroke="#7c766b" stroke-width="0.7"/>` +

    // Cutaway rotary compressor turbine housing (inspired by Factory's right-side turbine!)
    `<rect x="492" y="324" width="32" height="16" rx="2" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.75"/>` +
    // Top vertical discharge manifold pipe with flange collars & micro-gauge
    `<path d="M508 242 V204 Q508 194 518 194 H544 V252" fill="none" stroke="#7c766b" stroke-width="5.2" stroke-linecap="round"/>` +
    `<path d="M508 242 V204 Q508 194 518 194 H544 V252" fill="none" stroke="#f7f5ef" stroke-width="3.4" stroke-linecap="round"/>` +
    `<rect x="502" y="228" width="12" height="4.5" rx="1" fill="url(#${PFX}machined)" stroke="#7c766b" stroke-width="0.6"/>` +
    `<rect x="538" y="220" width="12" height="4.5" rx="1" fill="url(#${PFX}machined)" stroke="#7c766b" stroke-width="0.6"/>` +
    // Circular turbine outer flange ring with 12 perimeter bolts
    `<circle cx="${cx}" cy="${cy}" r="46" fill="url(#${PFX}drum-outer)" stroke="#7c766b" stroke-width="0.85"/>` +
    `<circle cx="${cx}" cy="${cy}" r="38" fill="url(#${PFX}recess)" stroke="#9a9489" stroke-width="0.65"/>` +
    vernierRing(cx, cy, 44, 41, 40, 24, 2) +
    Array.from({ length: 12 }, (_, i) => {
      const a = (i * 30) * (Math.PI / 180)
      return rivet(cx + Math.cos(a) * 41.5, cy + Math.sin(a) * 41.5, PFX, 1.2)
    }).join('') +
    // Monotonic rotating 8-blade impeller rotor inside cutaway chamber
    `<g class="pr-rotor-spin" style="transform-box:view-box;transform-origin:${cx}px ${cy}px">` +
      `<circle cx="${cx}" cy="${cy}" r="33" fill="url(#${PFX}dial-face)" stroke="#b3ada2" stroke-width="0.55"/>` +
      `<path d="${gearPath(cx, cy, 29, 25, 18)}" fill="url(#${PFX}machined)" stroke="#888277" stroke-width="0.6"/>` +
      Array.from({ length: 6 }, (_, i) => {
        const a = (i * 60) * (Math.PI / 180)
        return `<path d="M${cx} ${cy} Q${r2(cx + Math.cos(a + 0.35) * 18)} ${r2(cy + Math.sin(a + 0.35) * 18)} ${r2(cx + Math.cos(a) * 26)} ${r2(cy + Math.sin(a) * 26)}" fill="none" stroke="#7f796e" stroke-width="1.35" stroke-linecap="round"/>`
      }).join('') +
      `<circle cx="${cx}" cy="${cy}" r="11" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.7"/>` +
    `</g>` +
    `<circle cx="${cx}" cy="${cy}" r="4.5" fill="url(#${PFX}porcelain-rivet)" stroke="#7c766b" stroke-width="0.65"/>` +
    // Small top pressure dial on manifold
    `<circle cx="526" cy="194" r="10" fill="url(#${PFX}dial-face)" stroke="#7c766b" stroke-width="0.7"/>` +
    `<line x1="526" y1="194" x2="531" y2="189" stroke="#7c766b" stroke-width="0.9" stroke-linecap="round" class="pr-mini-needle" style="transform-box:view-box;transform-origin:526px 194px"/>` +
    `<circle cx="526" cy="194" r="1.4" fill="#7c766b"/>` +
  `</g>`
})()

export function pressSvg() {
  return `<svg class="iso iso-press" viewBox="0 0 640 400" role="img" aria-hidden="true">
    <defs>
      ${instrumentDefs(PFX, 640, 400)}
    </defs>
    ${dotGridBackdrop(PFX, 640, 400, 354)}
    ${RIGHT_TURBINE}
    ${PRESS_FRAME}
  </svg>`
}

export const PRESS_CSS = ['--iso-spin', '--iso-lift'].map(v => `@property ${v} { syntax: '<number>'; inherits: true; initial-value: 0; }`).join('\n') + `
.iso-press { --iso-spin: 0; --iso-lift: 0; transition: --iso-spin 700ms cubic-bezier(.22, 1, .36, 1), --iso-lift 900ms cubic-bezier(.22, 1, .36, 1); }
.iso-host:hover .iso-press { --iso-spin: 1; --iso-lift: 0.3; }
.iso-host[data-open] .iso-press { --iso-spin: 1; --iso-lift: 1; }

.iso-press .pr-travel { transform: translateY(calc(39px - var(--iso-lift) * 62px)); }
/* The handle turns while the screw travels: a half-turn read as the bar's foreshortening. Each state has its own keyframes so the turn replays on every change */
@keyframes pr-turn-a { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(-1); } }
@keyframes pr-turn-b { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(-1); } }
@keyframes pr-turn-c { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(-1); } }
.iso-press .pr-handle { animation: pr-turn-a 0.9s cubic-bezier(.45, 0, .55, 1) 1; }
.iso-host:hover .iso-press .pr-handle { animation-name: pr-turn-b; }
.iso-host[data-open] .iso-press .pr-handle { animation-name: pr-turn-c; }

${spinKeyframes('pr-spin')}
@keyframes pr-needle { 0%, 100% { transform: rotate(-28deg); } 50% { transform: rotate(22deg); } }
@keyframes pr-glow { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }

.iso-press .pr-rotor-spin { animation: pr-spin 20s linear infinite; }
.iso-press .pr-mini-needle { animation: pr-needle 6.8s ease-in-out infinite; }
.iso-press .pr-glow { animation: pr-glow 3.4s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  .iso-press, .iso-press * { animation: none !important; transition-duration: 1ms !important; }
}
`
