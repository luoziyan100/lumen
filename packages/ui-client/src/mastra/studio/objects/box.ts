/**
 * [INPUT]: shared White-Porcelain CAD helpers in ./instrument.ts; text & wrapText in ./iso.ts; locale labels (studio.objects.box) and newest takeaway words
 * [OUTPUT]: boxSvg({ labels, words }): white-porcelain takeaway box SVG (260×220 for the 200px Topics sidebar: hinged lid, winding
 *           wheel on the side, amber pilot, tabbed cards and the front card holding the person's own words); boxWords(text, stamp); BOX_CARD;
 *           BOX_CSS (hover cracks the lid, open folds the lid's top face onto the hinge then raises its inner face, wheel turns with it)
 * [POS]: object 1 of studio/objects/, shown under the topic list. Both lid faces turn about one hinge line (HINGE). Every dynamic
 *        string is escaped by iso.ts's text() (escapeXml); uniquely prefixed ids (`bx-`)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { text, wrapText } from './iso.ts'
import { bolt, coolingFins, dotGridBackdrop, gearPath, instrumentDefs, rivet, rivetRow, spinKeyframes } from './instrument.ts'

const PFX = 'bx-'

/*
 * The lid turns on one hinge line at the back of the box (y = HINGE). Opening folds the lid's top face back
 * onto that line, then its inner face rises from it; closing runs the same two steps in reverse. The winding
 * wheel on the side turns half a turn as the lid goes, so the motion has a cause.
 */
const HINGE = 98

export interface BoxLabels { plaque: string; lid: string; lidSub: string; tabs: readonly string[] }
/** The front card: two lines of the person's own words and the stamp above them; null leaves the card blank */
export interface BoxWords { stamp: string; lines: string[] }
/** Where the front card's words go: wrap to this width at this size, two lines at most */
export const BOX_CARD = { width: 87, size: 5.6, lines: 2 }

/** A takeaway as the front card: the stamp and its words wrapped to two lines (… when longer); null or blank text leaves the card blank */
export function boxWords(raw: string | null | undefined, stamp: string): BoxWords | null {
  const lines = wrapText(raw ?? '', BOX_CARD.width, BOX_CARD.size, BOX_CARD.lines)
  return lines.length ? { stamp, lines } : null
}

/* ============================================================
   Right Shoulder · Flush Monochrome Porcelain Escapement Wheel
   ============================================================ */
const SIDE_ESCAPEMENT = (() => {
  const cx = 218, cy = 152
  return `<g class="bx-side-wind">` +
    `<rect x="204" y="146" width="12" height="12" rx="1.5" fill="url(#${PFX}machined)" stroke="#888277" stroke-width="0.65"/>` +
    `<g class="bx-key-wind" style="transform-box:view-box;transform-origin:${cx}px ${cy}px">` +
    `<g class="bx-key-spin" style="transform-box:view-box;transform-origin:${cx}px ${cy}px">` +
      `<path d="${gearPath(cx, cy, 15.5, 12.8, 14)}" fill="url(#${PFX}machined)" stroke="#857f74" stroke-width="0.6"/>` +
      `<circle cx="${cx}" cy="${cy}" r="9.5" fill="url(#${PFX}porcelain-top)" stroke="#9a9489" stroke-width="0.55"/>` +
      `<line x1="${cx - 7}" y1="${cy}" x2="${cx + 7}" y2="${cy}" stroke="#857f74" stroke-width="0.8"/>` +
      `<line x1="${cx}" y1="${cy - 7}" x2="${cx}" y2="${cy + 7}" stroke="#857f74" stroke-width="0.8"/>` +
      `<circle cx="${cx}" cy="${cy}" r="3.2" fill="url(#${PFX}porcelain-rivet)" stroke="#7c766b" stroke-width="0.55"/>` +
    `</g>` +
    `</g>` +
  `</g>`
})()

