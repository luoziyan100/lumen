/**
 * [INPUT]: shared White-Porcelain CAD helpers in ./instrument.ts; XML-escaping text brush in ./iso.ts; locale labels (studio.objects.cabinet)
 * [OUTPUT]: cabinetSvg({ labels }): white-porcelain index cabinet SVG (280×340 for the 220px Materials pane: plinth, body and cornice
 *           as oblique blocks sharing one DEPTH, 2×3 flush drawers with shadowed reveals, twin microfilm reels on the cornice's top face,
 *           and one drawer that is a real box: slot, tray, right side, standing index cards); CABINET_CSS (reels/film, hover/open pull
 *           along −DEPTH with cards rising, reduced-motion guard)
 * [POS]: object 2 of studio/objects/, shown in empty Materials. The open drawer shows only where it stands outside the cabinet (a static
 *        clip: its slot swept out by the full pull). Labels are escaped via text() (escapeXml); uniquely prefixed ids (`cb-`)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { text } from './iso.ts'
import { bolt, coolingFins, dotGridBackdrop, gearPath, instrumentDefs, prism, r2, rivet, rivetRow, spinKeyframes } from './instrument.ts'

const PFX = 'cb-'

export interface CabinetLabels {
  /** Three rows of two drawer labels, top first */
  drawers: readonly (readonly string[])[]
  /** The two card tabs in the open drawer */
  tabs: readonly string[]
  /** The sample card in the open drawer: its stamp and two lines */
  stamp: string
  card: readonly string[]
}

const MOVING = { c: 0, r: 1 }

/* ============================================================
   Top Machined Monochrome Microfilm Reel Transport Bridge
   ============================================================ */
const TOP_REELS = (() => {
  const reel = (cx: number, cy: number, cls: string) => {
    let spokes = ''
    for (let i = 0; i < 3; i++) {
      const a = (i * 120 - 90) * (Math.PI / 180)
      spokes += `<line x1="${cx}" y1="${cy}" x2="${r2(cx + Math.cos(a) * 14)}" y2="${r2(cy + Math.sin(a) * 14)}" stroke="#8d877c" stroke-width="1.8" stroke-linecap="round"/>`
    }
    return `<g class="${cls}" style="transform-box:view-box;transform-origin:${cx}px ${cy}px">` +
      `<circle cx="${cx}" cy="${cy}" r="18.5" fill="url(#${PFX}drum-outer)" stroke="#7c766b" stroke-width="0.8"/>` +
      `<circle cx="${cx}" cy="${cy}" r="15" fill="url(#${PFX}recess)" stroke="#a39d92" stroke-width="0.55"/>` +
      spokes +
      `<path d="${gearPath(cx, cy, 9.5, 7.8, 12)}" fill="url(#${PFX}machined)" stroke="#888277" stroke-width="0.5"/>` +
      `<circle cx="${cx}" cy="${cy}" r="4.2" fill="url(#${PFX}porcelain-rivet)" stroke="#7c766b" stroke-width="0.6"/>` +
      `<circle cx="${cx}" cy="${cy}" r="1.4" fill="#ffffff"/>` +
    `</g>`
  }

  return `<g class="cb-reels">` +
    `<rect x="92" y="64" width="8" height="20" rx="1.5" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.72"/>` +
    `<rect x="180" y="64" width="8" height="20" rx="1.5" fill="url(#${PFX}porcelain-h)" stroke="#7c766b" stroke-width="0.72"/>` +
    // Backlit architectural microfiche strip housing
    `<rect x="96" y="48" width="88" height="17" rx="3" fill="url(#${PFX}porcelain-v)" stroke="#7c766b" stroke-width="0.78"/>` +
    `<rect x="106" y="51.5" width="68" height="10" rx="1.8" fill="#ffffff" stroke="#a6a095" stroke-width="0.55"/>` +
    `<g clip-path="url(#${PFX}film-clip)">` +
      `<g class="cb-film-strip">` +
        Array.from({ length: 14 }, (_, i) => {
          const x = 94 + i * 11
          return `<rect x="${x}" y="53.2" width="8" height="6.6" rx="0.8" fill="#e5e0d6" stroke="#b6b0a5" stroke-width="0.4"/>` +
            `<line x1="${x + 1.5}" y1="55.6" x2="${x + 6.5}" y2="55.6" stroke="#8d877c" stroke-width="0.5"/>` +
            `<line x1="${x + 1.5}" y1="58" x2="${x + 5.2}" y2="58" stroke="#a6a095" stroke-width="0.45"/>`
        }).join('') +
      `</g>` +
    `</g>` +
    // Single hairline warm-amber optical reading slit (3% accent!)
    `<line x1="140" y1="50" x2="140" y2="63" stroke="#e5b34f" stroke-width="1.15" class="cb-pilot"/>` +
    `<path d="M96 36.5 L184 36.5" stroke="#a6a095" stroke-width="0.75" stroke-dasharray="2 2"/>` +
    reel(96, 56, 'cb-reel-l') +
    reel(184, 56, 'cb-reel-r') +
  `</g>`
})()

