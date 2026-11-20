/**
 * [INPUT]: none (pure SVG string helpers)
 * [OUTPUT]: shared White-Porcelain Architectural CAD SVG primitives (r2, bolt, screw, rivet, rivetRow, gearPath, trussArm, prism, coolingFins,
 *           vernierRing, instrumentDefs, dotGridBackdrop, spinKeyframes) with per-object id prefixes so simultaneously mounted instruments
 *           never collide on <defs> ids
 * [POS]: shared visual grammar for Lumen's Monochrome White-Porcelain × Hairline CAD precision scholarly instrument series in studio/objects/
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */

export const r2 = (n: number) => Math.round(n * 100) / 100

/** Recessed monochrome machined socket bolt (hairline architectural finish, zero heavy yellow fill) */
export function bolt(cx: number, cy: number, pfx: string, r = 2.1, angle = 32) {
  const rad = (angle * Math.PI) / 180
  const dx = r2(Math.cos(rad) * (r * 0.65))
  const dy = r2(Math.sin(rad) * (r * 0.65))
  return `<g>` +
    `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r + 0.55)}" fill="#e5e0d6" stroke="#b3ada2" stroke-width="0.4"/>` +
    `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="url(#${pfx}porcelain-rivet)" stroke="#888277" stroke-width="0.55"/>` +
    `<line x1="${r2(cx - dx)}" y1="${r2(cy - dy)}" x2="${r2(cx + dx)}" y2="${r2(cy + dy)}" stroke="#736d63" stroke-width="0.55" stroke-linecap="round"/>` +
  `</g>`
}

/** Alias kept for ergonomics */
export const screw = bolt

/** Tiny raised porcelain flange rivet */
export function rivet(cx: number, cy: number, pfx: string, r = 1.35) {
  return `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="url(#${pfx}porcelain-rivet)" stroke="#9a9489" stroke-width="0.45"/>` +
    `<circle cx="${r2(cx - r * 0.28)}" cy="${r2(cy - r * 0.28)}" r="${r2(r * 0.3)}" fill="#ffffff" opacity="0.9"/>`
}

/** Industrial flange rivet row along a straight segment */
export function rivetRow(x0: number, y0: number, x1: number, y1: number, count: number, pfx: string, r = 1.25) {
  if (count <= 1) return rivet(x0, y0, pfx, r)
  let out = ''
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    out += rivet(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, pfx, r)
  }
  return out
}

/** Precision toothed gear path */
export function gearPath(cx: number, cy: number, rOuter: number, rInner: number, teeth: number) {
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

/** Tapered machined-porcelain kinematic truss link with circular weight-relief cutouts and concentric pivot bearings */
export function trussArm(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w1: number,
  w2: number,
  holes: number,
  pfx: string,
) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const p1a = [x1 + nx * (w1 / 2), y1 + ny * (w1 / 2)]
  const p2a = [x2 + nx * (w2 / 2), y2 + ny * (w2 / 2)]
  const p2b = [x2 - nx * (w2 / 2), y2 - ny * (w2 / 2)]
  const p1b = [x1 - nx * (w1 / 2), y1 - ny * (w1 / 2)]

  let cutouts = ''
  for (let i = 1; i <= holes; i++) {
    const t = i / (holes + 1)
    const hx = x1 + dx * t
    const hy = y1 + dy * t
    const hr = ((w1 + (w2 - w1) * t) * 0.28)
    cutouts += `<circle cx="${r2(hx)}" cy="${r2(hy)}" r="${r2(hr)}" fill="url(#${pfx}recess)" stroke="#a39d92" stroke-width="0.5"/>` +
      `<circle cx="${r2(hx)}" cy="${r2(hy)}" r="${r2(hr * 0.65)}" fill="#faf8f4" stroke="#bbb5aa" stroke-width="0.4"/>`
  }

  return `<g>` +
    `<path d="M${r2(p1a[0]!)} ${r2(p1a[1]!)} L${r2(p2a[0]!)} ${r2(p2a[1]!)} L${r2(p2b[0]!)} ${r2(p2b[1]!)} L${r2(p1b[0]!)} ${r2(p1b[1]!)} Z" fill="url(#${pfx}porcelain-v)" stroke="#7f796e" stroke-width="0.72" stroke-linejoin="round"/>` +
    `<line x1="${r2(x1 + nx * (w1 * 0.34))}" y1="${r2(y1 + ny * (w1 * 0.34))}" x2="${r2(x2 + nx * (w2 * 0.34))}" y2="${r2(y2 + ny * (w2 * 0.34))}" stroke="#ffffff" stroke-width="0.75" opacity="0.82"/>` +
    `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="#c9c3b8" stroke-width="0.45" stroke-dasharray="2 2"/>` +
    cutouts +
    `<circle cx="${r2(x1)}" cy="${r2(y1)}" r="${r2(w1 * 0.56)}" fill="url(#${pfx}porcelain-v)" stroke="#7c766b" stroke-width="0.72"/>` +
    `<circle cx="${r2(x1)}" cy="${r2(y1)}" r="${r2(w1 * 0.32)}" fill="url(#${pfx}machined)" stroke="#928c81" stroke-width="0.55"/>` +
    `<circle cx="${r2(x1)}" cy="${r2(y1)}" r="${r2(w1 * 0.14)}" fill="#ffffff" stroke="#857f74" stroke-width="0.45"/>` +
    `<circle cx="${r2(x2)}" cy="${r2(y2)}" r="${r2(w2 * 0.56)}" fill="url(#${pfx}porcelain-v)" stroke="#7c766b" stroke-width="0.72"/>` +
    `<circle cx="${r2(x2)}" cy="${r2(y2)}" r="${r2(w2 * 0.32)}" fill="url(#${pfx}machined)" stroke="#928c81" stroke-width="0.55"/>` +
    `<circle cx="${r2(x2)}" cy="${r2(y2)}" r="${r2(w2 * 0.14)}" fill="#ffffff" stroke="#857f74" stroke-width="0.45"/>` +
  `</g>`
}

