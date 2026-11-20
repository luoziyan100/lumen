/**
 * [INPUT]: the XML/text helpers in ./iso.ts; the paper's lines from the caller (paperLines wraps a material title)
 * [OUTPUT]: typewriterSvg({ lines }): precision optical reading & archival typewriter desk SVG (rotating graduated vernier dial,
 *           machined porcelain-and-brass chassis with riveted nameplate, 4-digit line odometer, live analog tension gauge,
 *           articulated optical magnifier arm with glowing glass lens, knurled platen & archival reading sheet showing up to 3
 *           escaped title lines + blinking cursor, exposed typebar fan & spinning ribbon spools, 3-tier sculpted mechanical keybank,
 *           and coupled glass amber/celadon alembic reservoir with swaying fluid menisci and animated capillary pulses);
 *           paperLines(title); PAPER; TYPEWRITER_CSS (ambient living motion, hover focus, click open sequence, .is-typing loop, reduced-motion guard)
 * [POS]: object 3 of studio/objects/, shown in the empty Reading view. All user text is escaped through iso.ts text() and clipped to the sheet;
 *        the SVG stays pure valid XML for DOMParser/tests and drives all motion via CSS @property and GPU-friendly keyframes
 *        Ink follows the keys: the cipher lines write only under .is-typing and stand finished otherwise; the loupe rests below the title.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { escapeXml, text, textWidth, wrapText } from './iso.ts'

const r2 = (n: number) => Math.round(n * 100) / 100

/* ============================================================
   Paper geometry & wrapping · keeps the same ~15em line measure so long titles wrap cleanly to 3 lines ending in …
   ============================================================ */
const SHEET_X = 232, SHEET_Y = 74, SHEET_W = 196, SHEET_H = 112
const LINE_X = 22, LINE_YS = [34, 52, 70], FONT_SIZE = 10.2, CURSOR_GAP = 6
export const PAPER = { width: SHEET_W - LINE_X - 20, size: FONT_SIZE, lines: LINE_YS.length }
export const paperLines = (title: string) => wrapText(title, PAPER.width, PAPER.size, PAPER.lines)

/* ============================================================
   Micro-detail builders · rivets, slotted screws, graduated rings, gear teeth, dot-grid drafting plate
   ============================================================ */
function screw(cx: number, cy: number, r = 2.6, angle = 32) {
  const rad = angle * Math.PI / 180
  const dx = r2(Math.cos(rad) * (r * 0.68)), dy = r2(Math.sin(rad) * (r * 0.68))
  return `<g class="tw-screw">` +
    `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="url(#tw-brass-rad)" stroke="#5b5144" stroke-width="0.65"/>` +
    `<circle cx="${r2(cx - r * 0.25)}" cy="${r2(cy - r * 0.25)}" r="${r2(r * 0.28)}" fill="#fff8e6" opacity="0.7"/>` +
    `<line x1="${r2(cx - dx)}" y1="${r2(cy - dy)}" x2="${r2(cx + dx)}" y2="${r2(cy + dy)}" stroke="#4a4035" stroke-width="0.65" stroke-linecap="round"/>` +
    `</g>`
}

function rivet(cx: number, cy: number, r = 1.65) {
  return `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="url(#tw-porcelain-rivet)" stroke="#8b8172" stroke-width="0.5"/>` +
    `<circle cx="${r2(cx - r * 0.3)}" cy="${r2(cy - r * 0.3)}" r="${r2(r * 0.32)}" fill="#ffffff" opacity="0.8"/>`
}

function gearPath(cx: number, cy: number, rOuter: number, rInner: number, teeth: number) {
  let d = ''
  const step = (Math.PI * 2) / teeth
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step
    const a1 = a0 + step * 0.18
    const a2 = a0 + step * 0.42
    const a3 = a0 + step * 0.60
    const p0 = [cx + Math.cos(a0) * rInner, cy + Math.sin(a0) * rInner]
    const p1 = [cx + Math.cos(a1) * rOuter, cy + Math.sin(a1) * rOuter]
    const p2 = [cx + Math.cos(a2) * rOuter, cy + Math.sin(a2) * rOuter]
    const p3 = [cx + Math.cos(a3) * rInner, cy + Math.sin(a3) * rInner]
    d += `${i === 0 ? 'M' : 'L'}${r2(p0[0]!)} ${r2(p0[1]!)}L${r2(p1[0]!)} ${r2(p1[1]!)}L${r2(p2[0]!)} ${r2(p2[1]!)}L${r2(p3[0]!)} ${r2(p3[1]!)}`
  }
  return d + 'Z'
}

/* ============================================================
   Assembly A (Left) · Precision Graduated Vernier Index Wheel (OPT.01)
   ============================================================ */
const DIAL_CX = 104, DIAL_CY = 228
const DIAL_ASSEMBLY = (() => {
  // Subtle concentric tick ring + numerals that slowly rotate in ambient idle
  let ticks = ''
  for (let i = 0; i < 72; i++) {
    const deg = i * 5
    const rad = (deg - 90) * Math.PI / 180
    const major = i % 6 === 0
    const med = i % 3 === 0
    const r0 = major ? 54 : med ? 58 : 61
    const r1 = 66
    ticks += `<line x1="${r2(DIAL_CX + Math.cos(rad) * r0)}" y1="${r2(DIAL_CY + Math.sin(rad) * r0)}" ` +
      `x2="${r2(DIAL_CX + Math.cos(rad) * r1)}" y2="${r2(DIAL_CY + Math.sin(rad) * r1)}" ` +
      `stroke="${major ? '#4e463c' : '#968c7c'}" stroke-width="${major ? 0.9 : 0.45}"/>`
    if (i % 12 === 0) {
      const label = String(deg).padStart(3, '0')
      const lx = r2(DIAL_CX + Math.cos(rad) * 45.5), ly = r2(DIAL_CY + Math.sin(rad) * 45.5)
      ticks += `<text x="${lx}" y="${ly}" font-size="5.6" fill="#6f6658" text-anchor="middle" dominant-baseline="central" ` +
        `font-family="var(--font-mono, ui-monospace, monospace)" transform="rotate(${deg} ${lx} ${ly})">${label}</text>`
    }
  }

  let bezelRivets = ''
  for (let i = 0; i < 12; i++) {
    const rad = (i * 30 + 15) * Math.PI / 180
    bezelRivets += rivet(DIAL_CX + Math.cos(rad) * 74, DIAL_CY + Math.sin(rad) * 74, 1.45)
  }

  let spokes = ''
  for (let i = 0; i < 4; i++) {
    const rad = (i * 90 + 45) * Math.PI / 180
    spokes += `<line x1="${r2(DIAL_CX + Math.cos(rad) * 10)}" y1="${r2(DIAL_CY + Math.sin(rad) * 10)}" ` +
      `x2="${r2(DIAL_CX + Math.cos(rad) * 29)}" y2="${r2(DIAL_CY + Math.sin(rad) * 29)}" stroke="#6e6456" stroke-width="2.6" stroke-linecap="round"/>` +
      `<line x1="${r2(DIAL_CX + Math.cos(rad) * 10)}" y1="${r2(DIAL_CY + Math.sin(rad) * 10)}" ` +
      `x2="${r2(DIAL_CX + Math.cos(rad) * 29)}" y2="${r2(DIAL_CY + Math.sin(rad) * 29)}" stroke="#f3ede1" stroke-width="1.2" stroke-linecap="round"/>`
  }

  // Stand legs anchoring dial drum to the drafting desk
  const stand = `<g class="tw-dial-stand">` +
    `<path d="M74 282 L64 342 L144 342 L134 282 Z" fill="url(#tw-porcelain-v)" stroke="#5c5346" stroke-width="0.95" stroke-linejoin="round"/>` +
    `<path d="M84 294 L78 334 L130 334 L124 294 Z" fill="url(#tw-recess)" stroke="#8b8172" stroke-width="0.65" stroke-linejoin="round"/>` +
    `<rect x="54" y="340" width="100" height="10" rx="3" fill="url(#tw-porcelain-h)" stroke="#524a3e" stroke-width="0.95"/>` +
    `<rect x="58" y="343" width="92" height="2" rx="1" fill="#ffffff" opacity="0.65"/>` +
    screw(64, 345, 2.0, 20) + screw(144, 345, 2.0, -35) +
    `<rect x="88" y="314" width="32" height="11" rx="2" fill="#fbf7ee" stroke="#7d7364" stroke-width="0.65"/>` +
    `<text x="104" y="321.5" font-size="5.6" fill="#5e5548" text-anchor="middle" letter-spacing="1.1" font-family="var(--font-mono, ui-monospace, monospace)">OPT.01</text>` +
    `</g>`

  return `<g class="tw-dial-unit">` +
    `<ellipse cx="104" cy="353" rx="60" ry="9" fill="#2d261c" opacity="0.12" filter="url(#tw-soft-blur)"/>` +
    stand +
    // Outer porcelain machined housing
    `<circle cx="${DIAL_CX}" cy="${DIAL_CY}" r="80" fill="url(#tw-drum-outer)" stroke="#524a3e" stroke-width="1.1"/>` +
    `<circle cx="${DIAL_CX}" cy="${DIAL_CY}" r="78.5" fill="none" stroke="#ffffff" stroke-width="0.8" opacity="0.7"/>` +
    bezelRivets +
    `<circle cx="${DIAL_CX}" cy="${DIAL_CY}" r="69" fill="url(#tw-recess)" stroke="#7a7061" stroke-width="0.85"/>` +
    // Rotating graduated ring · strictly monotonic clockwise rotation (never reverses or snaps on hover/open)
    `<g class="tw-dial-rotor" style="transform-box:view-box;transform-origin:${DIAL_CX}px ${DIAL_CY}px">` +
      `<circle cx="${DIAL_CX}" cy="${DIAL_CY}" r="66.5" fill="url(#tw-dial-face)" stroke="#8c8273" stroke-width="0.6"/>` +
      ticks +
      // Highlighted reading sector wedge (soft warm amber tint like Westworld active arc)
      `<path d="M${DIAL_CX} ${DIAL_CY} L${r2(DIAL_CX + 66 * Math.cos(-0.45))} ${r2(DIAL_CY + 66 * Math.sin(-0.45))} A66 66 0 0 1 ${r2(DIAL_CX + 66 * Math.cos(0.32))} ${r2(DIAL_CY + 66 * Math.sin(0.32))} Z" fill="#e6b85c" opacity="0.16"/>` +
      `<circle cx="${DIAL_CX}" cy="${DIAL_CY}" r="36" fill="url(#tw-porcelain-v)" stroke="#6e6456" stroke-width="0.8"/>` +
      // Inner brass gear
      `<path d="${gearPath(DIAL_CX, DIAL_CY, 31.5, 27.5, 20)}" fill="url(#tw-brass-h)" stroke="#5c4c2f" stroke-width="0.65"/>` +
      `<circle cx="${DIAL_CX}" cy="${DIAL_CY}" r="24" fill="url(#tw-recess)" stroke="#6e6456" stroke-width="0.7"/>` +
      spokes +
    `</g>` +
    // Center brass jewel cap
    `<circle cx="${DIAL_CX}" cy="${DIAL_CY}" r="11.5" fill="url(#tw-brass-rad)" stroke="#4d412c" stroke-width="0.85"/>` +
    `<circle cx="${DIAL_CX}" cy="${DIAL_CY}" r="6.2" fill="#fbf7ee" stroke="#786a52" stroke-width="0.55"/>` +
    `<circle cx="${DIAL_CX}" cy="${DIAL_CY}" r="2.2" fill="#c98e32"/>` +
    // Fixed brass vernier index pointer at 3 o'clock (pointing toward the typewriter manifold)
    `<g class="tw-dial-index">` +
      `<path d="M167 224 L183 221 L187 228 L183 235 L167 232 Z" fill="url(#tw-brass-v)" stroke="#4f422b" stroke-width="0.8" stroke-linejoin="round"/>` +
      `<polygon points="163,228 171,224.8 171,231.2" fill="#d4892a" stroke="#4f422b" stroke-width="0.55"/>` +
      rivet(179, 228, 1.5) +
    `</g>` +
  `</g>`
})()

