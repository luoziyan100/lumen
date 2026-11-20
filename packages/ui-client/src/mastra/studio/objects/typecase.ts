/**
 * [INPUT]: shared White-Porcelain CAD helpers in ./instrument.ts
 * [OUTPUT]: typecaseSvg(): diagonal porcelain belt conveyor, sorter arm with a telescoping scan head and the INDEX · VII console SVG
 *           (640×400 monochrome white-porcelain CAD: slats and cartons riding one belt, cable from the arm's turret to the console, 4-digit
 *           register with a stepping last wheel, scan bay, 5 archive cards lifting on open); TYPECASE_CSS (one 6s cycle, hover/open card lift,
 *           reduced-motion guard)
 * [POS]: object 8 of studio/objects/, shown in the All placeholder view. One cause chain per cycle: the belt advances one carton pitch
 *        (five slats, so no seam) and stops, the head dips onto the carton under it, a pulse runs down the cable, the register counts it and
 *        the bay's scan line sweeps. Pure valid XML SVG with uniquely prefixed ids (`tc-`)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { bolt, coolingFins, dotGridBackdrop, instrumentDefs, r2, rivet, rivetRow, trussArm } from './instrument.ts'

const PFX = 'tc-'

/* ============================================================
   One cycle, one cause chain
   ------------------------------------------------------------
   The belt advances exactly one carton pitch and stops; the scan head dips onto
   the carton now under it; a pulse runs down the cable; the console's register
   counts it and its scan line sweeps. Slats move with the belt (the pitch is a
   whole number of slats), so the loop has no seam.
   ============================================================ */
const PITCH = { x: 76, y: 74 }                                // one carton to the next along the belt
const SLAT = { x: PITCH.x / 5, y: PITCH.y / 5 }
const CYCLE = 6                                                 // seconds
const MOVE_FROM = 42                                            // % of the cycle: scan before, travel after
const HEAD = { x: 216, y: 150 }                                 // nozzle above the paused carton's lid centre (216, 198)
const DIGITS = '8901234567'                                     // the register's last wheel, starting from 0428

/* ============================================================
   Left · Diagonal Isometric Porcelain Roller Conveyor & Gliding Folio Cartons
   ============================================================ */
