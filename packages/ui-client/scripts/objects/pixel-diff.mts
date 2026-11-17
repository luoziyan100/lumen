/**
 * [INPUT]: phase 1's gallery.html (git-ignored, read only from the main checkout's doc/studio/prototype/objects/, or the second argument); the product builders and the zh labels;
 *          playwright-core from /tmp/lumen-s0-pw with Chromium 1228
 * [OUTPUT]: per object (box, cabinet, typewriter) × state (rest, hover, open, pinned): phase 1's capture, the product's capture in the same page and host, the count of differing
 *           pixels and the largest channel difference, and a control (phase 1 re-rendered against itself) that measures the raster noise floor; writes the PNGs and pixel-diff.json to the evidence directory; exit 1 when any rest capture differs
 * [POS]: O1's proof that the port is faithful. Both captures come from one page, one host and one layout, so only the markup and the CSS differ. Chromium runs with
 *        --disable-gpu: GPU raster of 3D transforms flips a few pixels between identical frames, which would hide a real difference behind noise.
 *        Usage: node --experimental-strip-types scripts/objects/pixel-diff.mts <evidence-dir> [phase1-dir]
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { chromium } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { BASE } from '../../src/mastra/studio/objects/iso.ts'
import { boxSvg, BOX_CSS } from '../../src/mastra/studio/objects/box.ts'
import { cabinetSvg, CABINET_CSS } from '../../src/mastra/studio/objects/cabinet.ts'
import { typewriterSvg, TYPEWRITER_CSS } from '../../src/mastra/studio/objects/typewriter.ts'
import { zh } from '../../src/i18n/locales/zh.ts'

const out = process.argv[2]
if (!out) throw new Error('evidence dir required')
const phase1 = process.argv[3] ?? '/Users/zihao/Workspace/Projects/lumen/doc/studio/prototype/objects'
mkdirSync(out, { recursive: true })
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const L = zh.studio.objects
// Phase 1's sample words, passed as data the way the product passes a takeaway and a title
const OBJECTS = {
  box: { markup: boxSvg({ labels: L.box, words: { stamp: L.box.stamp('11-17'), lines: ['预测往下走，误差往上报，', '大脑多半时间在猜。'] } }), vars: [['--lid', '--iso-lid']], states: { rest: 0, hover: 38, open: 104 } },
  cabinet: { markup: cabinetSvg({ labels: L.cabinet }), vars: [['--drawer', '--iso-drawer']], states: { rest: 0, hover: 14, open: 64 } },
  typewriter: { markup: typewriterSvg({ lines: ['预测往下走，', '误差往上报。', '大脑多半时间在猜'] }), vars: [['--paper', '--iso-paper']], states: { rest: 0, hover: 10, open: 26 } },
} as const

const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-gpu'] })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage()
const results: { object: string; state: string; differing: number; maxDelta: number; pixels: number; noise: number; noiseMaxDelta: number }[] = []
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

for (const [id, o] of Object.entries(OBJECTS)) for (const [state, value] of Object.entries(o.states)) {
  await page.goto(pathToFileURL(`${phase1}/gallery.html`).href); await sleep(400)
  const pin = (name: string) => page.evaluate(([id, name, value]) => { const svg = document.querySelector(`#${id} svg`) as SVGElement; svg.style.transition = 'none'; svg.style.setProperty(name, String(value)) }, [id, name, value] as const)
  await pin(o.vars[0]![0]); await sleep(150)
  const before = await page.locator('#' + id).screenshot()
  // Control: phase 1's own markup re-inserted into the same host; whatever differs here is raster noise, not the port
  await page.evaluate(id => { const host = document.getElementById(id)!; host.innerHTML = host.innerHTML }, id)
  await pin(o.vars[0]![0]); await sleep(150)
  const again = await page.locator('#' + id).screenshot()
  // Same page, same host: swap in the product's sheet and markup, add the product's host class, pin the product's variable
  await page.evaluate(([id, css, markup]) => {
    if (!document.getElementById('product-iso')) { const s = document.createElement('style'); s.id = 'product-iso'; s.textContent = css; document.head.appendChild(s) }
    const host = document.getElementById(id)!; host.classList.add('iso-host'); host.innerHTML = markup
  }, [id, BASE + BOX_CSS + CABINET_CSS + TYPEWRITER_CSS, o.markup] as const)
  await pin(o.vars[0]![1]); await sleep(150)
  const after = await page.locator('#' + id).screenshot()
  const compare = (x: Buffer, y: Buffer) => page.evaluate(async ([a, b]) => {
    const load = async (data: string) => { const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d')!; g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height) }
    const A = await load(a), B = await load(b)
    if (A.width !== B.width || A.height !== B.height) return { differing: -1, maxDelta: 255, pixels: A.width * A.height }
    let differing = 0, maxDelta = 0
    for (let i = 0; i < A.data.length; i += 4) {
      const d = Math.max(...[0, 1, 2, 3].map(k => Math.abs(A.data[i + k]! - B.data[i + k]!)))
      if (d) { differing++; maxDelta = Math.max(maxDelta, d) }
    }
    return { differing, maxDelta, pixels: A.width * A.height }
  }, [x.toString('base64'), y.toString('base64')] as const)
  const diff = await compare(before, after), noise = await compare(before, again)
  writeFileSync(`${out}/${id}-${state}-phase1.png`, before)
  writeFileSync(`${out}/${id}-${state}-product.png`, after)
  results.push({ object: id, state, ...diff, noise: noise.differing, noiseMaxDelta: noise.maxDelta })
  console.log(`${diff.differing === 0 ? 'IDENTICAL' : 'DIFFERS  '} ${id} ${state}: ${diff.differing} of ${diff.pixels} pixels differ, max channel delta ${diff.maxDelta}` +
    ` · control (phase 1 re-rendered against itself): ${noise.differing} differ, max delta ${noise.maxDelta}`)
}
await browser.close()
writeFileSync(`${out}/pixel-diff.json`, JSON.stringify({ browser: 'Chromium 1228 (--disable-gpu), deviceScaleFactor 2', results }, null, 1))
process.exit(results.some(r => r.state === 'rest' && r.differing !== 0) ? 1 : 0)