/* ============================================================
   Volume: one oblique depth for the whole cabinet
   ------------------------------------------------------------
   Depth runs up-right by DEPTH. The body, cornice and plinth show their top and
   right faces along it; every drawer slot is a hole along it, and the open
   drawer slides out against it (down-left), so the pull reads as coming
   toward the viewer instead of sliding across a flat front.
   ============================================================ */
const DEPTH = { x: 20, y: -14 }
const PULL = { hover: 0.3, open: 0.85 }                       // fraction of DEPTH the drawer travels out
const CARD_DEPTHS = [0.62, 0.4, 0.18]                         // back, middle, front card, as fractions of DEPTH inside the drawer

const B = { x: 50, y: 88, w: 164, h: 202 }                    // body front
const CW = 68, CH = 52, GX = 8, GY = 10, PAD_X = 10, PAD_Y = 14

const at = (k: number) => ({ x: DEPTH.x * k, y: DEPTH.y * k })
const poly = (pts: number[][]) => pts.map(([a, b], i) => `${i ? 'L' : 'M'}${r2(a!)} ${r2(b!)}`).join(' ') + ' Z'

/** Closed drawer front: flush, with the shadowed reveal on its left and bottom where the slot's walls show */
function drawerFace(x: number, y: number, w: number, h: number, label: string, active: boolean) {
  const cx = x + w / 2
  return `<g>` +
    `<path d="M${x - 1.4} ${y + 1} V${y + h + 1.4} H${x + w - 1}" fill="none" stroke="#b9b3a8" stroke-width="1.6"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.6" fill="url(#${PFX}porcelain-v)" stroke="${active ? '#6f695e' : '#8d877c'}" stroke-width="${active ? 0.85 : 0.72}"/>` +
    `<path d="M${x + 2} ${y + h - 1.2} H${x + w - 2.4} V${y + 2}" fill="none" stroke="#d3cdc2" stroke-width="0.9"/>` +
    `<path d="M${x + 1.6} ${y + h - 3} V${y + 1.6} H${x + w - 3}" fill="none" stroke="#ffffff" stroke-width="0.85" opacity="0.9"/>` +
    // Recessed label frame
    `<rect x="${cx - 24}" y="${y + 9}" width="48" height="14.5" rx="1.8" fill="url(#${PFX}recess)" stroke="#a39d92" stroke-width="0.55"/>` +
    `<rect x="${cx - 22}" y="${y + 11}" width="44" height="10.5" rx="1" fill="#ffffff" stroke="#ccc6ba" stroke-width="0.4"/>` +
    text(cx, y + 18.4, 6.1, label, 'text-anchor="middle" fill="#4f4940"') +
    rivet(cx - 22.5, y + 16.2, PFX, 0.75) + rivet(cx + 22.5, y + 16.2, PFX, 0.75) +
    // Bar pull standing proud of the face: its own shadow down-left, then the bar
    `<rect x="${cx - 13.2}" y="${y + 33.6}" width="26" height="5.5" rx="2.5" fill="#2d261c" opacity="0.12"/>` +
    `<rect x="${cx - 13}" y="${y + 32}" width="26" height="5.5" rx="2.5" fill="url(#${PFX}machined)" stroke="#888277" stroke-width="0.62"/>` +
    `<line x1="${cx - 9}" y1="${y + 33.6}" x2="${cx + 9}" y2="${y + 33.6}" stroke="#ffffff" stroke-width="0.6" opacity="0.8"/>` +
  `</g>`
}