const CONVEYOR = (() => {
  // Conveyor runs diagonally from top-left (78, 84) to bottom-right (330, 344)
  // Axis vector u = (252, 260), normal cross-deck vector v = (68, -28)
  const x0 = 66, y0 = 96
  const dx = 256, dy = 248
  const vx = 68, vy = -26

  const pt = (t: number, s: number) => [r2(x0 + dx * t + vx * s), r2(y0 + dy * t + vy * s)] as const
  const p00 = pt(0, 0), p10 = pt(1, 0), p11 = pt(1, 1), p01 = pt(0, 1)

  // Slats one fifth of a pitch apart, from one pitch before the deck to its end; they ride the belt and are clipped to the deck
  let rollers = ''
  for (let i = -5; i <= 18; i++) {
    const ax = x0 + SLAT.x * i + vx * 0.06, ay = y0 + SLAT.y * i + vy * 0.06
    rollers += `<line x1="${r2(ax)}" y1="${r2(ay)}" x2="${r2(ax + vx * 0.88)}" y2="${r2(ay + vy * 0.88)}" stroke="#b6b0a5" stroke-width="0.65"/>`
  }

  // Support stanchion legs under the near rail
  const legs = [0.22, 0.56, 0.86].map((t) => {
    const top = pt(t, 0)
    return `<g>` +
      `<rect x="${r2(top[0] - 4)}" y="${r2(top[1] + 10)}" width="8" height="24" rx="1.5" fill="url(#${PFX}porcelain-h)" stroke="#888277" stroke-width="0.65"/>` +
      `<rect x="${r2(top[0] - 9)}" y="${r2(top[1] + 32)}" width="18" height="4.5" rx="1.2" fill="url(#${PFX}machined)" stroke="#888277" stroke-width="0.6"/>` +
    `</g>`
  }).join('')

  // Guardrail posts along near & far edges
  let posts = ''
  for (let i = 1; i <= 7; i++) {
    const t = i / 8
    const near = pt(t, 0), far = pt(t, 1)
    posts += `<line x1="${near[0]}" y1="${near[1]}" x2="${near[0]}" y2="${r2(near[1] - 10)}" stroke="#8d877c" stroke-width="1.2"/>` +
      `<line x1="${far[0]}" y1="${far[1]}" x2="${far[0]}" y2="${r2(far[1] - 10)}" stroke="#9e988d" stroke-width="1"/>`
  }

  // Isometric archival folio carton helper (drawn at origin, then translated along conveyor)
  const carton = (cx: number, cy: number, accent = false) =>
    `<g transform="translate(${cx} ${cy})">` +
      `<polygon points="0,12 22,2 44,12 22,22" fill="#2d261c" opacity="0.1"/>` +
      // Left-front face
      `<polygon points="0,-10 22,0 22,20 0,10" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.72"/>` +
      // Right-front face
      `<polygon points="22,0 44,-10 44,10 22,20" fill="url(#${PFX}machined)" stroke="#7c766b" stroke-width="0.72"/>` +
      // Top face
      `<polygon points="0,-10 22,-20 44,-10 22,0" fill="#ffffff" stroke="#7c766b" stroke-width="0.72"/>` +
      // Center seam tape + tiny index tag
      `<line x1="11" y1="-15" x2="33" y2="-5" stroke="#b3ada2" stroke-width="0.7"/>` +
      `<polygon points="28,3 38,-1.5 38,5.5 28,10" fill="${accent ? '#f5d98e' : '#ffffff'}" stroke="#8d877c" stroke-width="0.5"/>` +
    `</g>`

  return `<g class="tc-conveyor">` +
    // Ground drop shadow along conveyor path
    `<polygon points="${p00[0]},${r2(p00[1] + 28)} ${p10[0]},${r2(p10[1] + 28)} ${p11[0]},${r2(p11[1] + 18)} ${p01[0]},${r2(p01[1] + 18)}" fill="#2d261c" opacity="0.08" filter="url(#${PFX}soft-blur)"/>` +
    legs +
    // Far side rail depth skirt
    `<polygon points="${p01[0]},${p01[1]} ${p11[0]},${p11[1]} ${p11[0]},${r2(p11[1] + 12)} ${p01[0]},${r2(p01[1] + 12)}" fill="url(#${PFX}machined)" stroke="#888277" stroke-width="0.7"/>` +
    // Main conveyor deck surface
    `<polygon points="${p00[0]},${p00[1]} ${p10[0]},${p10[1]} ${p11[0]},${p11[1]} ${p01[0]},${p01[1]}" fill="url(#${PFX}porcelain-top)" stroke="#7c766b" stroke-width="0.8"/>` +
    `<g clip-path="url(#${PFX}deck-clip)"><g class="tc-belt">${rollers}</g></g>` +
    // Near side rail depth skirt with bolted flange rivets
    `<polygon points="${p00[0]},${p00[1]} ${p10[0]},${p10[1]} ${p10[0]},${r2(p10[1] + 13)} ${p00[0]},${r2(p00[1] + 13)}" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.8"/>` +
    rivetRow(p00[0] + 12, p00[1] + 18, p10[0] - 12, p10[1] - 4, 10, PFX, 1.05) +
    // Upper guardrails
    `<line x1="${p01[0]}" y1="${r2(p01[1] - 10)}" x2="${p11[0]}" y2="${r2(p11[1] - 10)}" stroke="#9a9489" stroke-width="1.3" stroke-linecap="round"/>` +
    posts +
    // Gliding archival folio cartons clipped neatly to the track envelope
    `<g clip-path="url(#${PFX}track-clip)">` +
      `<g class="tc-belt" mask="url(#${PFX}belt-fade)">` +
        carton(118 - PITCH.x, 134 - PITCH.y, false) +
        carton(118, 134, false) +
        carton(194, 208, false) +
        carton(270, 282, false) +
      `</g>` +
    `</g>` +
    // Near upper guardrail drawn in front of gliding cartons
    `<line x1="${p00[0]}" y1="${r2(p00[1] - 10)}" x2="${p10[0]}" y2="${r2(p10[1] - 10)}" stroke="#7c766b" stroke-width="1.4" stroke-linecap="round"/>` +
    `<line x1="${p00[0]}" y1="${r2(p00[1] - 10.7)}" x2="${p10[0]}" y2="${r2(p10[1] - 10.7)}" stroke="#ffffff" stroke-width="0.6" opacity="0.8"/>` +
  `</g>`
})()

