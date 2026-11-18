/**
 * [INPUT]: scripts/objects/views.html (run views-page.mts first); VIEW_OBJECTS from ./view-objects.ts; playwright-core from /tmp/lumen-s0-pw with Chromium 1228 and
 *          Playwright's WebKit build
 * [OUTPUT]: per browser: the whole row (box, easel and the four objects) at rest, light and dark; per object beside the box and the easel: rest, hover (real mouse),
 *           its pinned mid-state, open (real click), closed again, and open on the dark canvas. Prints per object its shape count, <image> count and a stillness
 *           check per settled state; exit 1 on a failed check
 * [POS]: V1–V4's checkpoint evidence, not shipped. Usage: node --experimental-strip-types scripts/objects/views-shots.mts <evidence-dir> (ONLY=chromium|webkit)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { chromium, webkit } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
import { mkdirSync } from 'node:fs'
import { VIEW_OBJECTS } from './view-objects.ts'

const out = process.argv[2]
if (!out) throw new Error('evidence dir required')
mkdirSync(out, { recursive: true })
const PAGE = new URL('./views.html', import.meta.url).href
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const SETTLE = 2800                                            // longer than every object's slowest transition plus the type case's overshoot
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
let failed = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++ }

for (const [name, type, options] of [['chromium', chromium, { executablePath: CHROME, args: ['--disable-gpu'] }], ['webkit', webkit, {}]] as const) {
  if (process.env.ONLY && process.env.ONLY !== name) continue
  const browser = await type.launch(options)
  const page = await (await browser.newContext({ viewport: { width: 1160, height: 1100 }, deviceScaleFactor: 2 })).newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const row = page.locator('.row')
  const still = async (label: string) => { const a = await row.screenshot(); await sleep(1000); const b = await row.screenshot(); check(`${name} ${label} 静止`, a.equals(b)) }

  // The whole row: every object at the same 320px scale as the box and the easel
  for (const dark of [false, true]) {
    await page.goto(`${PAGE}${dark ? '?dark' : ''}`); await sleep(400)
    await row.screenshot({ path: `${out}/${name}-all-${dark ? 'dark' : 'light'}.png` })
  }
  for (const o of VIEW_OBJECTS) {
    const shot = (label: string) => row.screenshot({ path: `${out}/${name}-${o.id}-${label}.png` })
    await page.goto(`${PAGE}?only=${o.id}`); await page.mouse.move(2, 2); await sleep(400)
    const counts = await page.evaluate(id => { const s = document.querySelector(`#${id} svg`)!; return { shapes: s.querySelectorAll('path,rect,circle,ellipse,line,polygon,polyline,text').length, images: s.querySelectorAll('image').length } }, o.id)
    check(`${name} ${o.name} 图形元素 ≥150`, counts.shapes >= 150, String(counts.shapes))
    check(`${name} ${o.name} 无 <image>`, counts.images === 0)
    await shot('rest'); await still(`${o.name} rest`)
    const host = page.locator(`#${o.id}`)
    await host.hover(); await sleep(1200); await shot('hover'); await still(`${o.name} hover`)
    await host.click(); await sleep(SETTLE); await shot('open'); await still(`${o.name} open`)
    await host.click(); await page.mouse.move(2, 2); await sleep(SETTLE); await shot('closed-again'); await still(`${o.name} closed-again`)
    await page.goto(`${PAGE}?only=${o.id}&set=${o.mid}`); await sleep(400); await shot('mid')
    await page.goto(`${PAGE}?only=${o.id}&open&dark`); await sleep(SETTLE); await shot('open-dark')
  }
  check(`${name} 无脚本错误`, !errors.length, errors.join('; '))
  await browser.close()
}
process.exit(failed ? 1 : 0)