/* ============================================================
   Coupling Tubes · Left Dial → Typewriter & Typewriter → Right Alembic (mechanical causality!)
   ============================================================ */
const LEFT_PIPES = (() => {
  const pAmber = 'M184 223 C202 223, 200 244, 218 244'
  const pBlue = 'M182 234 C198 234, 198 262, 218 262'
  return `<g class="tw-pipes-left">` +
    // Tube casings
    `<path d="${pAmber}" fill="none" stroke="#5b5245" stroke-width="5.6" stroke-linecap="round"/>` +
    `<path d="${pAmber}" fill="none" stroke="#f2ece0" stroke-width="3.8" stroke-linecap="round"/>` +
    `<path d="${pAmber}" fill="none" stroke="#e4b255" stroke-width="1.8" stroke-linecap="round" opacity="0.85"/>` +
    `<path d="${pAmber}" fill="none" stroke="#fff6db" stroke-width="1.5" stroke-linecap="round" class="tw-pulse tw-pulse-amber"/>` +
    `<path d="${pBlue}" fill="none" stroke="#5b5245" stroke-width="5.2" stroke-linecap="round"/>` +
    `<path d="${pBlue}" fill="none" stroke="#eef2f4" stroke-width="3.4" stroke-linecap="round"/>` +
    `<path d="${pBlue}" fill="none" stroke="#5f9cb8" stroke-width="1.7" stroke-linecap="round" opacity="0.85"/>` +
    `<path d="${pBlue}" fill="none" stroke="#d9f2ff" stroke-width="1.4" stroke-linecap="round" class="tw-pulse tw-pulse-blue"/>` +
    // Flanged brass couplings
    `<rect x="213" y="239" width="7" height="10" rx="1.5" fill="url(#tw-brass-v)" stroke="#4f422b" stroke-width="0.7"/>` +
    `<rect x="213" y="257" width="7" height="10" rx="1.5" fill="url(#tw-brass-v)" stroke="#4f422b" stroke-width="0.7"/>` +
  `</g>`
})()

const RIGHT_PIPES = (() => {
  const pTop = 'M442 234 C466 234, 468 206, 502 206'
  const pBot = 'M442 278 C468 278, 470 298, 505 298'
  return `<g class="tw-pipes-right">` +
    `<path d="${pTop}" fill="none" stroke="#5b5245" stroke-width="5.6" stroke-linecap="round"/>` +
    `<path d="${pTop}" fill="none" stroke="#f5f0e4" stroke-width="3.8" stroke-linecap="round"/>` +
    `<path d="${pTop}" fill="none" stroke="#e6b65a" stroke-width="1.8" stroke-linecap="round" opacity="0.88"/>` +
    `<path d="${pTop}" fill="none" stroke="#fff7df" stroke-width="1.5" stroke-linecap="round" class="tw-pulse tw-pulse-amber-r"/>` +
    `<path d="${pBot}" fill="none" stroke="#5b5245" stroke-width="5.6" stroke-linecap="round"/>` +
    `<path d="${pBot}" fill="none" stroke="#eef3f5" stroke-width="3.8" stroke-linecap="round"/>` +
    `<path d="${pBot}" fill="none" stroke="#5a9ab8" stroke-width="1.9" stroke-linecap="round" opacity="0.9"/>` +
    `<path d="${pBot}" fill="none" stroke="#dcf4ff" stroke-width="1.5" stroke-linecap="round" class="tw-pulse tw-pulse-blue-r"/>` +
    // Chassis-side brass flanged unions
    `<rect x="440" y="229" width="7" height="10" rx="1.5" fill="url(#tw-brass-v)" stroke="#4f422b" stroke-width="0.7"/>` +
    `<rect x="440" y="273" width="7" height="10" rx="1.5" fill="url(#tw-brass-v)" stroke="#4f422b" stroke-width="0.7"/>` +
    // Vessel-side brass inlet ports (sealed cleanly into both glass chambers)
    `<rect x="498" y="201.5" width="7" height="9" rx="1.5" fill="url(#tw-brass-v)" stroke="#4f422b" stroke-width="0.7"/>` +
    `<rect x="500" y="293.5" width="8" height="9" rx="1.5" fill="url(#tw-brass-v)" stroke="#4f422b" stroke-width="0.7"/>` +
    // Inline pressure valve wheel on lower pipe
    `<g transform="translate(468, 288)">` +
      `<circle cx="0" cy="0" r="6.5" fill="url(#tw-porcelain-v)" stroke="#5b5245" stroke-width="0.75"/>` +
      `<circle cx="0" cy="0" r="4.2" fill="none" stroke="#8a7e6e" stroke-width="0.5"/>` +
      `<line x1="-4.5" y1="0" x2="4.5" y2="0" stroke="#5b5245" stroke-width="0.7"/>` +
      `<line x1="0" y1="-4.5" x2="0" y2="4.5" stroke="#5b5245" stroke-width="0.7"/>` +
      `<circle cx="0" cy="0" r="1.6" fill="#c9933c"/>` +
    `</g>` +
  `</g>`
})()

/* ============================================================
   Assembly C (Right) · Twin-Chamber Amber & Celadon Glass Alembic Reservoir + Condenser Column
   ============================================================ */