/* ============================================================
   Center · Articulated 3-Joint Porcelain Robotic Sorter Arm on Bolted Turret
   ============================================================ */
const SORTER_ARM = (() => {
  return `<g class="tc-sorter">` +
    `<ellipse cx="326" cy="240" rx="34" ry="12" fill="#2d261c" opacity="0.1" filter="url(#${PFX}soft-blur)"/>` +
    // Flexible porcelain-sheathed power conduit linking turret to right console
    `<path d="M352 232 C374 232, 376 254, 404 254" fill="none" stroke="#7c766b" stroke-width="4.4" stroke-linecap="round"/>` +
    `<path d="M352 232 C374 232, 376 254, 404 254" fill="none" stroke="#f7f5ef" stroke-width="2.6" stroke-linecap="round"/>` +
    // Stepped cylindrical porcelain turret pedestal
    `<ellipse cx="326" cy="236" rx="28" ry="11" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.8"/>` +
    `<path d="M304 232 L308 196 L344 196 L348 232 A22 8 0 0 1 304 232 Z" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.8"/>` +
    `<ellipse cx="326" cy="196" rx="18" ry="6.5" fill="url(#${PFX}porcelain-top)" stroke="#7c766b" stroke-width="0.75"/>` +
    rivet(312, 232, PFX, 1.1) + rivet(326, 236, PFX, 1.1) + rivet(340, 232, PFX, 1.1) +

    // Cable pulse: one bead runs turret → console after each scan
    `<path d="M352 232 C374 232, 376 254, 404 254" fill="none" stroke="#7eb4cc" stroke-width="2.2" stroke-linecap="round" pathLength="100" class="tc-pulse"/>` +
  `</g>`
})()

// Drawn after the conveyor: the arm reaches over the belt, so it and its head sit above the cartons
const ARM = `<g class="tc-arm">` +
    // Arm held over the belt; only its scan head moves
    trussArm(326, 190, 286, 120, 16, 12, 3, PFX) +
    trussArm(286, 120, HEAD.x + 6, HEAD.y - 14, 12, 8.5, 3, PFX) +
    // Head housing on the wrist, telescoping nozzle inside it
    `<g class="tc-head" style="transform-box:view-box">` +
      `<rect x="${HEAD.x + 2.5}" y="${HEAD.y - 14}" width="7" height="16" rx="2" fill="url(#${PFX}machined)" stroke="#7c766b" stroke-width="0.6"/>` +
      `<path d="M${HEAD.x - 6} ${HEAD.y + 2} H${HEAD.x + 18} L${HEAD.x + 14} ${HEAD.y + 9} H${HEAD.x - 2} Z" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.7" stroke-linejoin="round"/>` +
      `<circle cx="${HEAD.x + 6}" cy="${HEAD.y + 5.5}" r="1.5" fill="#7eb4cc" class="tc-head-led"/>` +
      // Scan beam: from the nozzle down onto the lid, only while scanning
      `<path d="M${HEAD.x + 2} ${HEAD.y + 9} L${HEAD.x - 12} ${HEAD.y + 42} L${HEAD.x + 24} ${HEAD.y + 42} L${HEAD.x + 10} ${HEAD.y + 9} Z" fill="url(#${PFX}scan-beam)" class="tc-beam"/>` +
    `</g>` +
    `<circle cx="${HEAD.x + 6}" cy="${HEAD.y - 14}" r="4.6" fill="url(#${PFX}drum-outer)" stroke="#7c766b" stroke-width="0.7"/>` +
    bolt(HEAD.x + 6, HEAD.y - 14, PFX, 1.8, 30) +