export function boxSvg({ labels, words }: { labels: BoxLabels; words: BoxWords | null }) {
  const bx = 48, by = 114, bw = 160, bh = 76
  const cardX = 66, cardY = 84, cardW = 124, cardH = 54

  const cardText = words
    ? `<g clip-path="url(#${PFX}card-clip)">` +
        text(cardX + 9, cardY + 12.5, 4.8, words.stamp, 'fill="#8a8479"') +
        words.lines.slice(0, BOX_CARD.lines).map((value, i) =>
          text(cardX + 9, cardY + 23.2 + i * 9.5, BOX_CARD.size, value, 'fill="#4d473e"'),
        ).join('') +
      `</g>`
    : ''

  return `<svg class="iso iso-box" viewBox="0 0 260 220" role="img" aria-hidden="true">
    <defs>
      ${instrumentDefs(PFX, 260, 220)}
      <clipPath id="${PFX}card-clip"><rect x="${cardX + 4}" y="${cardY + 4}" width="${cardW - 8}" height="${cardH - 8}"/></clipPath>
    </defs>
    ${dotGridBackdrop(PFX, 260, 220, 198)}
    <ellipse cx="128" cy="200" rx="90" ry="9" fill="#2d261c" opacity="0.11" filter="url(#${PFX}soft-blur)"/>
    ${SIDE_ESCAPEMENT}

    <!-- Inner porcelain lid plaque revealed behind rising cards when open -->
    <g class="bx-lid-back">
      <rect x="${bx + 6}" y="${HINGE - 74}" width="${bw - 12}" height="74" rx="5" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.82"/>
      <rect x="${bx + 12}" y="${HINGE - 68}" width="${bw - 24}" height="62" rx="3" fill="#ffffff" stroke="#ccc6ba" stroke-width="0.55"/>
      ${text(128, HINGE - 52, 7.4, labels.lid, 'text-anchor="middle" fill="#554f46"')}
      ${text(128, HINGE - 41, 4.9, labels.lidSub, 'text-anchor="middle" fill="#928c81"')}
      <line x1="90" y1="${HINGE - 35}" x2="166" y2="${HINGE - 35}" stroke="#ddd7cc" stroke-width="0.6"/>
      ${bolt(bx + 15, HINGE - 64, PFX, 1.35, 20)}${bolt(bx + bw - 15, HINGE - 64, PFX, 1.35, -20)}
      <!-- Hinge knuckles along the bottom edge: the line both lid faces turn about -->
      <rect x="${bx + 22}" y="${HINGE - 3}" width="14" height="5" rx="2" fill="url(#${PFX}machined)" stroke="#7c766b" stroke-width="0.6"/>
      <rect x="${bx + bw - 36}" y="${HINGE - 3}" width="14" height="5" rx="2" fill="url(#${PFX}machined)" stroke="#7c766b" stroke-width="0.6"/>
    </g>

    <!-- Recessed interior tray cavity -->
    <rect x="${bx + 6}" y="${by - 6}" width="${bw - 12}" height="24" rx="2.5" fill="url(#${PFX}recess)" stroke="#9a9489" stroke-width="0.65"/>

    <!-- Stacked tabbed archival cards that rise smoothly on hover/open -->
    <g class="bx-cards">
      <g class="bx-card-3">
        <path d="M82 94 V84 Q82 82 84 82 H114 Q116 82 116 84 V94" fill="#f7f5ef" stroke="#8d877c" stroke-width="0.65"/>
        ${text(99, 90.2, 4.8, labels.tabs[0] ?? '', 'text-anchor="middle" fill="#6b655c"')}
        <rect x="72" y="94" width="112" height="36" rx="2" fill="#faf8f3" stroke="#9e988d" stroke-width="0.65"/>
      </g>
      <g class="bx-card-2">
        <path d="M136 96 V86 Q136 84 138 84 H168 Q170 84 170 86 V96" fill="#fcf5e3" stroke="#9a8d74" stroke-width="0.65"/>
        ${text(153, 92.2, 4.8, labels.tabs[1] ?? '', 'text-anchor="middle" fill="#6b614e"')}
        <rect x="69" y="96" width="118" height="38" rx="2" fill="#fdfaf0" stroke="#b3a78f" stroke-width="0.65"/>
      </g>
      <g class="bx-card-1">
        <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="2.2" fill="url(#${PFX}paper-grad)" stroke="#7c766b" stroke-width="0.75"/>
        <line x1="${cardX + 7}" y1="${cardY + 15.5}" x2="${cardX + cardW - 7}" y2="${cardY + 15.5}" stroke="#c8bdb0" stroke-width="0.65"/>
        <line x1="${cardX + 7}" y1="${cardY + 25.5}" x2="${cardX + cardW - 7}" y2="${cardY + 25.5}" stroke="#e6e1d7" stroke-width="0.5"/>
        <line x1="${cardX + 7}" y1="${cardY + 35}" x2="${cardX + cardW - 7}" y2="${cardY + 35}" stroke="#e6e1d7" stroke-width="0.5"/>
        <line x1="${cardX + 7}" y1="${cardY + 44.5}" x2="${cardX + cardW - 18}" y2="${cardY + 44.5}" stroke="#e6e1d7" stroke-width="0.5"/>
        ${cardText}
      </g>
    </g>

    <!-- Main sculpted white-porcelain cassette vault body -->
    <g class="bx-body">
      <rect x="60" y="188" width="24" height="7.5" rx="2" fill="url(#${PFX}machined-h)" stroke="#857f74" stroke-width="0.68"/>
      <rect x="172" y="188" width="24" height="7.5" rx="2" fill="url(#${PFX}machined-h)" stroke="#857f74" stroke-width="0.68"/>
      <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="6.5" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.85"/>
      <rect x="${bx + 3}" y="${by + 3}" width="${bw - 6}" height="${bh - 6}" rx="4.5" fill="none" stroke="#ffffff" stroke-width="0.85" opacity="0.88"/>
      <rect x="${bx + 6}" y="${by + 8}" width="${bw - 12}" height="${bh - 14}" rx="3.5" fill="url(#${PFX}porcelain-top)" stroke="#d2ccc0" stroke-width="0.55"/>
      ${bolt(bx + 10, by + 13, PFX, 1.6, 26)}${bolt(bx + bw - 10, by + 13, PFX, 1.6, -24)}
      ${bolt(bx + 10, by + bh - 10, PFX, 1.6, -18)}${bolt(bx + bw - 10, by + bh - 10, PFX, 1.6, 36)}
      <!-- Subtle side cooling vent louvers -->
      ${coolingFins(bx + 12, by + 35, 16, 16, 4, false)}
      ${coolingFins(bx + bw - 28, by + 35, 16, 16, 4, false)}

      <!-- Recessed brushed-porcelain label bezel holding labels.plaque -->
      <rect x="92" y="136" width="72" height="23" rx="2.5" fill="url(#${PFX}recess)" stroke="#9a9489" stroke-width="0.65"/>
      <rect x="95" y="139" width="66" height="17" rx="1.5" fill="#ffffff" stroke="#c7c1b6" stroke-width="0.45"/>
      ${text(128, 150.5, 8.2, labels.plaque, 'text-anchor="middle" letter-spacing="1.5" fill="#4f4940"')}
      ${rivet(94, 147.5, PFX, 0.85)}${rivet(162, 147.5, PFX, 0.85)}

      <!-- Bottom engraved code & lone 2.4px warm-amber jewel pilot (3% accent!) -->
      <rect x="104" y="169" width="48" height="10" rx="1.8" fill="#ffffff" stroke="#b6b0a5" stroke-width="0.5"/>
      <text x="128" y="175.8" font-size="4.6" fill="#736d63" text-anchor="middle" letter-spacing="1.4" font-family="var(--font-mono, ui-monospace, monospace)">VAULT · I</text>
      <circle cx="88" cy="174" r="2.2" fill="#e6b655" stroke="#8d877c" stroke-width="0.5" class="bx-jewel-glow"/>
      <!-- Recessed latch receiver -->
      <rect x="120" y="${by + 3}" width="16" height="8" rx="1.5" fill="url(#${PFX}machined)" stroke="#888277" stroke-width="0.6"/>
      <circle cx="128" cy="${by + 7}" r="1.4" fill="#7c766b"/>
    </g>

    <!-- Hinged chamfered white-porcelain lid & monochrome clasp -->
    <g class="bx-lid-front">
      <path d="M${bx - 2} ${by + 1} L${bx + 4} ${by - 14} Q${bx + 6} ${by - 17} ${bx + 11} ${by - 17} L${bx + bw - 11} ${by - 17} Q${bx + bw - 6} ${by - 17} ${bx + bw - 4} ${by - 14} L${bx + bw + 2} ${by + 1} Z" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.85"/>
      <line x1="${bx + 10}" y1="${by - 14}" x2="${bx + bw - 10}" y2="${by - 14}" stroke="#ffffff" stroke-width="0.85" opacity="0.88"/>
      ${rivetRow(bx + 14, by - 6, bx + bw - 14, by - 6, 7, PFX, 0.95)}
      <rect x="120" y="${by - 7}" width="16" height="12" rx="2" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.72"/>
      <circle cx="128" cy="${by - 1.5}" r="1.6" fill="#ffffff" stroke="#7c766b" stroke-width="0.55"/>
    </g>
  </svg>`
}

