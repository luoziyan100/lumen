/**
 * [INPUT]: the kit in ./iso.ts; the drawn labels from the locale catalog (studio.objects.box), the newest takeaway's lines and date from the caller
 * [OUTPUT]: boxSvg({ labels, words }): the takeaway box (沉淀盒) SVG; boxWords(text, stamp): a takeaway as the front card (two lines, …); BOX_CARD: the card's text box;
 *           BOX_CSS: its variable --iso-lid (hover 38, open 104)
 * [POS]: object 1 of studio/objects/; geometry is the phase 1 sample's, element for element (125 shapes, deliberately not padded), and renders pixel-identical to it at rest
 *        with the sample's words. The front card carries the person's own words or stays blank; every word is escaped by the kit's text brush
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { css, grain, hinge, joints, kit, line, move, rect, show, text, twin, wrapText } from './iso.ts'

const { face } = kit({ x0: 178, y0: 156 })        // model origin in the 320×300 viewBox

/* ---------- Size · box 90 (x) × 130 (y) × 56 (z), walls 6, lid 12, hinge on the back edge x = 0, z = 56 ---------- */
const W = 90, D = 130, H = 56, T = 6, LID = 12
const HINGE = hinge([0, 0, H], 'Y', 'var(--iso-lid) * -1')
const WOOD_TOP = '#fbf7ee', WOOD_R = '#f0e8d8', WOOD_L = '#e4d9c4', IN_BACK = '#e9e0cd', IN_LEFT = '#dcd0b8', FLOOR = '#e6dcc8'

export interface BoxLabels { plaque: string; lid: string; lidSub: string; tabs: readonly string[] }
/** The front card: two lines of the person's own words and the stamp above them (「我自己的话 · 11-17」); null leaves the card blank */
export interface BoxWords { stamp: string; lines: string[] }
/** Where the front card's words go: wrap to this width at this size, two lines at most */
export const BOX_CARD = { width: 87, size: 5.6, lines: 2 }
/** A takeaway as the front card: the stamp and its words wrapped to two lines (… when longer); null or blank text leaves the card blank */
export function boxWords(text: string | null | undefined, stamp: string): BoxWords | null {
  const lines = wrapText(text ?? '', BOX_CARD.width, BOX_CARD.size, BOX_CARD.lines)
  return lines.length ? { stamp, lines } : null
}

// Inner walls and floor (seen only once the lid lifts)
const inBack = face([T, D - T, H], [0, -1, 0], [0, 0, -1], rect(0, 0, D - 2 * T, H - 4, IN_BACK) + grain(D - 2 * T, H - 4, 4, 3))
const inLeft = face([T, T, H], [1, 0, 0], [0, 0, -1], rect(0, 0, W - 2 * T, H - 4, IN_LEFT) + grain(W - 2 * T, H - 4, 5, 3))
const floor = face([T, D - T, 4], [0, -1, 0], [1, 0, 0], rect(0, 0, D - 2 * T, W - 2 * T, FLOOR))

// Cards stand in the y–z plane and rise with the lid; the front one holds the person's own words
interface Card { x: number; k: number; tab?: number; label?: 0 | 1; fill?: string; words?: true }
const CARDS: Card[] = [
  { x: 16, tab: 10, label: 0, k: .42 },
  { x: 24, k: .38 },
  { x: 32, k: .34 },
  { x: 42, tab: 54, label: 1, k: .30, fill: '#f8e9c6' },
  { x: 50, k: .26 },
  { x: 60, k: .22 },
  { x: 70, k: .66, words: true },
]
const CW = 100, CH = 42
function card(c: Card, labels: BoxLabels, words: BoxWords | null) {
  const top = 4 + CH
  let body = ''
  if (c.tab != null) body += `<path d="M${c.tab} 0V-8.5Q${c.tab} -10 ${c.tab + 1.5} -10H${c.tab + 26.5}Q${c.tab + 28} -10 ${c.tab + 28} -8.5V0" fill="${c.fill || '#fffefa'}" class="ln"/>` +
    text(c.tab + 14, -3, 5.2, labels.tabs[c.label!] ?? '', 'text-anchor="middle"')
  body += rect(0, 0, CW, CH, c.fill || '#fffefa')
  if (c.words) {
    body += line(6, 9, CW - 6, 9, 'hair').replace('hair', 'hair" style="stroke:#c9a0a0')
    for (let i = 0; i < 4; i++) body += line(6, 16 + i * 6.4, CW - 6, 16 + i * 6.4, 'grain')
    // The words are clipped to the card, so an estimate that runs long never leaves it
    if (words) body += `<g clip-path="url(#iso-box-card)">` + text(7, 7, 4.6, words.stamp, 'fill="#8a8d95"') +
      words.lines.slice(0, BOX_CARD.lines).map((value, i) => text(7, 15 + i * 6.4, BOX_CARD.size, value)).join('') + '</g>'
  } else {
    for (let i = 0; i < 4; i++) body += line(6, 10 + i * 7, CW - 6 - (i % 2) * 18, 10 + i * 7, 'grain')
  }
  return face([c.x, D - 15, top], [0, -1, 0], [0, 0, -1], body, move([0, 0, c.k], 'max(0, var(--iso-lid) - 58)'))
}