`</g>`

/* ============================================================
   Right · Architectural Archival Index Magazine & Card-Deck Console (INDEX · VII)
   ============================================================ */
const INDEX_CONSOLE = (() => {
  // 5 archival cards seated inside top magazine slot — pop upward in cascade on [data-open]!
  const cards = [0, 1, 2, 3, 4].map((i) => {
    const cx = 422 + i * 24
    const accent = i === 2
    return `<g class="tc-lift tc-lift-${i + 1}">` +
      `<rect x="${cx}" y="124" width="20" height="44" rx="2" fill="${accent ? '#fbf3de' : '#ffffff'}" stroke="#7c766b" stroke-width="0.72"/>` +
      `<line x1="${cx + 3.5}" y1="133" x2="${cx + 16.5}" y2="133" stroke="${accent ? '#d9aa4e' : '#bbb5aa'}" stroke-width="0.7"/>` +
      `<line x1="${cx + 3.5}" y1="140" x2="${cx + 14.5}" y2="140" stroke="#ccc6ba" stroke-width="0.6"/>` +
      `<line x1="${cx + 3.5}" y1="146" x2="${cx + 16}" y2="146" stroke="#ccc6ba" stroke-width="0.6"/>` +
      `<circle cx="${cx + 10}" cy="128.5" r="1.2" fill="none" stroke="#9e988d" stroke-width="0.5"/>` +
    `</g>`
  }).join('')

  return `<g class="tc-console">` +
    `<ellipse cx="484" cy="312" rx="88" ry="10" fill="#2d261c" opacity="0.1" filter="url(#${PFX}soft-blur)"/>` +

    // Rising archival cards drawn behind the console front bezel
    cards +

    // Main monolithic white-porcelain index console cabinet
    `<rect x="404" y="154" width="160" height="148" rx="7" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.85"/>` +
    `<rect x="407" y="157" width="154" height="142" rx="5.5" fill="none" stroke="#ffffff" stroke-width="0.85" opacity="0.88"/>` +
    bolt(413, 163, PFX, 1.9, 20) + bolt(555, 163, PFX, 1.9, -28) +
    bolt(413, 293, PFX, 1.9, -15) + bolt(555, 293, PFX, 1.9, 32) +

    // Top slotted card magazine opening
    `<rect x="416" y="150" width="136" height="8" rx="2" fill="url(#${PFX}recess)" stroke="#888277" stroke-width="0.65"/>` +

    // Upper status & 4-digit mechanical catalog register (`0 4 2 8`)
    `<rect x="418" y="172" width="132" height="24" rx="3" fill="url(#${PFX}porcelain-top)" stroke="#bcb6ab" stroke-width="0.55"/>` +
    // Single restrained 3% warm-amber segmented status bar (like Factory's header!)
    `<rect x="424" y="178.5" width="38" height="11" rx="2" fill="url(#${PFX}recess)" stroke="#a39d92" stroke-width="0.5"/>` +
    `<rect x="426.5" y="181" width="18" height="6" rx="1" fill="url(#${PFX}accent-amber)" class="tc-bar-pulse"/>` +
    // 4-digit monochrome mechanical register
    `<rect x="488" y="176.5" width="56" height="15" rx="2" fill="url(#${PFX}recess)" stroke="#9a9489" stroke-width="0.55"/>` +
    ['0', '4', '2', ''].map((d, i) => {
      const dx = r2(491 + i * 12.8)
      const face = `<rect x="${dx}" y="178.5" width="11" height="11" rx="1" fill="#ffffff" stroke="#b9b3a8" stroke-width="0.45"/>`
      const digit = (ch: string, y: number) => `<text x="${r2(dx + 5.5)}" y="${r2(y)}" font-size="6.8" fill="#5d574e" text-anchor="middle" font-family="var(--font-mono, ui-monospace, monospace)">${ch}</text>`
      if (d) return face + digit(d, 186.2)
      // The counting wheel: a strip of digits behind an 11px window, stepped once per carton
      return face + `<g clip-path="url(#${PFX}wheel-clip)"><g class="tc-wheel">${[...DIGITS, DIGITS[0]!].map((ch, k) => digit(ch, 186.2 + k * 11)).join('')}</g></g>`
    }).join('') +

    // Recessed archival inspection bay with fine horizontal louver fins + gliding optical scan line
    `<rect x="418" y="204" width="132" height="62" rx="3.5" fill="url(#${PFX}recess)" stroke="#9a9489" stroke-width="0.65"/>` +
    `<rect x="422" y="208" width="124" height="54" rx="2" fill="#faf8f3" stroke="#cbc5b9" stroke-width="0.5"/>` +
    coolingFins(428, 216, 112, 38, 6, false) +
    `<line x1="428" y1="212" x2="428" y2="258" stroke="#7eb4cc" stroke-width="1.2" opacity="0.82" class="tc-scanner"/>` +

    // Bottom 4 miniature slotted drawer bays (Factory-style base compartments!)
    [0, 1, 2, 3].map((i) => {
      const bx = 418 + i * 33.5
      return `<rect x="${r2(bx)}" y="273" width="30" height="15" rx="2" fill="url(#${PFX}porcelain-top)" stroke="#9e988d" stroke-width="0.6"/>` +
        `<line x1="${r2(bx + 8)}" y1="280.5" x2="${r2(bx + 22)}" y2="280.5" stroke="#8d877c" stroke-width="1.1" stroke-linecap="round"/>`
    }).join('') +

    // Engraved model code on bottom plinth
    `<rect x="450" y="294" width="68" height="10" rx="1.8" fill="#ffffff" stroke="#a6a095" stroke-width="0.55"/>` +
    `<text x="484" y="300.8" font-size="5" fill="#6f695e" text-anchor="middle" letter-spacing="1.6" font-family="var(--font-mono, ui-monospace, monospace)">INDEX · VII</text>` +
  `</g>`
})()

