/**
 * [INPUT]: scripts/objects/music.html (run music-page.mts first); playwright-core from /tmp/lumen-s0-pw with Chromium 1228 and Playwright's WebKit build
 * [OUTPUT]: per music object and browser, light and dark: rest, hover mid (real mouse, 1.1 s in), open (real click, settled), typing (objects that react to is-typing),
 *           and a 3× crop of the rest state (the object's crop region); prints primitive count and line-weight tiers, checks for no <image>, stillness at rest, no script errors, and over 10 frames
 *           after hover and after click that every visible note (.mu-note) keeps MARGIN viewBox units inside the frame and overlaps no <text>; exit 1 on a failed check
 * [POS]: the music set's design-gate evidence, not shipped. Usage: node --experimental-strip-types scripts/objects/music-shots.mts <evidence-dir>
 *        (ONLY=chromium|webkit for one browser, SLOT=<slot> for one object, THEME=light|dark for one theme)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { chromium, webkit } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
import { mkdirSync } from 'node:fs'
import { MUSIC_OBJECTS } from '../../src/mastra/studio/objects/music/index.ts'

const out = process.argv[2]
if (!out) throw new Error('evidence dir required')
mkdirSync(out, { recursive: true })
const PAGE = new URL('./music.html', import.meta.url).href
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const TYPING = new Set(['reading'])
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const MARGIN = 6
/** Every visible note (.mu-note, effective opacity > .05) as its distance to the frame edge in viewBox units, and how many note boxes overlap a <text> box */
const notesIn = (slot: string) => {
  const svg = document.querySelector(`#${slot} svg`) as SVGSVGElement, frame = svg.getBoundingClientRect(), k = frame.width / svg.viewBox.baseVal.width
  const texts = [...svg.querySelectorAll('text')].map(t => t.getBoundingClientRect()).filter(t => t.width > 0)
  let seen = 0, gap = Infinity, hits = 0
  for (const g of svg.querySelectorAll('.mu-note')) {
    let opacity = 1
    for (let e: Element | null = g; e && e !== svg; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity)
    if (opacity < .05) continue
    const b = g.getBoundingClientRect()
    seen++
    gap = Math.min(gap, (b.left - frame.left) / k, (frame.right - b.right) / k, (b.top - frame.top) / k, (frame.bottom - b.bottom) / k)
    for (const t of texts) if (b.left < t.right && b.right > t.left && b.top < t.bottom && b.bottom > t.top) hits++
  }
  return { seen, gap, hits }
}
let failed = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++ }

for (const [name, type, options] of [['chromium', chromium, { executablePath: CHROME, args: ['--disable-gpu'] }], ['webkit', webkit, {}]] as const) {
  if (process.env.ONLY && process.env.ONLY !== name) continue
  const browser = await type.launch(options)
  for (const theme of ['light', 'dark']) {
    if (process.env.THEME && process.env.THEME !== theme) continue
    for (const o of MUSIC_OBJECTS) {
      if (process.env.SLOT && process.env.SLOT !== o.slot) continue
      const tag = `${name}-${theme}-${o.slot}`
      const page = await (await browser.newContext({ viewport: { width: o.width + 80, height: 640 }, deviceScaleFactor: 2 })).newPage()
      const errors: string[] = []
      page.on('pageerror', error => errors.push(String(error)))
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
      const query = (extra: string) => `${PAGE}?only=${o.slot}${theme === 'dark' ? '&dark' : ''}${extra}`
      const host = page.locator(`#${o.slot}`)
      await page.goto(query('')); await sleep(300)
      if (theme === 'light') {
        const info = await page.evaluate((slot: string) => {
          const s = document.querySelector(`#${slot} svg`)!
          const tiers = [...new Set([...s.querySelectorAll('[class]')].flatMap(n => (n.getAttribute('class') ?? '').split(' ').filter(c => /^w[0-3]$/.test(c))))].sort()
          return { shapes: s.querySelectorAll('path,rect,circle,ellipse,line,polygon,polyline').length, images: s.querySelectorAll('image').length, tiers }
        }, o.slot)
        console.log(`INFO ${name} ${o.slot} primitives=${info.shapes} tiers=${info.tiers.join(',')}`)
        check(`${name} ${o.slot} 无 <image>`, info.images === 0)
      }
      await host.screenshot({ path: `${out}/${tag}-rest.png` })
      const a = await host.screenshot(); await sleep(800); const b = await host.screenshot()
      check(`${tag} 静止`, a.equals(b))
      if (theme === 'light') {
        const box = (await host.boundingBox())!
        const crop = await (await browser.newContext({ viewport: { width: o.width + 80, height: 640 }, deviceScaleFactor: 3 })).newPage()
        await crop.goto(query('')); await sleep(300)
        const [cx, cy, cw, ch] = o.crop, unit = box.width / Number(o.svg({}).match(/viewBox="0 0 (\d+)/)![1])
        await crop.screenshot({ path: `${out}/${tag}-crop3x.png`, clip: { x: box.x + cx * unit, y: box.y + cy * unit, width: cw * unit, height: ch * unit } })
        await crop.context().close()
      }
      const sample = async (label: string) => {
        let seen = 0, gap = Infinity, hits = 0
        for (let f = 0; f < 10; f++) { const s = await page.evaluate(notesIn, o.slot); seen += s.seen; gap = Math.min(gap, s.gap); hits += s.hits; await sleep(160) }
        check(`${tag} ${label} 音符在框内留边 ≥${MARGIN}、不压文字（10 帧）`, gap >= MARGIN && hits === 0, `seen=${seen} minGap=${seen ? gap.toFixed(1) : '-'} textHits=${hits}`)
      }
      await host.hover(); await sleep(1100); await host.screenshot({ path: `${out}/${tag}-hover.png` }); await sample('悬停')
      await host.click(); await sleep(300); await sample('点击'); await sleep(900); await host.screenshot({ path: `${out}/${tag}-open.png` })
      await page.mouse.move(2, 2)
      if (TYPING.has(o.slot)) { await page.goto(query('&typing')); await sleep(2400); await host.screenshot({ path: `${out}/${tag}-typing.png` }) }
      check(`${tag} 无脚本错误`, !errors.length, errors.join('; '))
      await page.context().close()
    }
  }
  await browser.close()
}
process.exit(failed ? 1 : 0)