/**
 * Oblique porcelain block: front face plus the top and right faces it shows when depth runs up-right by (dx, dy), dy < 0.
 * Every object that needs volume uses this one projection, so their depths agree.
 */
export function prism(x: number, y: number, w: number, h: number, dx: number, dy: number, pfx: string, front = 'porcelain-v', stroke = '#7c766b') {
  const p = (pts: number[][]) => pts.map(([a, b], i) => `${i ? 'L' : 'M'}${r2(a!)} ${r2(b!)}`).join(' ') + ' Z'
  return `<path d="${p([[x, y], [x + dx, y + dy], [x + w + dx, y + dy], [x + w, y]])}" fill="url(#${pfx}porcelain-top)" stroke="${stroke}" stroke-width="0.72" stroke-linejoin="round"/>` +
    `<path d="${p([[x + w, y], [x + w + dx, y + dy], [x + w + dx, y + h + dy], [x + w, y + h]])}" fill="url(#${pfx}porcelain-side)" stroke="${stroke}" stroke-width="0.72" stroke-linejoin="round"/>` +
    `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="url(#${pfx}${front})" stroke="${stroke}" stroke-width="0.8"/>` +
    `<line x1="${r2(x + 1)}" y1="${r2(y + 1.2)}" x2="${r2(x + w - 1)}" y2="${r2(y + 1.2)}" stroke="#ffffff" stroke-width="0.8" opacity="0.9"/>`
}

/** Machined radiator cooling fins (horizontal or vertical) */
export function coolingFins(x: number, y: number, w: number, h: number, count: number, vertical = false) {
  let out = ''
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0.5 : i / (count - 1)
    if (vertical) {
      const fx = r2(x + w * t)
      out += `<line x1="${fx}" y1="${r2(y)}" x2="${fx}" y2="${r2(y + h)}" stroke="#8d877c" stroke-width="0.65"/>` +
        `<line x1="${r2(fx + 0.7)}" y1="${r2(y)}" x2="${r2(fx + 0.7)}" y2="${r2(y + h)}" stroke="#ffffff" stroke-width="0.55" opacity="0.8"/>`
    } else {
      const fy = r2(y + h * t)
      out += `<line x1="${r2(x)}" y1="${fy}" x2="${r2(x + w)}" y2="${fy}" stroke="#8d877c" stroke-width="0.65"/>` +
        `<line x1="${r2(x)}" y1="${r2(fy + 0.7)}" x2="${r2(x + w)}" y2="${r2(fy + 0.7)}" stroke="#ffffff" stroke-width="0.55" opacity="0.8"/>`
    }
  }
  return out
}

/** High-density Swiss vernier tick ring */
export function vernierRing(cx: number, cy: number, rOuter: number, rMinor: number, rMajor: number, count: number, majorEvery: number) {
  let out = ''
  for (let i = 0; i < count; i++) {
    const a = (i * (360 / count) - 90) * (Math.PI / 180)
    const major = i % majorEvery === 0
    const r0 = major ? rMajor : rMinor
    out += `<line x1="${r2(cx + Math.cos(a) * r0)}" y1="${r2(cy + Math.sin(a) * r0)}" ` +
      `x2="${r2(cx + Math.cos(a) * rOuter)}" y2="${r2(cy + Math.sin(a) * rOuter)}" ` +
      `stroke="${major ? '#6f695e' : '#b2aca1'}" stroke-width="${major ? 0.65 : 0.4}"/>`
  }
  return out
}