export function typecaseSvg() {
  return `<svg class="iso iso-case" viewBox="0 0 640 400" role="img" aria-hidden="true">
    <defs>
      ${instrumentDefs(PFX, 640, 400)}
      <clipPath id="${PFX}track-clip"><polygon points="62,62 142,42 396,294 316,348"/></clipPath>
      <clipPath id="${PFX}deck-clip"><polygon points="66,96 322,344 390,318 134,70"/></clipPath>
      <clipPath id="${PFX}wheel-clip"><rect x="${r2(491 + 3 * 12.8)}" y="178.5" width="11" height="11"/></clipPath>
      <linearGradient id="${PFX}belt-ends" gradientUnits="userSpaceOnUse" x1="70" y1="70" x2="350" y2="340">
        <stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="14%" stop-color="#fff"/><stop offset="86%" stop-color="#fff"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <mask id="${PFX}belt-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="640" height="400"><rect x="0" y="0" width="640" height="400" fill="url(#${PFX}belt-ends)"/></mask>
      <linearGradient id="${PFX}scan-beam" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#9cc7da" stop-opacity="0.7"/><stop offset="100%" stop-color="#9cc7da" stop-opacity="0.08"/>
      </linearGradient>
    </defs>
    ${dotGridBackdrop(PFX, 640, 400, 354)}
    ${INDEX_CONSOLE}
    ${SORTER_ARM}
    ${CONVEYOR}
    ${ARM}
  </svg>`
}

