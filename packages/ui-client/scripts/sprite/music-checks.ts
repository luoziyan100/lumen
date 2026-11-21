/**
 * [INPUT]: a Playwright page of the studio (vite dev page) and the locale catalog; called by ui-assert-objects.mts
 * [OUTPUT]: KITS (each kit's svg class per slot), seedKit (init script: the appearance preference with a kit and the sound switch), countAudio (init script: an AudioContext
 *           wrapper that counts contexts and oscillators on window.__audio), pickKit (Settings › Appearance › Desk objects, closing the dialog), notesClear (10 frames:
 *           every visible note inside its object's frame, overlapping no text and no control), pixelDiff (two PNG captures decoded in the page: size match and differing pixels), still (a capture with every animation and transition stopped by a style override, so a spin's last frame cannot leak into the pixels)
 * [POS]: the music kit's browser checks, kept out of the main script so it stays one flow. Pure page helpers; the caller owns the checks and the evidence
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
export const KITS = {
  instruments: { reading: 'iso-typewriter', takeaways: 'iso-press', materials: 'iso-cabinet', box: 'iso-box', board: 'iso-easel', map: 'iso-cork', ideas: 'iso-lamp', all: 'iso-case' },
  music: { reading: 'mu-piano', takeaways: 'mu-gramophone', materials: 'mu-cello', box: 'mu-musicbox', board: 'mu-stand', map: 'mu-harp', ideas: 'mu-violin', all: 'mu-metronome' },
} as const
export type Kit = keyof typeof KITS

export const seedKit = ([kit, sounds, dark]: [string, boolean, boolean]) => {
  if (window !== window.top || sessionStorage.getItem('lumen-kit-seeded')) return
  sessionStorage.setItem('lumen-kit-seeded', '1')
  localStorage.setItem('lumen:appearance.v2', JSON.stringify({ version: 1, mode: dark ? 'dark' : 'light', skinId: 'yan-clear', overlay: 0, blurPx: 0, latinFont: 'source-serif', cjkFont: 'wenkai', justify: false, deskObjects: kit, instrumentSounds: sounds }))
}

export const countAudio = () => {
  const audio = { contexts: 0, oscillators: 0 }
  Object.defineProperty(window, '__audio', { value: audio })
  const Base = window.AudioContext
  if (!Base) return
  window.AudioContext = class extends Base {
    constructor(...args: ConstructorParameters<typeof AudioContext>) { super(...args); audio.contexts++ }
    createOscillator() { audio.oscillators++; return super.createOscillator() }
  }
}

export async function pickKit(page, catalog, kit: Kit) {
  const settings = catalog.studio.settings, C = catalog.settings, A = catalog.appearance
  await page.locator('.studio-topics .studio-item', { hasText: settings }).click()
  await page.locator('.settings-nav-item', { hasText: C.tabs.preference }).click()
  await page.locator(`[aria-label="${A.deskObjects}"] button`, { hasText: A.deskKits[kit] }).click()
  await page.locator('.settings-close').click()
  await page.waitForSelector('.settings-modal', { state: 'detached' })
}

/** A capture of one host with all motion removed by a temporary style (both kits start from their drawn pose), then the style is taken out */
export async function still(page, selector: string) {
  await page.addStyleTag({ content: '.iso-host, .iso-host * { animation: none !important; transition: none !important; }' }).then(handle => handle.evaluate(node => node.setAttribute('data-still', '')))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const shot = await page.locator(selector).screenshot()
  await page.evaluate(() => document.querySelectorAll('style[data-still]').forEach(node => node.remove()))
  return shot
}

/** Two PNG captures decoded on a canvas in the page: whether the sizes match, how many pixels differ and the largest channel delta */
export function pixelDiff(page, a: Buffer, b: Buffer) {
  return page.evaluate(async ([a, b]) => {
    const load = async (data: string) => { const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, image.width, image.height) }
    const x = await load(a), y = await load(b)
    if (x.width !== y.width || x.height !== y.height) return { size: false, pixels: -1, delta: -1 }
    let pixels = 0, delta = 0
    for (let i = 0; i < x.data.length; i += 4) {
      const d = Math.max(Math.abs(x.data[i]! - y.data[i]!), Math.abs(x.data[i + 1]! - y.data[i + 1]!), Math.abs(x.data[i + 2]! - y.data[i + 2]!), Math.abs(x.data[i + 3]! - y.data[i + 3]!))
      if (d) { pixels++; delta = Math.max(delta, d) }
    }
    return { size: true, pixels, delta }
  }, [a.toString('base64'), b.toString('base64')])
}

/** Over 10 frames, every note whose effective opacity shows lies inside its svg's box and crosses no text (inside or outside the drawing) and no control */
export async function notesClear(page, host: string) {
  const frames: string[] = []
  for (let i = 0; i < 10; i++) {
    frames.push(await page.evaluate(selector => {
      const svg = document.querySelector(`${selector} svg`)
      if (!svg) return 'missing'
      const frame = svg.getBoundingClientRect()
      const apart = (a: DOMRect, b: DOMRect) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
      const blocks = [...document.querySelectorAll('text, button, input, textarea, a, [role=tab], [role=button], p, h1, h2, h3, li')].map(node => node.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0)
      const bad: string[] = []
      let seen = 0
      for (const note of svg.querySelectorAll('.mu-note')) {
        let opacity = 1
        for (let e: Element | null = note; e && e !== svg; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity)
        if (opacity < .05) continue
        seen++
        const b = note.getBoundingClientRect()
        if (b.left < frame.left || b.right > frame.right || b.top < frame.top || b.bottom > frame.bottom) bad.push('out')
        if (blocks.some(r => !apart(b, r))) bad.push('crosses')
      }
      return bad.length ? bad.join(',') : `ok:${seen}`
    }, host))
    await new Promise(resolve => setTimeout(resolve, 120))
  }
  return frames
}