const ALEMBIC_ASSEMBLY = (() => {
  const cx = 532
  // Graduated ML ticks on conical lower flask
  let mlTicks = ''
  for (let i = 0; i < 5; i++) {
    const y = 266 + i * 11
    mlTicks += `<line x1="${cx - 12}" y1="${y}" x2="${cx - 4}" y2="${y}" stroke="#7f8e96" stroke-width="0.65"/>`
    if (i % 2 === 0) {
      mlTicks += `<text x="${cx - 15}" y="${y + 2}" font-size="4.8" fill="#8a98a0" text-anchor="end" font-family="var(--font-mono, ui-monospace, monospace)">${(5 - i) * 10}</text>`
    }
  }

  // Condenser cooling fins on the right tower
  const fins = [0, 1, 2, 3, 4].map(i =>
    `<rect x="567" y="${192 + i * 7}" width="18" height="2.6" rx="1" fill="url(#tw-porcelain-h)" stroke="#685f52" stroke-width="0.55"/>`,
  ).join('')

  // Vapor bridge tube looping from top of amber sphere to the condenser column (closed-loop causality!)
  const vaporLoop = `<path d="M532 171 L532 158 Q532 152 538 152 L570 152 Q576 152 576 158 L576 174" fill="none" stroke="#5b5245" stroke-width="4.2" stroke-linecap="round"/>` +
    `<path d="M532 171 L532 158 Q532 152 538 152 L570 152 Q576 152 576 158 L576 174" fill="none" stroke="#f4eee2" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M532 171 L532 158 Q532 152 538 152 L570 152 Q576 152 576 158 L576 174" fill="none" stroke="#ebb854" stroke-width="1.2" stroke-linecap="round" class="tw-pulse tw-pulse-amber"/>`

  return `<g class="tw-alembic">` +
    `<ellipse cx="${cx}" cy="353" rx="54" ry="8.5" fill="#2d261c" opacity="0.12" filter="url(#tw-soft-blur)"/>` +
    vaporLoop +
    // Porcelain base pedestal with rivets & engraved plaque
    `<rect x="488" y="336" width="96" height="14" rx="4" fill="url(#tw-porcelain-h)" stroke="#524a3e" stroke-width="1"/>` +
    `<rect x="493" y="339" width="86" height="2.4" rx="1.2" fill="#ffffff" opacity="0.7"/>` +
    `<rect x="498" y="324" width="68" height="13" rx="2.5" fill="url(#tw-porcelain-v)" stroke="#5c5346" stroke-width="0.9"/>` +
    screw(496, 343, 1.9, 15) + screw(576, 343, 1.9, -25) +
    rivet(506, 330.5, 1.3) + rivet(558, 330.5, 1.3) +
    `<text x="${cx}" y="332.5" font-size="5.3" fill="#6b6255" text-anchor="middle" letter-spacing="1.2" font-family="var(--font-mono, ui-monospace, monospace)">INK·RES</text>` +
    // Condenser column with cooling fins, brass collars, sight slot & relief cap
    `<rect x="570" y="176" width="12" height="160" rx="3" fill="url(#tw-porcelain-h)" stroke="#5c5346" stroke-width="0.85"/>` +
    `<line x1="573.5" y1="180" x2="573.5" y2="332" stroke="#ffffff" stroke-width="1.2" opacity="0.65"/>` +
    fins +
    `<rect x="574" y="244" width="4" height="38" rx="2" fill="#e6eef2" stroke="#5c5346" stroke-width="0.5"/>` +
    `<g clip-path="url(#tw-condenser-clip)">` +
      `<rect x="573.5" y="254" width="5" height="44" fill="url(#tw-celadon-liq)" class="tw-level-condenser"/>` +
    `</g>` +
    `<rect x="568" y="232" width="16" height="5" rx="1.2" fill="url(#tw-brass-h)" stroke="#544730" stroke-width="0.65"/>` +
    `<rect x="568" y="294" width="16" height="5" rx="1.2" fill="url(#tw-brass-h)" stroke="#544730" stroke-width="0.65"/>` +
    `<rect x="568" y="172" width="16" height="5.5" rx="1.5" fill="url(#tw-brass-h)" stroke="#544730" stroke-width="0.65"/>` +
    // Clamp bracket holding upper sphere to column
    `<rect x="556" y="203" width="16" height="6" rx="1.5" fill="url(#tw-brass-v)" stroke="#544730" stroke-width="0.65"/>` +
    // Lower conical Erlenmeyer flask (Celadon-blue optical ink with dynamic rising/falling volume)
    `<g>` +
      `<path d="M521 240 L543 240 L543 256 L567 316 Q569 324 560 324 L504 324 Q495 324 497 316 L521 256 Z" fill="url(#tw-glass)" stroke="#867e70" stroke-width="1.05" stroke-linejoin="round"/>` +
      `<path d="M522 241 L542 241 L542 256 L565.5 315.5 Q567.2 322.5 559.5 322.5 L504.5 322.5 Q496.8 322.5 498.5 315.5 L522 256 Z" fill="none" stroke="#ffffff" stroke-width="0.65" opacity="0.35"/>` +
      `<g clip-path="url(#tw-flask-clip)">` +
        `<g class="tw-level-blue">` +
          `<g class="tw-wave-blue">` +
            `<path d="M470 292 Q495 288 520 292 T570 292 T620 292 L620 364 L470 364 Z" fill="url(#tw-celadon-liq)"/>` +
            `<path d="M470 292 Q495 288 520 292 T570 292 T620 292" fill="none" stroke="#d9f3ff" stroke-width="1.35" opacity="0.88"/>` +
          `</g>` +
        `</g>` +
        `<circle cx="523" cy="316" r="1.4" fill="#e6f8ff" class="tw-bubble tw-b1"/>` +
        `<circle cx="539" cy="319" r="1.1" fill="#e6f8ff" class="tw-bubble tw-b2"/>` +
        `<circle cx="531" cy="314" r="1.6" fill="#e6f8ff" class="tw-bubble tw-b3"/>` +
      `</g>` +
      `<path d="M523 260 L504 314" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" opacity="0.65"/>` +
      `<path d="M541 260 L558 310" fill="none" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" opacity="0.4"/>` +
      mlTicks +
      `<rect x="518" y="236" width="28" height="8" rx="2" fill="url(#tw-brass-h)" stroke="#544730" stroke-width="0.75"/>` +
      rivet(523, 240, 1.1) + rivet(541, 240, 1.1) +
    `</g>` +
    // Upper spherical amber distillation chamber (dynamic volume opposite phase to lower flask!)
    `<g>` +
      `<circle cx="${cx}" cy="206" r="29" fill="url(#tw-glass)" stroke="#867e70" stroke-width="1.05"/>` +
      `<circle cx="${cx}" cy="206" r="27.8" fill="none" stroke="#ffffff" stroke-width="0.65" opacity="0.35"/>` +
      `<g clip-path="url(#tw-sphere-clip)">` +
        `<g class="tw-level-amber">` +
          `<g class="tw-wave-amber">` +
            `<path d="M480 209 Q502 205.5 524 209 T568 209 T612 209 L612 264 L480 264 Z" fill="url(#tw-amber-liq)"/>` +
            `<path d="M480 209 Q502 205.5 524 209 T568 209 T612 209" fill="none" stroke="#fff6d6" stroke-width="1.35" opacity="0.9"/>` +
          `</g>` +
        `</g>` +
        `<circle cx="526" cy="224" r="1.2" fill="#fff7db" class="tw-bubble tw-b2"/>` +
        `<circle cx="538" cy="227" r="1.5" fill="#fff7db" class="tw-bubble tw-b1"/>` +
      `</g>` +
      `<path d="M512 191 A22 22 0 0 1 527 183" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.82"/>` +
      `<circle cx="${cx}" cy="206" r="32.5" fill="none" stroke="#988e7f" stroke-width="0.75" stroke-dasharray="3 2.5"/>` +
      `<rect x="524" y="171" width="16" height="6" rx="1.5" fill="url(#tw-brass-h)" stroke="#544730" stroke-width="0.7"/>` +
    `</g>` +
  `</g>`
})()

/* ============================================================
   Assembly B (Center) · Precision Porcelain & Brass Reading Desk / Typewriter (LUMEN · M-IV)
   ============================================================ */
const TYPEBAR_FAN = (() => {
  const cx = 330, cy = 226
  let s = `<path d="M266 226 A64 38 0 0 1 394 226 Z" fill="url(#tw-well-grad)" stroke="#685e50" stroke-width="0.9"/>`
  for (let i = 1; i < 18; i++) {
    const a = Math.PI * (0.07 + 0.86 * (i / 18))
    const x1 = r2(cx - Math.cos(a) * 14), y1 = r2(cy - Math.sin(a) * 10)
    const x2 = r2(cx - Math.cos(a) * 58), y2 = r2(cy - Math.sin(a) * 34)
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#83796a" stroke-width="0.7" stroke-linecap="round"/>`
  }
  // Central brass type guide / ribbon vibrator
  s += `<path d="M316 226 L321 206 L339 206 L344 226 Z" fill="url(#tw-brass-v)" stroke="#4f422b" stroke-width="0.8"/>`
  s += `<rect x="326" y="209" width="8" height="11" rx="1.5" fill="#2f2a24"/>`
  // Subtle strike spark (visible during .is-typing!)
  s += `<g class="tw-strike-spark">` +
    `<circle cx="330" cy="204" r="5" fill="#f5c969" opacity="0.45"/>` +
    `<line x1="330" y1="195" x2="330" y2="201" stroke="#e8a938" stroke-width="1.2" stroke-linecap="round"/>` +
    `<line x1="322" y1="199" x2="326" y2="203" stroke="#e8a938" stroke-width="1.1" stroke-linecap="round"/>` +
    `<line x1="338" y1="199" x2="334" y2="203" stroke="#e8a938" stroke-width="1.1" stroke-linecap="round"/>` +
  `</g>`
  return s
})()

function ribbonSpool(cx: number, cy: number, cls: string) {
  const holes = [0, 1, 2].map(k => {
    const a = k * (Math.PI * 2 / 3) - Math.PI / 6
    return `<circle cx="${r2(cx + Math.cos(a) * 6.5)}" cy="${r2(cy + Math.sin(a) * 6.5)}" r="2.2" fill="#3b362e" stroke="#6c5d41" stroke-width="0.5"/>`
  }).join('')
  return `<g class="tw-spool">` +
    `<circle cx="${cx}" cy="${cy}" r="14.5" fill="url(#tw-recess)" stroke="#706658" stroke-width="0.8"/>` +
    `<g class="${cls}" style="transform-origin:${cx}px ${cy}px">` +
      `<circle cx="${cx}" cy="${cy}" r="12.2" fill="url(#tw-brass-rad)" stroke="#4f422b" stroke-width="0.8"/>` +
      `<circle cx="${cx}" cy="${cy}" r="9.6" fill="none" stroke="#856f42" stroke-width="0.45"/>` +
      holes +
      `<circle cx="${cx}" cy="${cy}" r="2.4" fill="#fbf7ee" stroke="#4f422b" stroke-width="0.6"/>` +
    `</g>` +
  `</g>`
}