// The wheel steps when the pulse reaches the console (48% of each cycle); ten cycles per turn, the last step lands on the strip's repeated first digit
const WHEEL = '0% { transform: translateY(0px); } ' + Array.from({ length: 10 }, (_, i) => `${r2(i * 10 + 4.8)}% { transform: translateY(${-11 * (i + 1)}px); }`).join(' ')

export const TYPECASE_CSS = `
@keyframes tc-belt { 0%, ${MOVE_FROM}% { transform: translate(0px, 0px); } 100% { transform: translate(${PITCH.x}px, ${PITCH.y}px); } }
@keyframes tc-head { 0% { transform: translateY(0px); } 7%, 26% { transform: translateY(16px); } 34%, 100% { transform: translateY(0px); } }
@keyframes tc-beam { 0%, 8% { opacity: 0; } 12%, 24% { opacity: 1; } 28%, 100% { opacity: 0; } }
@keyframes tc-led { 0%, 8% { opacity: 0.35; } 12%, 26% { opacity: 1; } 30%, 100% { opacity: 0.35; } }
@keyframes tc-pulse { 0%, 28% { stroke-dashoffset: 6; opacity: 0; } 30% { opacity: 1; } 46% { stroke-dashoffset: -100; opacity: 1; } 48%, 100% { stroke-dashoffset: -100; opacity: 0; } }
@keyframes tc-wheel { ${WHEEL} }
@keyframes tc-scan { 0%, 46% { transform: translateX(0px); } 70% { transform: translateX(110px); } 94%, 100% { transform: translateX(0px); } }
@keyframes tc-bar { 0%, 46% { opacity: 0.55; } 52% { opacity: 1; } 70%, 100% { opacity: 0.55; } }

.iso-case .tc-belt { animation: tc-belt ${CYCLE}s cubic-bezier(.45, 0, .55, 1) infinite; }
.iso-case .tc-head { animation: tc-head ${CYCLE}s ease-in-out infinite; }
.iso-case .tc-beam { opacity: 0; animation: tc-beam ${CYCLE}s linear infinite; }
.iso-case .tc-head-led { animation: tc-led ${CYCLE}s linear infinite; }
.iso-case .tc-pulse { stroke-dasharray: 6 200; stroke-dashoffset: 6; opacity: 0; animation: tc-pulse ${CYCLE}s linear infinite; }
.iso-case .tc-wheel { animation: tc-wheel ${CYCLE * 10}s step-end infinite; }
.iso-case .tc-scanner { animation: tc-scan ${CYCLE}s ease-in-out infinite; }
.iso-case .tc-bar-pulse { animation: tc-bar ${CYCLE}s ease-in-out infinite; }

.iso-case .tc-lift {
  transform: translateY(0px);
  transition: transform 0.68s cubic-bezier(.3, 1.45, .5, 1);
}
.iso-case .tc-lift-1 { transition-delay: 0ms; }
.iso-case .tc-lift-2 { transition-delay: 70ms; }
.iso-case .tc-lift-3 { transition-delay: 140ms; }
.iso-case .tc-lift-4 { transition-delay: 210ms; }
.iso-case .tc-lift-5 { transition-delay: 280ms; }

.iso-host:hover .iso-case .tc-lift { transform: translateY(-7px); }
.iso-host[data-open] .iso-case .tc-lift { transform: translateY(-22px); }

@media (prefers-reduced-motion: reduce) {
  .iso-case .tc-belt,
  .iso-case .tc-head,
  .iso-case .tc-beam,
  .iso-case .tc-head-led,
  .iso-case .tc-pulse,
  .iso-case .tc-wheel,
  .iso-case .tc-scanner,
  .iso-case .tc-bar-pulse { animation: none; }
  .iso-case .tc-lift { transition-duration: 1ms; transition-delay: 0ms; }
}
`