/** The slot behind a drawer: a dark hole whose left and bottom inner walls recede along DEPTH */
function slot(x: number, y: number, w: number, h: number) {
  const d = DEPTH
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#bdb7ab" stroke="#8d877c" stroke-width="0.7"/>` +
    `<g clip-path="url(#${PFX}slot-clip)">` +
      `<path d="${poly([[x, y], [x + d.x, y + d.y], [x + d.x, y + h + d.y], [x, y + h]])}" fill="#cfc9bd"/>` +
      `<path d="${poly([[x, y + h], [x + d.x, y + h + d.y], [x + w, y + h + d.y], [x + w, y + h]])}" fill="#d8d2c7"/>` +
    `</g>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#8d877c" stroke-width="0.7"/>`
}

/** The drawer that opens: a real box (front, open top, right side) slid out by CSS along −DEPTH, clipped to where it stands outside the cabinet */
function movingDrawer(x: number, y: number, w: number, h: number, labels: CabinetLabels) {
  const label = labels.drawers[MOVING.r]?.[MOVING.c] ?? ''
  const d = DEPTH
  // Tray: rim and dark well of the open top
  const tray = `<path d="${poly([[x, y], [x + d.x, y + d.y], [x + w + d.x, y + d.y], [x + w, y]])}" fill="url(#${PFX}porcelain-top)" stroke="#8d877c" stroke-width="0.65"/>` +
    `<path d="${poly([[x + 3, y - 0.5], [x + 3 + d.x * 0.9, y + d.y * 0.9 - 0.5], [x + w - 3 + d.x * 0.9, y + d.y * 0.9 - 0.5], [x + w - 3, y - 0.5]])}" fill="url(#${PFX}recess)" stroke="#a39d92" stroke-width="0.5"/>`
  const side = `<path d="${poly([[x + w, y], [x + w + d.x, y + d.y], [x + w + d.x, y + h + d.y], [x + w, y + h]])}" fill="url(#${PFX}porcelain-side)" stroke="#8d877c" stroke-width="0.65"/>`
  // Index cards standing across the tray, tabs up; deeper cards sit higher and further right
  const card = (k: number, cls: string, fill: string, stroke: string, tabX: number, tab: string, body = '') => {
    const o = at(k), cx0 = x + 4 + o.x, cy0 = y + o.y - 8
    return `<g class="${cls}">` +
      `<path d="M${r2(cx0 + tabX)} ${r2(cy0)} V${r2(cy0 - 6)} Q${r2(cx0 + tabX)} ${r2(cy0 - 8)} ${r2(cx0 + tabX + 2)} ${r2(cy0 - 8)} H${r2(cx0 + tabX + 24)} Q${r2(cx0 + tabX + 26)} ${r2(cy0 - 8)} ${r2(cx0 + tabX + 26)} ${r2(cy0 - 6)} V${r2(cy0)}" fill="${fill}" stroke="${stroke}" stroke-width="0.6"/>` +
      (tab ? text(r2(cx0 + tabX + 13), r2(cy0 - 2.2), 4.4, tab, 'text-anchor="middle" fill="#6b655c"') : '') +
      `<rect x="${r2(cx0)}" y="${r2(cy0)}" width="${w - 8}" height="${h - 6}" rx="1.4" fill="${fill}" stroke="${stroke}" stroke-width="0.6"/>` +
      body +
    `</g>`
  }
  const front = at(CARD_DEPTHS[2]!)
  const fx = x + 4 + front.x, fy = y + front.y - 8
  const sample = `<line x1="${r2(fx + 4)}" y1="${r2(fy + 8)}" x2="${r2(fx + w - 12)}" y2="${r2(fy + 8)}" stroke="#c8bdb0" stroke-width="0.55"/>` +
    `<g clip-path="url(#${PFX}card-clip)">` +
      text(r2(fx + 4), r2(fy + 6), 4, labels.stamp, 'fill="#8a8479"') +
      text(r2(fx + 4), r2(fy + 14.5), 4.9, labels.card[0] ?? '', 'fill="#4d473e"') +
      text(r2(fx + 4), r2(fy + 21.5), 4.9, labels.card[1] ?? '', 'fill="#4d473e"') +
    `</g>`
  const clipped = (inner: string) => `<g clip-path="url(#${PFX}pull-clip)"><g class="cb-drawer-slide">${inner}</g></g>`
  return slot(x, y, w, h) +
    clipped(tray) +
    `<g class="cb-drawer-slide">` +
      card(CARD_DEPTHS[0]!, 'cb-card cb-card-back', '#f7f5ef', '#8d877c', 34, labels.tabs[0] ?? '') +
      card(CARD_DEPTHS[1]!, 'cb-card cb-card-mid', '#fcf5e3', '#9a8d74', 6, labels.tabs[1] ?? '') +
      card(CARD_DEPTHS[2]!, 'cb-card cb-card-front', '#fffdf8', '#7c766b', 20, '', sample) +
    `</g>` +
    clipped(side) +
    `<g class="cb-drawer-slide">` +
      `<rect x="${x + 4}" y="${y + h - 3}" width="${w - 2}" height="8" rx="3" fill="#2d261c" class="cb-drawer-shadow" filter="url(#${PFX}soft-blur)"/>` +
      drawerFace(x, y, w, h, label, true) +
    `</g>`
}