/** Shared White-Porcelain Architectural CAD gradients & dot-grid mask, uniquely prefixed by `pfx` */
export function instrumentDefs(pfx: string, w: number, h: number) {
  return `
    <filter id="${pfx}soft-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5.5"/></filter>
    <pattern id="${pfx}dot-grid" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="7" cy="7" r="0.7" fill="#9a9387" opacity="0.28"/>
    </pattern>
    <radialGradient id="${pfx}grid-fade" cx="50%" cy="52%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset="68%" stop-color="#ffffff" stop-opacity="0.68"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <mask id="${pfx}grid-mask"><rect x="0" y="0" width="${w}" height="${h}" fill="url(#${pfx}grid-fade)"/></mask>

    <!-- Pure sculpted white-porcelain shading ramp (95% of surface area) -->
    <linearGradient id="${pfx}porcelain-top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f7f4ee"/>
    </linearGradient>
    <linearGradient id="${pfx}porcelain-v" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="52%" stop-color="#f7f5ef"/>
      <stop offset="100%" stop-color="#e8e4db"/>
    </linearGradient>
    <linearGradient id="${pfx}porcelain-h" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ece8df"/>
      <stop offset="22%" stop-color="#ffffff"/>
      <stop offset="76%" stop-color="#f6f3ed"/>
      <stop offset="100%" stop-color="#e0dbd1"/>
    </linearGradient>
    <linearGradient id="${pfx}porcelain-side" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e9e5dc"/>
      <stop offset="100%" stop-color="#d6d0c4"/>
    </linearGradient>
    <radialGradient id="${pfx}porcelain-rivet" cx="34%" cy="28%" r="72%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="62%" stop-color="#efece4"/>
      <stop offset="100%" stop-color="#ccc6ba"/>
    </radialGradient>
    <radialGradient id="${pfx}drum-outer" cx="35%" cy="28%" r="74%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="62%" stop-color="#f5f2ec"/>
      <stop offset="100%" stop-color="#e1dcd2"/>
    </radialGradient>
    <radialGradient id="${pfx}dial-face" cx="42%" cy="36%" r="68%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="76%" stop-color="#faf8f3"/>
      <stop offset="100%" stop-color="#ede9e0"/>
    </radialGradient>
    <linearGradient id="${pfx}recess" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ded9ce"/>
      <stop offset="32%" stop-color="#eeebe3"/>
      <stop offset="100%" stop-color="#f9f7f2"/>
    </linearGradient>
    <!-- Satin brushed aluminum / architectural stone-silver (replaces heavy cartoon yellow brass!) -->
    <linearGradient id="${pfx}machined" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f5f3ed"/>
      <stop offset="48%" stop-color="#e7e3da"/>
      <stop offset="100%" stop-color="#d2cdc2"/>
    </linearGradient>
    <linearGradient id="${pfx}machined-h" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#d8d3c8"/>
      <stop offset="30%" stop-color="#f7f5f0"/>
      <stop offset="70%" stop-color="#e9e5dc"/>
      <stop offset="100%" stop-color="#cbc5b9"/>
    </linearGradient>
    <linearGradient id="${pfx}paper-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="82%" stop-color="#fcfbf7"/>
      <stop offset="100%" stop-color="#f3efe6"/>
    </linearGradient>
    <linearGradient id="${pfx}glass" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.88"/>
      <stop offset="30%" stop-color="#f6f8f9" stop-opacity="0.54"/>
      <stop offset="75%" stop-color="#eef2f4" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#dde3e6" stop-opacity="0.7"/>
    </linearGradient>
    <!-- Restrained 3% functional accent tones (warm champagne-amber & mist-celadon) -->
    <linearGradient id="${pfx}accent-amber" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f5d98e"/>
      <stop offset="100%" stop-color="#dfb256"/>
    </linearGradient>
    <linearGradient id="${pfx}accent-celadon" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#96c3d8"/>
      <stop offset="100%" stop-color="#699eb8"/>
    </linearGradient>`
}

export function dotGridBackdrop(pfx: string, w: number, h: number, datumY: number) {
  return `<rect x="10" y="10" width="${w - 20}" height="${h - 20}" fill="url(#${pfx}dot-grid)" mask="url(#${pfx}grid-mask)"/>` +
    `<line x1="36" y1="${datumY}" x2="${w - 36}" y2="${datumY}" stroke="#b4aea2" stroke-width="0.5" stroke-dasharray="2 4" opacity="0.45"/>`
}

/** WebKit-safe 4-quarter monotonic clockwise spin keyframes (never reverses direction at 180°) */
export function spinKeyframes(name: string) {
  return `@keyframes ${name} { 0% { transform: rotate(0deg); } 25% { transform: rotate(90deg); } 50% { transform: rotate(180deg); } 75% { transform: rotate(270deg); } 100% { transform: rotate(360deg); } }`
}