const KEYBOARD = (() => {
  const rows = [
    { y: 254, keys: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I'] },
    { y: 277, keys: ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K'] },
    { y: 300, keys: ['Z', 'X', 'C', 'V', 'B', 'N', 'M'] },
  ]
  const pressMap: Record<string, string> = {
    E: '--iso-k1', F: '--iso-k2', T: '--iso-k3', S: '--iso-k4', R: '--iso-k2', H: '--iso-k1',
  }
  let s = `<rect x="234" y="236" width="192" height="101" rx="8" fill="url(#tw-keywell)" stroke="#7a7060" stroke-width="0.9"/>` +
    `<rect x="237" y="239" width="186" height="95" rx="6" fill="none" stroke="#ffffff" stroke-width="0.6" opacity="0.45"/>`

  for (const row of rows) {
    const spacing = 22
    const x0 = 330 - ((row.keys.length - 1) * spacing) / 2
    row.keys.forEach((ch, idx) => {
      const cx = x0 + idx * spacing
      const cy = row.y
      const v = pressMap[ch]
      const pressStyle = v ? ` style="transform:translateY(calc(var(${v}) * 2.8px))"` : ''
      s += `<g class="tw-key">` +
        // Stem shadow
        `<ellipse cx="${cx}" cy="${cy + 3.2}" rx="8.6" ry="7.4" fill="#3a332a" opacity="0.24"/>` +
        `<g${pressStyle}>` +
          // Brass rim bezel
          `<circle cx="${cx}" cy="${cy}" r="8.6" fill="url(#tw-brass-v)" stroke="#4f4331" stroke-width="0.75"/>` +
          // Ivory keycap
          `<circle cx="${cx}" cy="${cy - 0.5}" r="6.8" fill="url(#tw-keycap)" stroke="#9a8f7e" stroke-width="0.45"/>` +
          // Top specular crescent
          `<path d="M${r2(cx - 4.2)} ${r2(cy - 3.6)} Q${cx} ${r2(cy - 6.2)} ${r2(cx + 4.2)} ${r2(cy - 3.6)}" fill="none" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity="0.85"/>` +
          `<text x="${cx}" y="${cy + 1.8}" font-size="6.4" font-weight="600" fill="#463e34" text-anchor="middle" font-family="var(--font-mono, ui-monospace, monospace)">${ch}</text>` +
        `</g>` +
      `</g>`
    })
  }
  // Sculpted spacebar with brass end caps
  s += `<g class="tw-spacebar" style="transform:translateY(calc(var(--iso-k4) * 2px))">` +
    `<rect x="275" y="317.5" width="110" height="12" rx="6" fill="#3a332a" opacity="0.22"/>` +
    `<rect x="275" y="315" width="110" height="11.5" rx="5.5" fill="url(#tw-porcelain-v)" stroke="#5b5245" stroke-width="0.85"/>` +
    `<line x1="286" y1="318.2" x2="374" y2="318.2" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.75"/>` +
    `<rect x="278" y="317" width="5" height="7.5" rx="2" fill="url(#tw-brass-v)" stroke="#5c4d32" stroke-width="0.5"/>` +
    `<rect x="377" y="317" width="5" height="7.5" rx="2" fill="url(#tw-brass-v)" stroke="#5c4d32" stroke-width="0.5"/>` +
  `</g>`
  return s
})()

/* ============================================================
   Mini Analog Pressure / Reading Cadence Gauge (right side of chassis) & 4-Digit Odometer (left)
   ============================================================ */
const CHASSIS_INSTRUMENTS = (() => {
  // Left 4-digit mechanical odometer window
  const odo = `<g class="tw-odometer" transform="translate(226, 224)">` +
    `<rect x="0" y="0" width="38" height="14" rx="2.5" fill="#d9d1c2" stroke="#685e50" stroke-width="0.75"/>` +
    `<rect x="2" y="2" width="34" height="10" rx="1.5" fill="#fbf8f1" stroke="#8f8576" stroke-width="0.5"/>` +
    [0, 1, 2, 3].map(i =>
      `<line x1="${10.5 + i * 8.5}" y1="2" x2="${10.5 + i * 8.5}" y2="12" stroke="#d5cbb8" stroke-width="0.5"/>` +
      `<text x="${6.2 + i * 8.5}" y="9.2" font-size="6.4" font-weight="600" fill="#463e34" text-anchor="middle" font-family="var(--font-mono, ui-monospace, monospace)">${i === 3 ? '1' : '0'}</text>`
    ).slice(0, 4).join('') +
  `</g>`

  // Right miniature circular analog gauge with live trembling needle
  const gx = 414, gy = 229
  let gTicks = ''
  for (let i = 0; i <= 8; i++) {
    const a = (-215 + i * 31.25) * Math.PI / 180
    gTicks += `<line x1="${r2(gx + Math.cos(a) * 7.2)}" y1="${r2(gy + Math.sin(a) * 7.2)}" ` +
      `x2="${r2(gx + Math.cos(a) * 9.5)}" y2="${r2(gy + Math.sin(a) * 9.5)}" ` +
      `stroke="${i >= 7 ? '#c86446' : '#6b6254'}" stroke-width="${i % 2 === 0 ? 0.75 : 0.45}"/>`
  }
  // Drawn at (414, 229), placed on the bottom rail right of the vents so it never covers the ribbon spool
  const gauge = `<g class="tw-gauge" transform="translate(431 346) scale(0.82) translate(-414 -229)">` +
    `<circle cx="${gx}" cy="${gy}" r="12.5" fill="url(#tw-brass-rad)" stroke="#4f422b" stroke-width="0.8"/>` +
    `<circle cx="${gx}" cy="${gy}" r="10.4" fill="#fffdf8" stroke="#7d7364" stroke-width="0.5"/>` +
    gTicks +
    `<g class="tw-gauge-needle" style="transform-origin:${gx}px ${gy}px">` +
      `<line x1="${gx}" y1="${gy + 2}" x2="${gx}" y2="${gy - 8.2}" stroke="#c45c3e" stroke-width="1.05" stroke-linecap="round"/>` +
    `</g>` +
    `<circle cx="${gx}" cy="${gy}" r="1.8" fill="#4f422b"/>` +
    `<path d="M${gx - 6} ${gy - 5} A8 8 0 0 1 ${gx + 3} ${gy - 7.5}" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" opacity="0.8"/>` +
  `</g>`

  // Status jewel indicator lamps (tiny brass-bezel LEDs: amber warm glow)
  const lamps = `<g class="tw-lamps">` +
    `<circle cx="242" cy="347" r="3.6" fill="url(#tw-brass-rad)" stroke="#524632" stroke-width="0.65"/>` +
    `<circle cx="242" cy="347" r="2.2" fill="#e6ae44" class="tw-lamp-amber"/>` +
    `<circle cx="254" cy="347" r="3.6" fill="url(#tw-brass-rad)" stroke="#524632" stroke-width="0.65"/>` +
    `<circle cx="254" cy="347" r="2.2" fill="#5da0be" class="tw-lamp-blue"/>` +
  `</g>`

  // Riveted brushed-brass nameplate: LUMEN · M-IV
  const plaque = `<g class="tw-plaque">` +
    `<rect x="292" y="341" width="76" height="13" rx="2.5" fill="url(#tw-brass-h)" stroke="#4f422b" stroke-width="0.8"/>` +
    `<rect x="294.5" y="343" width="71" height="9" rx="1.5" fill="#fbf7ee" stroke="#9e875c" stroke-width="0.45"/>` +
    `<text x="330" y="349.6" font-size="6.1" font-weight="600" fill="#423a30" text-anchor="middle" letter-spacing="1.7" font-family="var(--font-mono, ui-monospace, monospace)">LUMEN · IV</text>` +
    rivet(297.5, 347.5, 1.05) + rivet(362.5, 347.5, 1.05) +
  `</g>`

  // Right-side milled louver vents
  const louvers = [0, 1, 2, 3].map(i =>
    `<rect x="${384 + i * 7}" y="344.5" width="3.5" height="6" rx="1.5" fill="#b9afa0" stroke="#7d7364" stroke-width="0.45"/>`
  ).join('')

  return odo + gauge + lamps + plaque + louvers
})()

/* ============================================================
   Articulated Optical Reading Magnifier Arm · drawn reaching the title, turned −20° at rest so the loupe sits over the text lines
   below it and the title (the material's real name) is never under glass; hover/open/typing turn it further along the lines
   ============================================================ */
const OPTICAL_ARM = (() => {
  // Base tower sits on the upper-right chassis shoulder (454, 178) so the truss & crystal loupe never block the left-aligned title
  return `<g class="tw-optic-unit">` +
    `<rect x="444" y="166" width="20" height="24" rx="4" fill="url(#tw-porcelain-h)" stroke="#524a3e" stroke-width="0.9"/>` +
    `<circle cx="454" cy="178" r="6.5" fill="url(#tw-brass-rad)" stroke="#4f422b" stroke-width="0.8"/>` +
    `<circle cx="454" cy="178" r="2.2" fill="#fbf7ee" stroke="#4f422b" stroke-width="0.6"/>` +
    `<g class="tw-optic-arm" style="transform-origin:454px 178px">` +
      // Open-truss precision cantilevered arm reaching gracefully up-left toward the folio corner
      `<path d="M454 173 L432 98 L425 101 L447 177 Z" fill="url(#tw-porcelain-v)" stroke="#584f43" stroke-width="0.85" stroke-linejoin="round"/>` +
      `<line x1="448" y1="167" x2="431" y2="108" stroke="#998f7f" stroke-width="0.6" stroke-dasharray="2.5 2"/>` +
      `<circle cx="429" cy="100" r="5.2" fill="url(#tw-brass-rad)" stroke="#4f422b" stroke-width="0.8"/>` +
      `<circle cx="429" cy="100" r="1.7" fill="#fbf7ee"/>` +
      `<path d="M429 96.8 L398 96.8 L398 103.2 L429 103.2 Z" fill="url(#tw-porcelain-v)" stroke="#584f43" stroke-width="0.8"/>` +
      rivet(414, 100, 1.1) +
      // Crystal-clear magnifying loupe (hollow brass ring + ultra-translucent glass tint so underlying text stays crisp!)
      `<g class="tw-loupe" transform="translate(382, 100)">` +
        `<ellipse cx="0" cy="6" rx="22" ry="12" fill="url(#tw-lens-glow)" class="tw-lens-pool"/>` +
        `<circle cx="0" cy="0" r="17.5" fill="none" stroke="url(#tw-brass-rad)" stroke-width="3.4"/>` +
        `<circle cx="0" cy="0" r="19.2" fill="none" stroke="#4f422b" stroke-width="0.85"/>` +
        `<circle cx="0" cy="0" r="15.7" fill="url(#tw-lens-glass)" stroke="#6c7f88" stroke-width="0.65"/>` +
        // Ultra-fine optical reticle ticks only at perimeter (never blocking center letters!)
        `<line x1="-13.5" y1="0" x2="-9.5" y2="0" stroke="#4d7a90" stroke-width="0.6" opacity="0.65"/>` +
        `<line x1="9.5" y1="0" x2="13.5" y2="0" stroke="#4d7a90" stroke-width="0.6" opacity="0.65"/>` +
        `<line x1="0" y1="-13.5" x2="0" y2="-9.5" stroke="#4d7a90" stroke-width="0.6" opacity="0.65"/>` +
        `<line x1="0" y1="9.5" x2="0" y2="13.5" stroke="#4d7a90" stroke-width="0.6" opacity="0.65"/>` +
        `<path d="M-10 -6.5 A12.5 12.5 0 0 1 2.5 -12" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" opacity="0.88"/>` +
        `<circle cx="-8.5" cy="7.5" r="1.2" fill="#ffffff" opacity="0.65"/>` +
      `</g>` +
    `</g>` +
  `</g>`
})()

/* ============================================================
   Paper Sheet & Carriage · carries the real escaped title lines + blinking ink cursor
   ============================================================ */
/* ============================================================
   Voynich-style Calligraphic Cipher Glyphs ("火星文") · pure vector path strokes (zero Latin/CJK <text>),
   progressively written onto the archival paper like an arcane scholarly manuscript
   ============================================================ */
function cipherGlyph(id: number, x: number, y: number): string {
  switch (id % 14) {
    // 0: Crescent arc with vertical bisecting spine & apex dot (astronomical rune)
    case 0: return `M${r2(x + 0.5)} ${r2(y - 2.2)} A2.2 2.2 0 1 1 ${r2(x + 4.7)} ${r2(y - 2.2)} M${r2(x + 2.6)} ${r2(y - 6.8)} L${r2(x + 2.6)} ${r2(y + 0.4)}`
    // 1: Inverted tripod with floating upper bar
    case 1: return `M${r2(x + 0.5)} ${r2(y - 6.0)} L${r2(x + 4.7)} ${r2(y - 6.0)} M${r2(x + 2.6)} ${r2(y - 4.6)} L${r2(x + 0.6)} ${r2(y - 0.4)} M${r2(x + 2.6)} ${r2(y - 4.6)} L${r2(x + 4.6)} ${r2(y - 0.4)} M${r2(x + 2.6)} ${r2(y - 4.6)} L${r2(x + 2.6)} ${r2(y + 0.2)}`
    // 2: Diamond lozenge with horizontal cross-spear
    case 2: return `M${r2(x + 2.6)} ${r2(y - 6.4)} L${r2(x + 4.6)} ${r2(y - 3.4)} L${r2(x + 2.6)} ${r2(y - 0.4)} L${r2(x + 0.6)} ${r2(y - 3.4)} Z M${r2(x + 0.2)} ${r2(y - 3.4)} L${r2(x + 5.0)} ${r2(y - 3.4)}`
    // 3: Spiral shell glyph with descending tail
    case 3: return `M${r2(x + 2.8)} ${r2(y - 3.8)} C${r2(x + 4.4)} ${r2(y - 3.8)} ${r2(x + 4.4)} ${r2(y - 6.0)} ${r2(x + 2.4)} ${r2(y - 6.0)} C${r2(x + 0.4)} ${r2(y - 6.0)} ${r2(x + 0.4)} ${r2(y - 1.4)} ${r2(x + 3.0)} ${r2(y - 1.2)} Q${r2(x + 4.6)} ${r2(y - 1.0)} ${r2(x + 4.2)} ${r2(y + 1.4)}`
    // 4: Twin parallel angled reeds with base tie
    case 4: return `M${r2(x + 1.6)} ${r2(y - 6.6)} L${r2(x + 0.6)} ${r2(y - 0.6)} M${r2(x + 4.2)} ${r2(y - 6.6)} L${r2(x + 3.2)} ${r2(y - 0.6)} M${r2(x + 0.4)} ${r2(y - 2.6)} Q${r2(x + 2.6)} ${r2(y - 1.4)} ${r2(x + 4.8)} ${r2(y - 2.6)}`
    // 5: Crowned bowl / alchemy alembic rune
    case 5: return `M${r2(x + 0.5)} ${r2(y - 4.4)} Q${r2(x + 2.6)} ${r2(y - 0.4)} ${r2(x + 4.7)} ${r2(y - 4.4)} M${r2(x + 1.2)} ${r2(y - 6.2)} L${r2(x + 2.6)} ${r2(y - 4.6)} L${r2(x + 4.0)} ${r2(y - 6.2)} M${r2(x + 0.8)} ${r2(y - 0.4)} L${r2(x + 4.4)} ${r2(y - 0.4)}`
    // 6: Ringed planetary staff
    case 6: return `M${r2(x + 2.6)} ${r2(y - 6.6)} L${r2(x + 2.6)} ${r2(y + 0.6)} M${r2(x + 0.6)} ${r2(y - 4.2)} A2.0 1.4 0 1 0 ${r2(x + 4.6)} ${r2(y - 4.2)} A2.0 1.4 0 1 0 ${r2(x + 0.6)} ${r2(y - 4.2)}`
    // 7: Double-chevron stack (ancient cuneiform / alien script feel)
    case 7: return `M${r2(x + 0.6)} ${r2(y - 4.6)} L${r2(x + 2.6)} ${r2(y - 6.6)} L${r2(x + 4.6)} ${r2(y - 4.6)} M${r2(x + 0.6)} ${r2(y - 1.6)} L${r2(x + 2.6)} ${r2(y - 3.6)} L${r2(x + 4.6)} ${r2(y - 1.6)} M${r2(x + 2.6)} ${r2(y - 3.6)} L${r2(x + 2.6)} ${r2(y + 0.2)}`
    // 8: Opposing twin arcs (hourglass glyph)
    case 8: return `M${r2(x + 0.8)} ${r2(y - 6.4)} Q${r2(x + 3.0)} ${r2(y - 3.4)} ${r2(x + 0.8)} ${r2(y - 0.4)} M${r2(x + 4.4)} ${r2(y - 6.4)} Q${r2(x + 2.2)} ${r2(y - 3.4)} ${r2(x + 4.4)} ${r2(y - 0.4)} M${r2(x + 0.6)} ${r2(y - 3.4)} L${r2(x + 4.6)} ${r2(y - 3.4)}`
    // 9: Hooked comet curve with twin tick marks
    case 9: return `M${r2(x + 4.4)} ${r2(y - 6.2)} Q${r2(x + 0.4)} ${r2(y - 5.2)} ${r2(x + 0.8)} ${r2(y - 1.8)} Q${r2(x + 1.2)} ${r2(y + 0.4)} ${r2(x + 4.4)} ${r2(y - 0.8)} M${r2(x + 2.4)} ${r2(y - 3.8)} L${r2(x + 4.6)} ${r2(y - 3.8)}`
    // 10: Looped knot (lemniscate / Voynich ligature)
    case 10: return `M${r2(x + 0.5)} ${r2(y - 3.4)} C${r2(x + 0.5)} ${r2(y - 6.0)} ${r2(x + 2.8)} ${r2(y - 6.0)} ${r2(x + 2.6)} ${r2(y - 3.4)} C${r2(x + 2.4)} ${r2(y - 0.8)} ${r2(x + 4.7)} ${r2(y - 0.8)} ${r2(x + 4.7)} ${r2(y - 3.4)} C${r2(x + 4.7)} ${r2(y - 6.0)} ${r2(x + 2.4)} ${r2(y - 6.0)} ${r2(x + 2.6)} ${r2(y - 3.4)}`
    // 11: Triangle peak with descending pendulum & crossbar
    case 11: return `M${r2(x + 2.6)} ${r2(y - 6.6)} L${r2(x + 0.6)} ${r2(y - 2.6)} L${r2(x + 4.6)} ${r2(y - 2.6)} Z M${r2(x + 2.6)} ${r2(y - 2.6)} L${r2(x + 2.6)} ${r2(y + 0.8)} M${r2(x + 1.4)} ${r2(y - 0.8)} L${r2(x + 3.8)} ${r2(y - 0.8)}`
    // 12: Three-pronged fork rune on curved foot
    case 12: return `M${r2(x + 0.8)} ${r2(y - 6.4)} L${r2(x + 0.8)} ${r2(y - 3.2)} Q${r2(x + 2.6)} ${r2(y - 2.0)} ${r2(x + 4.4)} ${r2(y - 3.2)} L${r2(x + 4.4)} ${r2(y - 6.4)} M${r2(x + 2.6)} ${r2(y - 6.4)} L${r2(x + 2.6)} ${r2(y + 0.4)}`
    // 13: Slanted orbital ring with tangent hook
    default: return `M${r2(x + 0.6)} ${r2(y - 0.6)} L${r2(x + 4.4)} ${r2(y - 6.4)} M${r2(x + 1.0)} ${r2(y - 5.2)} A1.8 1.8 0 1 1 ${r2(x + 4.2)} ${r2(y - 2.0)}`
  }
}

function cipherLinePath(x0: number, y: number, words: number[], seed: number): { d: string; endX: number; accents: string } {
  let x = x0
  let d = ''
  let accents = ''
  let k = seed
  for (let w = 0; w < words.length; w++) {
    const len = words[w]!
    for (let i = 0; i < len; i++) {
      k = (k * 37 + 13) % 97
      const jitterY = ((k % 3) - 1) * 0.32
      d += (d ? ' ' : '') + cipherGlyph(k, x, y + jitterY)
      x += 5.45
    }
    if (w < words.length - 1) {
      if ((w + seed) % 3 === 1) {
        accents += `<circle cx="${r2(x + 1.8)}" cy="${r2(y - 2.6)}" r="0.75" fill="#c9933c" opacity="0.72"/>`
      }
      x += 4.6
    }
  }
  return { d, endX: x, accents }
}

function buildPaper(lines: string[]) {
  const shown = lines.slice(0, LINE_YS.length)
  const last = shown.length - 1
  const words = shown.map((value, i) =>
    text(LINE_X, LINE_YS[i]!, FONT_SIZE, value, 'font-family="var(--font-mono, ui-monospace, monospace)" fill="#3b352c"'),
  ).join('')

  // When paper has no real title yet, render 4 animated Voynich-style cipher lines; when a title is present, render 2 softer cipher note lines below it
  let cipherMarkup = ''
  if (last < 0) {
    const blankSpec: Array<{ y: number; words: number[]; seed: number; cls: string }> = [
      { y: 34, words: [4, 5, 3, 4], seed: 3, cls: 'tw-cipher-1' },
      { y: 52, words: [3, 6, 4, 3], seed: 17, cls: 'tw-cipher-2' },
      { y: 70, words: [5, 3, 5, 2], seed: 29, cls: 'tw-cipher-3' },
      { y: 88, words: [4, 4, 3], seed: 41, cls: 'tw-cipher-4' },
    ]
    cipherMarkup = blankSpec.map(({ y, words: w, seed, cls }) => {
      const built = cipherLinePath(LINE_X, y, w, seed)
      return `<g class="tw-cipher-line ${cls}">` +
        `<path d="${built.d}" pathLength="100" fill="none" stroke="#4a4237" stroke-width="0.92" stroke-linecap="round" stroke-linejoin="round" class="tw-cipher-stroke"/>` +
        `<g class="tw-cipher-dots">${built.accents}</g>` +
      `</g>`
    }).join('')
  } else {
    const noteSpec: Array<{ y: number; words: number[]; seed: number; cls: string }> = [
      { y: 89, words: [4, 5, 3, 4], seed: 11, cls: 'tw-cipher-note-1' },
      { y: 103, words: [3, 4, 5], seed: 23, cls: 'tw-cipher-note-2' },
    ]
    cipherMarkup = noteSpec.map(({ y, words: w, seed, cls }) => {
      const built = cipherLinePath(LINE_X, y, w, seed)
      return `<g class="tw-cipher-line ${cls}">` +
        `<path d="${built.d}" pathLength="100" fill="none" stroke="#8b8172" stroke-width="0.82" stroke-linecap="round" stroke-linejoin="round" class="tw-cipher-stroke"/>` +
        `<g class="tw-cipher-dots">${built.accents}</g>` +
      `</g>`
    }).join('')
  }

  const cursorX = last < 0
    ? LINE_X + 76
    : Math.min(LINE_X + textWidth(shown[last]!, FONT_SIZE) + CURSOR_GAP, SHEET_W - 18)
  const cursorY = last < 0 ? 88 - 8.2 : LINE_YS[last]! - 8.5
  const cursor = last < 0
    ? `<rect x="${r2(cursorX)}" y="${r2(cursorY)}" width="4.2" height="9.6" rx="0.8" fill="#c98e32" class="tw-cursor"/>`
    : `<rect x="${r2(cursorX)}" y="${r2(cursorY)}" width="4.5" height="10.5" rx="0.8" fill="#3b352c" class="tw-cursor"/>`

  // Archival paper perforation holes along left & right tractor edges (Loom/Roulette precision tape detail)
  let perfs = ''
  for (let py = 12; py <= SHEET_H - 8; py += 12) {
    perfs += `<circle cx="8" cy="${py}" r="1.8" fill="#dfd7c8" stroke="#b6ab99" stroke-width="0.45"/>` +
      `<circle cx="${SHEET_W - 8}" cy="${py}" r="1.8" fill="#dfd7c8" stroke="#b6ab99" stroke-width="0.45"/>`
  }

  return `<g transform="translate(${SHEET_X}, ${SHEET_Y})" clip-path="url(#iso-tw-slit)">` +
    `<g class="tw-paper-slide">` +
      // Backing shadow sheet (depth layer)
      `<rect x="4" y="-4" width="${SHEET_W}" height="${SHEET_H + 36}" rx="2" fill="#e6dece" stroke="#a69c8b" stroke-width="0.7"/>` +
      // Main archival rag sheet
      `<rect x="0" y="0" width="${SHEET_W}" height="${SHEET_H + 36}" rx="2" fill="url(#tw-paper-grad)" stroke="#6c6254" stroke-width="0.9"/>` +
      // Left marginalia rule & top archival header hairline
      `<line x1="16" y1="0" x2="16" y2="${SHEET_H + 36}" stroke="#d9a87c" stroke-width="0.65" opacity="0.65"/>` +
      `<line x1="${SHEET_W - 16}" y1="0" x2="${SHEET_W - 16}" y2="${SHEET_H + 36}" stroke="#d8d0c0" stroke-width="0.55" stroke-dasharray="2 2"/>` +
      `<line x1="22" y1="16" x2="${SHEET_W - 22}" y2="16" stroke="#c8bfae" stroke-width="0.55"/>` +
      `<text x="22" y="12.5" font-size="5" fill="#9a9080" letter-spacing="1.2" font-family="var(--font-mono, ui-monospace, monospace)">FOLIO · 01</text>` +
      `<text x="${SHEET_W - 22}" y="12.5" font-size="5" fill="#9a9080" text-anchor="end" letter-spacing="0.8" font-family="var(--font-mono, ui-monospace, monospace)">LUMEN ARCHIVE</text>` +
      perfs +
      // Faint ruled baselines
      `<line x1="22" y1="39" x2="${SHEET_W - 22}" y2="39" stroke="#e4dccb" stroke-width="0.5"/>` +
      `<line x1="22" y1="57" x2="${SHEET_W - 22}" y2="57" stroke="#e4dccb" stroke-width="0.5"/>` +
      `<line x1="22" y1="75" x2="${SHEET_W - 22}" y2="75" stroke="#e4dccb" stroke-width="0.5"/>` +
      `<line x1="22" y1="93" x2="${SHEET_W - 22}" y2="93" stroke="#e8e1d2" stroke-width="0.5"/>` +
      `<g clip-path="url(#iso-tw-sheet)">${words}${cipherMarkup}${cursor}</g>` +
    `</g>` +
  `</g>`
}

function buildCarriage(lines: string[]) {
  // Graduated paper-bail ruler ticks
  let bailTicks = ''
  for (let i = 0; i <= 24; i++) {
    const tx = 238 + i * 7.6
    const tall = i % 4 === 0
    bailTicks += `<line x1="${r2(tx)}" y1="158" x2="${r2(tx)}" y2="${tall ? 163.5 : 161.2}" stroke="#5b5040" stroke-width="${tall ? 0.7 : 0.45}"/>`
  }

  // Knurled end knobs
  const knurl = (kx: number) => `<g>` +
    `<rect x="${kx}" y="148" width="14" height="24" rx="3" fill="url(#tw-brass-v)" stroke="#4f422b" stroke-width="0.85"/>` +
    [0, 1, 2, 3, 4].map(i => `<line x1="${kx + 2}" y1="${152 + i * 4}" x2="${kx + 12}" y2="${152 + i * 4}" stroke="#78633b" stroke-width="0.6"/>`).join('') +
  `</g>`

  return `<g class="tw-carriage">` +
    // Carriage return lever (brass curved arm on left)
    `<path d="M210 156 L192 140 Q187 135 180 135 L171 135" fill="none" stroke="#4f422b" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M210 156 L192 140 Q187 135 180 135 L171 135" fill="none" stroke="url(#tw-brass-h)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="170" cy="135" r="3.4" fill="url(#tw-brass-rad)" stroke="#4f422b" stroke-width="0.7"/>` +
    // Left & right platen knobs + shafts
    knurl(196) +
    `<rect x="210" y="156" width="12" height="8" fill="url(#tw-porcelain-v)" stroke="#5c5346" stroke-width="0.75"/>` +
    knurl(450) +
    `<rect x="438" y="156" width="12" height="8" fill="url(#tw-porcelain-v)" stroke="#5c5346" stroke-width="0.75"/>` +
    // Rear platen housing backing
    `<rect x="218" y="146" width="224" height="32" rx="6" fill="url(#tw-platen-dark)" stroke="#464038" stroke-width="1"/>` +
    `<line x1="224" y1="151" x2="436" y2="151" stroke="#8f8679" stroke-width="1.2" opacity="0.5"/>` +
    // Archival paper rising out of platen
    buildPaper(lines) +
    // Front carriage rail & brass paper-bail bar with two roller bearings
    `<rect x="220" y="170" width="220" height="14" rx="3" fill="url(#tw-porcelain-v)" stroke="#524a3e" stroke-width="0.9"/>` +
    `<rect x="224" y="172.5" width="212" height="2" rx="1" fill="#ffffff" opacity="0.7"/>` +
    // Paper-bail graduated brass bar across front of sheet
    `<rect x="226" y="157" width="208" height="7" rx="2" fill="url(#tw-brass-v)" stroke="#4f422b" stroke-width="0.75"/>` +
    bailTicks +
    `<rect x="258" y="154.5" width="12" height="12" rx="3" fill="url(#tw-porcelain-v)" stroke="#4f422b" stroke-width="0.75"/>` +
    `<rect x="390" y="154.5" width="12" height="12" rx="3" fill="url(#tw-porcelain-v)" stroke="#4f422b" stroke-width="0.75"/>` +
    rivet(230, 177, 1.35) + rivet(430, 177, 1.35) +
  `</g>`
}

/* ============================================================
   Ambient Floating Dust Motes · subtle golden light specks drifting above the instrument
   ============================================================ */
const AMBIENT_MOTES = `<g class="tw-motes" opacity="0.75">` +
  `<circle cx="294" cy="64" r="1.4" fill="#e6b44e" class="tw-mote tw-m1"/>` +
  `<circle cx="352" cy="54" r="1.1" fill="#63a1be" class="tw-mote tw-m2"/>` +
  `<circle cx="390" cy="70" r="1.3" fill="#e6b44e" class="tw-mote tw-m3"/>` +
  `<circle cx="516" cy="154" r="1.2" fill="#e6b44e" class="tw-mote tw-m2"/>` +
  `<circle cx="136" cy="138" r="1.1" fill="#63a1be" class="tw-mote tw-m1"/>` +
`</g>`

/* ============================================================
   Main SVG Builder · pure valid XML, zero external dependencies
   ============================================================ */
export function typewriterSvg({ lines }: { lines: string[] }) {
  const safeLines = lines.map(l => String(l ?? ''))
  // Verify escapeXml import stays used even if lines is empty
  void escapeXml

  return `<svg class="iso iso-typewriter" viewBox="0 0 640 400" role="img" aria-hidden="true">
    <defs>
      <filter id="tw-soft-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
      <pattern id="tw-dot-grid" width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="8" cy="8" r="0.85" fill="#8f8575" opacity="0.28"/>
      </pattern>
      <radialGradient id="tw-grid-fade" cx="50%" cy="52%" r="50%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>
        <stop offset="68%" stop-color="#ffffff" stop-opacity="0.72"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
      <mask id="tw-grid-mask"><rect x="0" y="0" width="640" height="400" fill="url(#tw-grid-fade)"/></mask>

      <linearGradient id="tw-porcelain-v" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fdfbf7"/>
        <stop offset="48%" stop-color="#f5efe4"/>
        <stop offset="100%" stop-color="#e3dacb"/>
      </linearGradient>
      <linearGradient id="tw-porcelain-h" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#e7dfd0"/>
        <stop offset="22%" stop-color="#fcf9f2"/>
        <stop offset="76%" stop-color="#f2ebe0"/>
        <stop offset="100%" stop-color="#d8cebe"/>
      </linearGradient>
      <radialGradient id="tw-porcelain-rivet" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="60%" stop-color="#ebe3d5"/>
        <stop offset="100%" stop-color="#bfb4a2"/>
      </radialGradient>
      <radialGradient id="tw-drum-outer" cx="34%" cy="28%" r="74%">
        <stop offset="0%" stop-color="#fdfbf7"/>
        <stop offset="60%" stop-color="#f1eadf"/>
        <stop offset="100%" stop-color="#d8cebe"/>
      </radialGradient>
      <radialGradient id="tw-dial-face" cx="42%" cy="36%" r="68%">
        <stop offset="0%" stop-color="#fffefb"/>
        <stop offset="75%" stop-color="#f7f2e8"/>
        <stop offset="100%" stop-color="#e8dfd0"/>
      </radialGradient>
      <linearGradient id="tw-recess" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#d8cfc0"/>
        <stop offset="35%" stop-color="#ece5d8"/>
        <stop offset="100%" stop-color="#f7f2e7"/>
      </linearGradient>
      <linearGradient id="tw-keywell" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#cfc5b4"/>
        <stop offset="28%" stop-color="#e4dccd"/>
        <stop offset="100%" stop-color="#ede6d9"/>
      </linearGradient>
      <linearGradient id="tw-well-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#cdc3b2"/>
        <stop offset="100%" stop-color="#e8e0d0"/>
      </linearGradient>
      <linearGradient id="tw-platen-dark" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6e675d"/>
        <stop offset="32%" stop-color="#4e4840"/>
        <stop offset="100%" stop-color="#35302a"/>
      </linearGradient>
      <linearGradient id="tw-brass-h" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#cfa65a"/>
        <stop offset="28%" stop-color="#f4dca3"/>
        <stop offset="65%" stop-color="#e3bf76"/>
        <stop offset="100%" stop-color="#b88d42"/>
      </linearGradient>
      <linearGradient id="tw-brass-v" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f5dea8"/>
        <stop offset="48%" stop-color="#e0bc73"/>
        <stop offset="100%" stop-color="#bd9247"/>
      </linearGradient>
      <radialGradient id="tw-brass-rad" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#faf0d2"/>
        <stop offset="55%" stop-color="#e4c27c"/>
        <stop offset="100%" stop-color="#b3883e"/>
      </radialGradient>
      <radialGradient id="tw-keycap" cx="38%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="70%" stop-color="#f7f2e7"/>
        <stop offset="100%" stop-color="#e2d9c8"/>
      </radialGradient>
      <linearGradient id="tw-paper-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fffefa"/>
        <stop offset="80%" stop-color="#fbf7ee"/>
        <stop offset="100%" stop-color="#f1eadc"/>
      </linearGradient>
      <linearGradient id="tw-glass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.82"/>
        <stop offset="28%" stop-color="#f4f8fa" stop-opacity="0.52"/>
        <stop offset="75%" stop-color="#e8eff2" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#d5dfe4" stop-opacity="0.72"/>
      </linearGradient>
      <linearGradient id="tw-amber-liq" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f3ca6e" stop-opacity="0.92"/>
        <stop offset="100%" stop-color="#d49635" stop-opacity="0.96"/>
      </linearGradient>
      <linearGradient id="tw-celadon-liq" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7ebad6" stop-opacity="0.88"/>
        <stop offset="100%" stop-color="#4787a8" stop-opacity="0.95"/>
      </linearGradient>
      <radialGradient id="tw-lens-glass" cx="35%" cy="30%" r="72%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.34"/>
        <stop offset="52%" stop-color="#dff0f7" stop-opacity="0.14"/>
        <stop offset="100%" stop-color="#7fb2c8" stop-opacity="0.22"/>
      </radialGradient>
      <radialGradient id="tw-lens-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#f2c96d" stop-opacity="0.35"/>
        <stop offset="60%" stop-color="#7eb8d2" stop-opacity="0.14"/>
        <stop offset="100%" stop-color="#7eb8d2" stop-opacity="0"/>
      </radialGradient>

      <clipPath id="iso-tw-slit" clipPathUnits="userSpaceOnUse"><rect x="-40" y="-60" width="${SHEET_W + 80}" height="${SHEET_H + 54}"/></clipPath>
      <clipPath id="iso-tw-sheet" clipPathUnits="userSpaceOnUse"><rect x="18" y="16" width="${SHEET_W - 36}" height="${SHEET_H - 18}"/></clipPath>
      <clipPath id="tw-sphere-clip" clipPathUnits="userSpaceOnUse"><circle cx="532" cy="206" r="27.8"/></clipPath>
      <clipPath id="tw-flask-clip" clipPathUnits="userSpaceOnUse"><path d="M522 241 L542 241 L542 256 L565.8 315.5 Q567.6 322.8 559.5 322.8 L504.5 322.8 Q496.4 322.8 498.2 315.5 L522 256 Z"/></clipPath>
      <clipPath id="tw-condenser-clip" clipPathUnits="userSpaceOnUse"><rect x="574" y="244" width="4" height="38" rx="2"/></clipPath>
    </defs>

    <!-- Subtle drafting dot-grid backdrop anchoring the instrument -->
    <rect x="16" y="16" width="608" height="368" fill="url(#tw-dot-grid)" mask="url(#tw-grid-mask)"/>
    <!-- Delicate drafting datum baseline -->
    <line x1="48" y1="353" x2="592" y2="353" stroke="#9e9484" stroke-width="0.6" stroke-dasharray="2 4" opacity="0.45"/>

    ${AMBIENT_MOTES}
    ${DIAL_ASSEMBLY}
    ${LEFT_PIPES}
    ${RIGHT_PIPES}
    ${ALEMBIC_ASSEMBLY}

    <!-- Hero Center Assembly: Precision Porcelain Reading Desk / Typewriter -->
    <g class="tw-hero">
      <ellipse cx="330" cy="360" rx="134" ry="12" fill="#2d261c" opacity="0.16" filter="url(#tw-soft-blur)"/>
      ${buildCarriage(safeLines)}

      <!-- Main machined porcelain body -->
      <path d="M222 184 L438 184 Q446 184 446 192 L446 346 Q446 358 434 358 L226 358 Q214 358 214 346 L214 192 Q214 184 222 184 Z"
            fill="url(#tw-porcelain-v)" stroke="#524a3e" stroke-width="1.15" stroke-linejoin="round"/>
      <!-- Inner rim highlight & machined side flanges -->
      <path d="M224 186.5 L436 186.5 Q443.5 186.5 443.5 194 L443.5 344 Q443.5 355.5 432 355.5 L228 355.5 Q216.5 355.5 216.5 344 L216.5 194 Q216.5 186.5 224 186.5 Z"
            fill="none" stroke="#ffffff" stroke-width="0.95" opacity="0.72"/>
      <!-- Bottom foot rails -->
      <rect x="226" y="358" width="24" height="5" rx="2" fill="url(#tw-brass-h)" stroke="#4f422b" stroke-width="0.75"/>
      <rect x="410" y="358" width="24" height="5" rx="2" fill="url(#tw-brass-h)" stroke="#4f422b" stroke-width="0.75"/>

      <!-- Upper recessed deck with typebar fan & twin brass ribbon spools -->
      <rect x="224" y="191" width="212" height="42" rx="5" fill="url(#tw-recess)" stroke="#7c7263" stroke-width="0.75"/>
      ${TYPEBAR_FAN}
      ${ribbonSpool(250, 209, 'tw-spool-l')}
      ${ribbonSpool(410, 209, 'tw-spool-r')}

      <!-- Corner slotted brass screws -->
      ${screw(223, 193, 2.3, 28)}
      ${screw(437, 193, 2.3, -24)}
      ${screw(223, 349, 2.3, -18)}
      ${screw(437, 349, 2.3, 40)}

      ${KEYBOARD}
      ${CHASSIS_INSTRUMENTS}
      ${OPTICAL_ARM}
    </g>
  </svg>`
}

/* ============================================================
   Living CSS Motion · Ambient idle life + Hover optical focus + Click multi-stage inspection + .is-typing cadence
   ============================================================ */
const VARS = ['--iso-paper', '--iso-car', '--iso-arm', '--iso-k1', '--iso-k2', '--iso-k3', '--iso-k4']

export const TYPEWRITER_CSS = VARS.map(v => `@property ${v} { syntax: '<number>'; inherits: true; initial-value: 0; }`).join('\n') + `
.iso-typewriter {
  --iso-paper: 0;
  --iso-car: 0;
  --iso-arm: 0;
  --iso-k1: 0; --iso-k2: 0; --iso-k3: 0; --iso-k4: 0;
  transition:
    --iso-paper 750ms cubic-bezier(.22, 1, .36, 1),
    --iso-car 520ms cubic-bezier(.32, .72, 0, 1),
    --iso-arm 720ms cubic-bezier(.22, 1, .36, 1),
    --iso-k1 110ms ease, --iso-k2 110ms ease, --iso-k3 110ms ease, --iso-k4 110ms ease;
}
.iso-host:hover .iso-typewriter {
  --iso-paper: 10;
  --iso-arm: 1;
}
.iso-host[data-open] .iso-typewriter {
  --iso-paper: 24;
  --iso-car: 14;
  --iso-arm: 2.2;
}

/* Variable-driven mechanical transforms */
.iso-typewriter .tw-carriage { transform: translateX(calc(var(--iso-car) * -1px)); }
.iso-typewriter .tw-paper-slide { transform: translateY(calc(var(--iso-paper) * -1px)); }
.iso-typewriter .tw-optic-arm {
  transform: rotate(calc(-20deg + var(--iso-arm) * -4.2deg)) translateX(calc(var(--iso-arm) * -6px));
}
.iso-typewriter .tw-lens-pool { opacity: calc(0.45 + var(--iso-arm) * 0.25); transition: opacity 420ms ease; }
.iso-typewriter .tw-strike-spark { opacity: 0; }

/* ---- Living ambient animations (calm, monotonic dial + fluid volume distillation + self-writing cipher manuscript) ---- */
@keyframes tw-dial-turn {
  0%   { transform: rotate(0deg); }
  25%  { transform: rotate(90deg); }
  50%  { transform: rotate(180deg); }
  75%  { transform: rotate(270deg); }
  100% { transform: rotate(360deg); }
}
@keyframes tw-wave-drift { 0%, 100% { transform: translateX(0px); } 50% { transform: translateX(-22px); } }
@keyframes tw-level-amber {
  0%, 100% { transform: translateY(10px); }
  50% { transform: translateY(-11px); }
}
@keyframes tw-level-blue {
  0%, 100% { transform: translateY(-18px); }
  50% { transform: translateY(14px); }
}
@keyframes tw-level-condenser {
  0%, 100% { transform: translateY(-8px); }
  50% { transform: translateY(14px); }
}
@keyframes tw-cipher-write-1 {
  0% { stroke-dashoffset: 100; opacity: 1; }
  20%, 88% { stroke-dashoffset: 0; opacity: 1; }
  96%, 100% { stroke-dashoffset: 0; opacity: 0; }
}
@keyframes tw-cipher-write-2 {
  0%, 20% { stroke-dashoffset: 100; opacity: 1; }
  42%, 88% { stroke-dashoffset: 0; opacity: 1; }
  96%, 100% { stroke-dashoffset: 0; opacity: 0; }
}
@keyframes tw-cipher-write-3 {
  0%, 42% { stroke-dashoffset: 100; opacity: 1; }
  64%, 88% { stroke-dashoffset: 0; opacity: 1; }
  96%, 100% { stroke-dashoffset: 0; opacity: 0; }
}
@keyframes tw-cipher-write-4 {
  0%, 64% { stroke-dashoffset: 100; opacity: 1; }
  80%, 88% { stroke-dashoffset: 0; opacity: 1; }
  96%, 100% { stroke-dashoffset: 0; opacity: 0; }
}
@keyframes tw-cipher-dots-fade {
  0%, 18% { opacity: 0; }
  30%, 88% { opacity: 1; }
  96%, 100% { opacity: 0; }
}
@keyframes tw-bubble-rise {
  0% { transform: translateY(4px); opacity: 0; }
  25% { opacity: 0.78; }
  85% { opacity: 0.55; }
  100% { transform: translateY(-20px); opacity: 0; }
}
@keyframes tw-pulse-flow {
  0% { stroke-dashoffset: 38; opacity: 0.15; }
  45% { opacity: 0.9; }
  100% { stroke-dashoffset: -38; opacity: 0.15; }
}
@keyframes tw-needle-idle {
  0%, 100% { transform: rotate(-28deg); }
  30% { transform: rotate(-16deg); }
  58% { transform: rotate(-22deg); }
  82% { transform: rotate(-10deg); }
}
@keyframes tw-needle-active {
  0%, 100% { transform: rotate(8deg); }
  25% { transform: rotate(32deg); }
  50% { transform: rotate(16deg); }
  75% { transform: rotate(40deg); }
}
@keyframes tw-lamp-breathe {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
@keyframes tw-cursor-blink {
  0%, 48% { opacity: 0.92; }
  54%, 100% { opacity: 0.12; }
}
@keyframes tw-mote-float {
  0%, 100% { transform: translate(0px, 0px); opacity: 0.2; }
  50% { transform: translate(3px, -7px); opacity: 0.78; }
}
@keyframes tw-spool-spin {
  0%   { transform: rotate(0deg); }
  25%  { transform: rotate(90deg); }
  50%  { transform: rotate(180deg); }
  75%  { transform: rotate(270deg); }
  100% { transform: rotate(360deg); }
}
@keyframes tw-spark-pop {
  0%, 18%, 26%, 43%, 51%, 68%, 76%, 94%, 100% { opacity: 0; transform: scale(0.75); }
  21%, 46%, 71%, 90% { opacity: 0.95; transform: scale(1.1); }
}

/* Strictly continuous one-way clockwise rotation — never reverses */
.iso-typewriter .tw-dial-rotor { animation: tw-dial-turn 36s linear infinite; }

/* Dynamic opposite-phase fluid distillation levels + horizontal meniscus waves */
.iso-typewriter .tw-level-amber { animation: tw-level-amber 8.5s ease-in-out infinite; }
.iso-typewriter .tw-level-blue { animation: tw-level-blue 8.5s ease-in-out infinite; }
.iso-typewriter .tw-level-condenser { animation: tw-level-condenser 8.5s ease-in-out infinite; }
.iso-typewriter .tw-wave-amber { animation: tw-wave-drift 4.6s ease-in-out infinite; }
.iso-typewriter .tw-wave-blue { animation: tw-wave-drift 5.8s ease-in-out infinite reverse; }
.iso-typewriter .tw-bubble { animation: tw-bubble-rise 4.4s ease-in infinite; }
.iso-typewriter .tw-b2 { animation-delay: -1.6s; animation-duration: 5.2s; }
.iso-typewriter .tw-b3 { animation-delay: -3.1s; animation-duration: 3.9s; }

/* Ink appears only while the keys strike: at rest the cipher is a finished draft; .is-typing writes it */
.iso-typewriter .tw-cipher-stroke { stroke-dasharray: 100 100; stroke-dashoffset: 0; }
.iso-host.is-typing .iso-typewriter .tw-cipher-1 .tw-cipher-stroke { animation: tw-cipher-write-1 12s linear infinite; }
.iso-host.is-typing .iso-typewriter .tw-cipher-2 .tw-cipher-stroke { animation: tw-cipher-write-2 12s linear infinite; }
.iso-host.is-typing .iso-typewriter .tw-cipher-3 .tw-cipher-stroke { animation: tw-cipher-write-3 12s linear infinite; }
.iso-host.is-typing .iso-typewriter .tw-cipher-4 .tw-cipher-stroke { animation: tw-cipher-write-4 12s linear infinite; }
.iso-host.is-typing .iso-typewriter .tw-cipher-note-1 .tw-cipher-stroke { animation: tw-cipher-write-1 10s linear infinite; }
.iso-host.is-typing .iso-typewriter .tw-cipher-note-2 .tw-cipher-stroke { animation: tw-cipher-write-2 10s linear infinite; }
.iso-host.is-typing .iso-typewriter .tw-cipher-dots { animation: tw-cipher-dots-fade 12s linear infinite; }

.iso-typewriter .tw-pulse { stroke-dasharray: 9 30; animation: tw-pulse-flow 3.4s linear infinite; }
.iso-typewriter .tw-pulse-blue { animation-delay: -1.2s; animation-duration: 4.1s; }
.iso-typewriter .tw-pulse-amber-r { animation-delay: -0.7s; animation-duration: 3.1s; }
.iso-typewriter .tw-pulse-blue-r { animation-delay: -2.1s; animation-duration: 3.8s; }

.iso-typewriter .tw-gauge-needle { animation: tw-needle-idle 5.4s ease-in-out infinite; }
.iso-host[data-open] .iso-typewriter .tw-gauge-needle,
.iso-host.is-typing .iso-typewriter .tw-gauge-needle { animation: tw-needle-active 1.6s ease-in-out infinite; }

.iso-typewriter .tw-lamp-amber { animation: tw-lamp-breathe 3.6s ease-in-out infinite; }
.iso-typewriter .tw-lamp-blue { animation: tw-lamp-breathe 4.4s ease-in-out infinite -1.8s; }
.iso-typewriter .tw-cursor { animation: tw-cursor-blink 1.25s steps(1, end) infinite; }

.iso-typewriter .tw-mote { animation: tw-mote-float 5.6s ease-in-out infinite; }
.iso-typewriter .tw-m2 { animation-delay: -2.1s; animation-duration: 6.4s; }
.iso-typewriter .tw-m3 { animation-delay: -3.8s; animation-duration: 5.1s; }

/* ---- Active reading-generation loop (.is-typing): keys strike, carriage steps & returns, ribbon spools spin, optic arm tracks ---- */
@keyframes iso-tw-type {
  0%   { --iso-car: 0;  --iso-k1: 0; --iso-k2: 0; --iso-k3: 0; --iso-k4: 0; --iso-arm: 0.3; }
  4%   { --iso-k1: 1; }
  10%  { --iso-car: 0;  --iso-k1: 0; }
  14%  { --iso-car: 6;  --iso-arm: 0.8; }
  26%  { --iso-k2: 0; }
  30%  { --iso-k2: 1; }
  36%  { --iso-car: 6;  --iso-k2: 0; }
  40%  { --iso-car: 12; --iso-arm: 1.4; }
  52%  { --iso-k3: 0; }
  56%  { --iso-k3: 1; }
  62%  { --iso-car: 12; --iso-k3: 0; }
  66%  { --iso-car: 18; --iso-arm: 2.0; }
  76%  { --iso-k4: 0; }
  80%  { --iso-k4: 1; }
  86%  { --iso-car: 18; --iso-k4: 0; }
  94%  { --iso-car: 0;  --iso-arm: 0.3; }
  100% { --iso-car: 0;  --iso-k1: 0; --iso-k2: 0; --iso-k3: 0; --iso-k4: 0; --iso-arm: 0.3; }
}
.iso-host.is-typing .iso-typewriter { animation: iso-tw-type 2.2s linear infinite; }
.iso-host.is-typing .iso-typewriter .tw-spool-l { animation: tw-spool-spin 3.2s linear infinite; }
.iso-host.is-typing .iso-typewriter .tw-spool-r { animation: tw-spool-spin 3.2s linear infinite; }
.iso-host.is-typing .iso-typewriter .tw-strike-spark { transform-origin: 330px 204px; animation: tw-spark-pop 2.2s linear infinite; }

@media (prefers-reduced-motion: reduce) {
  .iso-typewriter,
  .iso-typewriter *,
  .iso-host.is-typing .iso-typewriter,
  .iso-host.is-typing .iso-typewriter * {
    animation: none !important;
    transition-duration: 1ms !important;
  }
}
`