export function cabinetSvg({ labels }: { labels: CabinetLabels }) {
  let staticDrawers = ''
  let moving = ''
  let mx = 0, my = 0
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      const dx = B.x + PAD_X + c * (CW + GX)
      const dy = B.y + PAD_Y + r * (CH + GY)
      if (r === MOVING.r && c === MOVING.c) { moving = movingDrawer(dx, dy, CW, CH, labels); mx = dx; my = dy }
      else staticDrawers += drawerFace(dx, dy, CW, CH, labels.drawers[r]?.[c] ?? '', false)
    }
  }
  // Where the drawer may show outside the cabinet: its slot swept out along −DEPTH by the full pull
  const out = at(-PULL.open)
  const pullClip = poly([[mx, my], [mx + CW, my], [mx + CW, my + CH], [mx + CW + out.x, my + CH + out.y], [mx + out.x, my + CH + out.y], [mx + out.x, my + out.y]])
  const frontCard = at(CARD_DEPTHS[2]!)
  // Louvres on the right face follow its slope
  const slope = DEPTH.y / DEPTH.x
  let louvres = ''
  for (let i = 0; i < 6; i++) {
    const y0 = B.y + 46 + i * 5
    louvres += `<line x1="${B.x + B.w + 4}" y1="${r2(y0 + 4 * slope)}" x2="${B.x + B.w + DEPTH.x - 4}" y2="${r2(y0 + (DEPTH.x - 4) * slope)}" stroke="#a39d92" stroke-width="0.6"/>`
  }

  return `<svg class="iso iso-cabinet" viewBox="0 0 280 340" role="img" aria-hidden="true">
    <defs>
      ${instrumentDefs(PFX, 280, 340)}
      <clipPath id="${PFX}film-clip"><rect x="106" y="51.5" width="68" height="10" rx="1.8"/></clipPath>
      <clipPath id="${PFX}card-clip"><rect x="${r2(mx + 4 + frontCard.x)}" y="${r2(my + frontCard.y - 8)}" width="${CW - 10}" height="${CH - 8}"/></clipPath>
      <clipPath id="${PFX}slot-clip"><rect x="${mx}" y="${my}" width="${CW}" height="${CH}"/></clipPath>
      <clipPath id="${PFX}pull-clip"><path d="${pullClip}"/></clipPath>
    </defs>
    ${dotGridBackdrop(PFX, 280, 340, 318)}
    <ellipse cx="146" cy="318" rx="104" ry="10" fill="#2d261c" opacity="0.11" filter="url(#${PFX}soft-blur)"/>

    <g class="cb-chassis">
      <!-- Feet, plinth, body and cornice share one depth -->
      <rect x="62" y="306" width="24" height="8" rx="2" fill="url(#${PFX}machined-h)" stroke="#857f74" stroke-width="0.7"/>
      <rect x="182" y="306" width="24" height="8" rx="2" fill="url(#${PFX}machined-h)" stroke="#857f74" stroke-width="0.7"/>
      ${prism(44, 290, 176, 16, DEPTH.x, DEPTH.y, PFX, 'porcelain-h')}
      ${coolingFins(52, 295.5, 22, 7, 4, false)}
      ${coolingFins(190, 295.5, 22, 7, 4, false)}
      <rect x="114" y="293" width="56" height="10.5" rx="1.8" fill="#ffffff" stroke="#a6a095" stroke-width="0.55"/>
      <text x="142" y="300" font-size="5.2" fill="#6f695e" text-anchor="middle" letter-spacing="1.8" font-family="var(--font-mono, ui-monospace, monospace)">ARCH · VI</text>
      ${prism(B.x, B.y, B.w, B.h, DEPTH.x, DEPTH.y, PFX)}
      ${louvres}
      ${prism(44, 78, 176, 12, DEPTH.x, DEPTH.y, PFX, 'porcelain-h')}
      ${rivetRow(52, 84, 212, 84, 9, PFX, 0.95)}
      ${bolt(57, 96, PFX, 1.7, 25)}${bolt(207, 96, PFX, 1.7, -22)}
      ${bolt(57, 283, PFX, 1.7, -15)}${bolt(207, 283, PFX, 1.7, 38)}
      ${staticDrawers}
      ${moving}
    </g>
    <g transform="translate(${DEPTH.x / 2 + 2} ${DEPTH.y / 2 + 3})">${TOP_REELS}</g>
  </svg>`
}

