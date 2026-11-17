/**
 * [INPUT]: scripts/objects/easel.html (run easel-page.mts first); playwright-core from /tmp/lumen-s0-pw with Chromium 1228 and Playwright's WebKit build
 * [OUTPUT]: screenshots of the easel next to the box in both browsers: rest, hover (real mouse), open (real click, after the stroke settles), two pinned mid-states,
 *           open on a dark canvas; prints the easel's shape count, <image> count and a stillness check per settled state; exit 1 on a failed check
 * [POS]: O5's checkpoint evidence, not shipped. Usage: node --experimental-strip-types scripts/objects/easel-shots.mts <evidence-dir> (ONLY=chromium|webkit for one browser)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { chromium, webkit } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
import { mkdirSync } from 'node:fs'

const out = process.argv[2]
if (!out) throw new Error('evidence dir required')
mkdirSync(out, { recursive: true })
const PAGE = new URL('./easel.html', import.meta.url).href
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
let failed = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++ }

for (const [name, type, options] of [['chromium', chromium, { executablePath: CHROME, args: ['--disable-gpu'] }], ['webkit', webkit, {}]] as const) {
  if (process.env.ONLY && process.env.ONLY !== name) continue
  const browser = await type.launch(options)
  const page = await (await browser.newContext({ viewport: { width: 900, height: 560 }, deviceScaleFactor: 2 })).newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const row = page.locator('.row')
  const shot = (label: string) => row.screenshot({ path: `${out}/${name}-${label}.png` })
  const still = async (label: string) => { const a = await row.screenshot(); await sleep(1000); const b = await row.screenshot(); check(`${name} ${label} 静止`, a.equals(b)) }
  await page.goto(PAGE); await sleep(300)
  const counts = await page.evaluate(() => { const s = document.querySelector('#easel svg')!; return { shapes: s.querySelectorAll('path,rect,circle,ellipse,line,polygon,polyline,text').length, images: s.querySelectorAll('image').length } })
  check(`${name} 画架图形元素 ≥150`, counts.shapes >= 150, String(counts.shapes))
  check(`${name} 画架无 <image>`, counts.images === 0)
  await shot('rest'); await still('rest')
  const easel = page.locator('#easel')
  await easel.hover(); await sleep(1000); await shot('hover'); await still('hover')
  await easel.click(); await sleep(3600); await shot('open'); await still('open')
  await easel.click(); await sleep(1200); await page.mouse.move(5, 5); await sleep(900); await shot('closed-again'); await still('closed-again')
  for (const [label, set] of [['mid-lift', '--iso-tilt:7,--iso-brush:20,--iso-wet:1'], ['mid-stroke', '--iso-tilt:7,--iso-brush:52,--iso-wet:1'], ['mid-return', '--iso-tilt:7,--iso-brush:88,--iso-wet:1']]) {
    await page.goto(`${PAGE}?set=${set}`); await sleep(300); await shot(label)
  }
  await page.goto(`${PAGE}?open&dark`); await sleep(3600); await shot('open-dark')
  check(`${name} 无脚本错误`, !errors.length, errors.join('; '))
  await browser.close()
}
process.exit(failed ? 1 : 0)