export const BOX_CSS = `
${spinKeyframes('bx-spin')}
@keyframes bx-jewel { 0%, 100% { opacity: 0.52; } 50% { opacity: 1; } }

.iso-box .bx-key-spin { animation: bx-spin 18s linear infinite; }
.iso-box .bx-jewel-glow { animation: bx-jewel 3.8s ease-in-out infinite; }

.iso-box .bx-key-wind { transform: rotate(0deg); transition: transform 0.9s cubic-bezier(.45, 0, .55, 1); }

/* Closing: the inner face falls first, then the top face swings back down */
.iso-box .bx-lid-back {
  transform: scaleY(0);
  transform-box: view-box;
  transform-origin: 128px ${HINGE}px;
  transition: transform 0.32s cubic-bezier(.5, 0, .9, .5) 0s;
}
.iso-box .bx-lid-front {
  transform: scaleY(1);
  transform-box: view-box;
  transform-origin: 128px ${HINGE - 1}px;
  transition: transform 0.36s cubic-bezier(.1, .5, .3, 1) 0.3s;
}
.iso-box .bx-card-1,
.iso-box .bx-card-2,
.iso-box .bx-card-3 {
  opacity: 0;
  transform: translateY(28px);
  transition: transform 0.5s cubic-bezier(.22, 1, .36, 1), opacity 0.3s ease;
}

/* Hover: the lid cracks open on its hinge */
.iso-host:hover .iso-box .bx-lid-front { transform: scaleY(0.82); transition-delay: 0s; }
.iso-host:hover .iso-box .bx-key-wind { transform: rotate(40deg); }
.iso-host:hover .iso-box .bx-card-1 { opacity: 1; transform: translateY(20px); }

/* Open: the top face folds back to the hinge, then the inner face stands up from it */
.iso-host[data-open] .iso-box .bx-key-wind { transform: rotate(180deg); }
.iso-host[data-open] .iso-box .bx-lid-front { transform: scaleY(0); transition: transform 0.32s cubic-bezier(.5, 0, .9, .5) 0s; }
.iso-host[data-open] .iso-box .bx-lid-back { transform: scaleY(1); transition: transform 0.42s cubic-bezier(.1, .6, .3, 1) 0.3s; }
.iso-host[data-open] .iso-box .bx-card-3 { opacity: 1; transform: translateY(0px); transition-delay: 0.5s; }
.iso-host[data-open] .iso-box .bx-card-2 { opacity: 1; transform: translateY(-4px); transition-delay: 0.56s; }
.iso-host[data-open] .iso-box .bx-card-1 { opacity: 1; transform: translateY(-12px); transition-delay: 0.62s; }

@media (prefers-reduced-motion: reduce) {
  .iso-box .bx-key-spin,
  .iso-box .bx-jewel-glow { animation: none; }
  .iso-box .bx-key-wind,
  .iso-box .bx-lid-front,
  .iso-box .bx-lid-back,
  .iso-box .bx-card-1,
  .iso-box .bx-card-2,
  .iso-box .bx-card-3 { transition-duration: 1ms; transition-delay: 0s; }
}
`