function parts(labels: BoxLabels) {
  // Outside right-front face (+x): u along −y, v down
  const boxFront = face([W, D, H], [0, -1, 0], [0, 0, -1],
    rect(0, 0, D, H, WOOD_R) + grain(D, H, 1) + joints(0, 6, H, 0) +
    rect(D / 2 - 22, 16, 44, 19, '#e3c27e', 'ln', 2) + rect(D / 2 - 19, 18.5, 38, 14, '#fffdf6', 'hair', 1) +
    text(D / 2, 28.6, 8.4, labels.plaque, 'text-anchor="middle" letter-spacing="1.6"') +
    [D / 2 - 20, D / 2 + 20].map(x => `<circle cx="${x}" cy="25.5" r="1" fill="#2f2b25"/>`).join('') +
    rect(D / 2 - 6, 2, 12, 7, '#e3c27e', 'brass', 1.2) +
    line(0, H - 0.5, D, H - 0.5, 'ln'))
  // Outside left-front face (+y): u along +x, v down
  const boxSide = face([0, D, H], [1, 0, 0], [0, 0, -1],
    rect(0, 0, W, H, WOOD_L) + grain(W, H, 2, 4) + joints(W - 6, 6, H, 8) +
    rect(W / 2 - 14, 22, 28, 9, 'none', 'hair', 4.5) + line(W / 2 - 9, 26.5, W / 2 + 9, 26.5, 'hair'))
  // The rim: a frame on the wall tops
  const rim = face([0, D, H], [0, -1, 0], [1, 0, 0],
    `<path d="M0 0H${D}V${W}H0Z M${T} ${T}V${W - T}H${D - T}V${T}Z" fill="${WOOD_TOP}" fill-rule="evenodd" class="ln"/>`)

  // The lid is modelled closed; every face carries the hinge turn
  const lidTop = face([0, D, H + LID], [0, -1, 0], [1, 0, 0],
    rect(0, 0, D, W, WOOD_TOP) + rect(7, 7, D - 14, W - 14, 'none', 'hair', 2) + grain(D, W, 7, 6), HINGE)
  const lidFront = face([W, D, H + LID], [0, -1, 0], [0, 0, -1],
    rect(0, 0, D, LID, WOOD_R) + grain(D, LID, 8, 1) + joints(0, 6, LID, 0) +
    rect(D / 2 - 7.5, 4, 15, 14, '#e3c27e', 'brass', 2) + rect(D / 2 - 3, 13, 6, 7, '#c99f52', 'brass-d', 1.5) +
    `<circle cx="${D / 2}" cy="9" r="1.3" fill="#2f2b25"/>`, HINGE)
  const lidSide = face([0, D, H + LID], [1, 0, 0], [0, 0, -1],
    rect(0, 0, W, LID, WOOD_L) + grain(W, LID, 9, 1) + joints(W - 6, 6, LID, 0), HINGE)
  const lidUnder = face([W, D, H], [0, -1, 0], [-1, 0, 0],
    rect(0, 0, D, W, '#efe6d3') + rect(8, 8, D - 16, W - 16, '#fffdf6', 'hair', 1.5) +
    text(D / 2, W / 2 - 4, 7.4, labels.lid, 'text-anchor="middle"') +
    text(D / 2, W / 2 + 8, 4.8, labels.lidSub, 'text-anchor="middle" fill="#8a8d95"') +
    line(D / 2 - 26, W / 2 + 14, D / 2 + 26, W / 2 + 14, 'grain'), HINGE)
  // Past 60° the standing lid is drawn behind the cards
  const lid = twin('--iso-lid', 60, lidTop + lidSide + lidFront + lidUnder, lidUnder + lidSide + lidFront + lidTop)
  return { boxFront, boxSide, rim, lid }
}

const shadow = face([-6, D + 8, 0], [0, -1, 0], [1, 0, 0],
  `<rect x="0" y="0" width="${D + 22}" height="${W + 18}" rx="18" fill="#3b2f1e" opacity=".16" filter="url(#iso-box-soft)"/>`)

export function boxSvg({ labels, words }: { labels: BoxLabels; words: BoxWords | null }) {
  const { boxFront, boxSide, rim, lid } = parts(labels)
  return `<svg class="iso iso-box" viewBox="0 0 320 300" role="img" aria-hidden="true">
    <defs><filter id="iso-box-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
    <clipPath id="iso-box-card" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="${CW}" height="${CH}"/></clipPath></defs>
    ${shadow}
    ${lid.early}
    ${show('var(--iso-lid) - 2', inBack + inLeft + floor + CARDS.map(c => card(c, labels, words)).join(''))}
    ${boxSide}${boxFront}${rim}
    ${lid.late}
  </svg>`
}

export const BOX_CSS = css('.iso-box', { '--iso-lid': { hover: 38, open: 104, ms: 900 } })