export const CABINET_CSS = `
${spinKeyframes('cb-spin')}
@keyframes cb-film { 0% { transform: translateX(0px); } 100% { transform: translateX(-22px); } }
@keyframes cb-pilot-glow { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }

.iso-cabinet .cb-reel-l { animation: cb-spin 20s linear infinite; }
.iso-cabinet .cb-reel-r { animation: cb-spin 20s linear infinite; }
.iso-cabinet .cb-film-strip { animation: cb-film 4.8s linear infinite; }
.iso-cabinet .cb-pilot { animation: cb-pilot-glow 3.4s ease-in-out infinite; }

/* The drawer travels along −DEPTH; its cards rise out of the tray once it is clear of the cabinet */
.iso-cabinet .cb-drawer-slide { transform: translate(0px, 0px); transition: transform 0.72s cubic-bezier(.22, 1, .36, 1); }
.iso-cabinet .cb-drawer-shadow { opacity: 0; transition: opacity 0.72s ease; }
.iso-cabinet .cb-card { opacity: 0; transform: translateY(10px); transition: transform 0.72s cubic-bezier(.22, 1, .36, 1), opacity 0.4s ease; }
.iso-cabinet .cb-card-mid { transition-delay: 40ms; }
.iso-cabinet .cb-card-front { transition-delay: 80ms; }

.iso-host:hover .iso-cabinet .cb-drawer-slide { transform: translate(${r2(-DEPTH.x * PULL.hover)}px, ${r2(-DEPTH.y * PULL.hover)}px); }
.iso-host:hover .iso-cabinet .cb-drawer-shadow { opacity: 0.08; }
.iso-host:hover .iso-cabinet .cb-card-front { opacity: 1; transform: translateY(4px); }

.iso-host[data-open] .iso-cabinet .cb-drawer-slide { transform: translate(${r2(-DEPTH.x * PULL.open)}px, ${r2(-DEPTH.y * PULL.open)}px); }
.iso-host[data-open] .iso-cabinet .cb-drawer-shadow { opacity: 0.16; }
.iso-host[data-open] .iso-cabinet .cb-card-back { opacity: 1; transform: translateY(-21px); }
.iso-host[data-open] .iso-cabinet .cb-card-mid { opacity: 1; transform: translateY(-17px); }
.iso-host[data-open] .iso-cabinet .cb-card-front { opacity: 1; transform: translateY(-14px); }

@media (prefers-reduced-motion: reduce) {
  .iso-cabinet .cb-reel-l,
  .iso-cabinet .cb-reel-r,
  .iso-cabinet .cb-film-strip,
  .iso-cabinet .cb-pilot { animation: none; }
  .iso-cabinet .cb-drawer-slide,
  .iso-cabinet .cb-drawer-shadow,
  .iso-cabinet .cb-card { transition-duration: 1ms; transition-delay: 0ms; }
}
`
