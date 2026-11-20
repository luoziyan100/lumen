/**
 * [INPUT]: a self-contained isolated fixture service (real Controller + controllable model: writes a reading of the notes, answers questions in two sentences, replies to widget messages) and the vite dev
 *          page on PORT (default 5190, refused when already taken); data root LUMEN_ASSERT_ROOT (default /tmp/lumen-p1-reading-data, /tmp/lumen-* only, wiped at start); a seeded nine-section reading of a multi-page PDF with an interactive 2D widget in section 2 written through the reading store
 * [OUTPUT]: browser evidence (Chromium 8 passes + `--webkit` 2 passes: 1440x900 light zh, 1280x800 dark en): Reading first and selected; prose centred within 700px inside a 960px column while widgets expand wider when room allows with zero overflowX; source chips; each paper paragraph's quote line under it (visible, in the column, smaller than the body, contrast ≥ 4.5:1);
 *           a nine-section reading scrolls inside the view while panes and headers stay put; a real mouse selection inside one paragraph opens the window, whose centre,
 *           input and send button pass elementFromPoint and which never covers the selected sentence (below, or above near the bottom); the reply arrives in the window;
 *           no text line in view runs under the sprite's figure (top and bottom of the reading);
 *           a footprint on a sentence that starts mid-line leaves the paragraph's line count unchanged and its first line box on the line of the text before it (G4); footprints from earlier page loads are rebuilt; the header holds the title only; the empty state is the typewriter alone;
 *           in-place widget expand/collapse (position:fixed solid light stage above side panes/sprite, state preserved, single iframe load, button + Esc restore height & scrollTop, 8b13fde user-activation gate + R13 marker in expanded state, split-reader convergence); the live write from the Materials row (zh 1440 light)
 * [POS]: an acceptance script that swaps the model network only and touches no product protocol; screenshots land in the evidence directory, never in the repo
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
// Usage: node --experimental-strip-types ui-assert-reading.mts <evidence-dir> [--hold] [--webkit] (--hold keeps the seeded service up for a manual or desktop look)
import { chromium, webkit } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
import { mkdir, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { assertPortFree, assertRoot } from './assert-env.ts'
import { createHttpService } from '../../../mastra-service/src/server.ts'
import { acquireServiceLock } from '../../../mastra-service/src/deployment/lock.ts'
import { publishDiscovery, removeDiscovery } from '../../../mastra-service/src/deployment/discovery.ts'
import { fixtureProvider, textReply, toolReply } from '../../../mastra-service/tests/provider-fixture.ts'
import { pagedPdf } from '../../../mastra-service/tests/studio/library-fixtures.ts'
import { ensureTopic } from '../../../mastra-service/tests/topic-fixture.ts'

const out = process.argv[2]
if (!out) throw new Error('evidence dir required')
const catalogs = { zh: (await import('../../src/i18n/locales/zh.ts')).zh, en: (await import('../../src/i18n/locales/en.ts')).en }
const seedLocale = locale => { if (window === window.top) localStorage.setItem('lumen:locale.v1', JSON.stringify({ version: 1, locale })) }
const seedDark = () => { if (window === window.top) localStorage.setItem('lumen:appearance.v2', JSON.stringify({ version: 1, mode: 'dark', skinId: 'yan-clear', overlay: 0, blurPx: 0, latinFont: 'source-serif', cjkFont: 'wenkai', justify: false })) }
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const port = process.env.PORT ?? '5190'
const root = assertRoot('/tmp/lumen-p1-reading-data')
assertPortFree(port)
const TOPIC = '自由能读书', EMPTY = '还没读的主题'
const ANSWER = 'KL 散度非负，所以自由能总在惊讶之上。压低它，就压住了惊讶。'
const results = []
let failed = 0
let failure = ''
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++ }
// Existing is not visible: the hit test at the middle of every box must land on the element itself or a descendant.
// An inline element that wraps has one box per line; its bounding box's centre can fall on other text, so each line box is tested instead
const visibleAt = (page, selector) => page.evaluate(target => {
  const element = document.querySelector(target)
  if (!element) return false
  const boxes = [...element.getClientRects()].filter(box => box.width > 0 && box.height > 0)
  return boxes.length > 0 && boxes.every(box => {
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return !!hit && (hit === element || element.contains(hit))
  })
}, selector)
const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

// ---- The controllable model: a two-section reading of the notes; two-sentence answers to questions ----
const model = (() => {
  let calls = 0
  const call = (name, args) => toolReply(name, args, `call-${++calls}`)
  return fixtureProvider(async request => {
    const index = request.messages.map(message => message.role).lastIndexOf('user')
    const text = JSON.stringify(request.messages[index])
    const results = request.messages.slice(index).filter(message => message.role === 'tool').length
    const item = /材料 id：([^）"\\]+)/.exec(text)?.[1]
    if (text.includes('写一份解读') && item) {
      if (results === 0) return call('reading_write', { itemId: item, title: '笔记在说什么', paragraphs: [
        { text: '这份笔记把大脑说成一台不断预测的机器：它最小化自由能，也就是让预测和感觉之间的落差变小。', source: { kind: 'paper', quote: 'The brain minimises free energy over time' } },
        { text: '笔记没有给出证据，只是转述；要判断这句话，得回到原论文。', source: { kind: 'inference' } }] })
      if (results === 1) { await new Promise(resolve => setTimeout(resolve, 1500)); return call('reading_write', { itemId: item, title: '它没说什么', paragraphs: [{ text: '笔记没说预测从哪里来，也没说落差如何被测量。', source: { kind: 'inference' } }] }) }
      return textReply('写好了，两节。')
    }
    if (text.includes('— 解读《')) return textReply(ANSWER)
    if (text.includes('— 小实验')) return textReply('收到小实验参数。')
    return textReply('好')
  })
})()

await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true, mode: 0o700 })
await mkdir(out, { recursive: true })
const lock = acquireServiceLock(root)
const service = await createHttpService({ dataRoot: root, token: lock.identity,
  model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: model.fetch },
  // The desktop shell's origins too, so `--hold` can serve the installed app pointed here with --mastra-data-root
  allowedOrigins: [`http://localhost:${port}`, 'tauri://localhost', 'http://tauri.localhost'] })
const { serve } = await import('@hono/node-server')
const network = serve({ hostname: '127.0.0.1', port: 0, fetch: request => service.app.fetch(request) })
if (!network.listening) await new Promise(resolve => network.once('listening', resolve))
const address = network.address()
await publishDiscovery(lock, `http://127.0.0.1:${address.port}`)

// ---- Seed: one topic with a nine-section reading of a nine-page PDF and a notes file without one; one empty topic ----
const studio = service.application.studio
ensureTopic({ studio }, 'fe', TOPIC)
ensureTopic({ studio }, 'blank', EMPTY)
// The second line reads like a real quoted sentence (60–200 characters), so the screenshots show the quote line as a real reading does
const LINE = n => `Prediction error is minimised at level ${n}, so the representations there come to explain away the input that arrives from the level below.`
const pages = Array.from({ length: 9 }, (_, i) => [`Section ${i + 1} of the free energy principle`, LINE(i + 1)])
const pdf = await studio.library.add({ name: 'free-energy.pdf', bytes: pagedPdf(pages), addedBy: 'you' })
studio.topics.reference('fe', pdf.item.id)
const notes = await studio.library.add({ name: 'notes.md', bytes: new TextEncoder().encode('# Notes\n\nThe brain minimises free energy over time.'), addedBy: 'you' })
studio.topics.reference('fe', notes.item.id)
const WIDGET_HTML = `<div style="padding:14px 16px;font-family:system-ui,sans-serif;color:#1f1d1a;background:#fcfbf8">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">
    <strong style="font-size:14px">预测误差增益调节</strong>
    <span id="val" style="font-family:monospace;font-size:13px">3</span>
  </div>
  <svg viewBox="0 0 600 120" style="width:100%;height:auto;display:block;border:1px solid #dfd8cb;border-radius:8px;background:#fff;margin-bottom:10px">
    <rect x="24" y="34" width="120" height="52" rx="8" fill="#f1ede4" stroke="#256f6c" stroke-width="2"/>
    <text x="84" y="64" text-anchor="middle" font-size="13" fill="#256f6c">上层预测</text>
    <line x1="144" y1="60" x2="236" y2="60" stroke="#256f6c" stroke-width="2"/>
    <rect x="236" y="34" width="128" height="52" rx="8" fill="#f1ede4" stroke="#c87a28" stroke-width="2"/>
    <text x="300" y="64" text-anchor="middle" font-size="13" fill="#c87a28">误差比较器</text>
    <line x1="364" y1="60" x2="456" y2="60" stroke="#2f5b8f" stroke-width="2"/>
    <rect x="456" y="34" width="120" height="52" rx="8" fill="#f1ede4" stroke="#2f5b8f" stroke-width="2"/>
    <text x="516" y="64" text-anchor="middle" font-size="13" fill="#2f5b8f">表征更新</text>
  </svg>
  <div style="display:flex;align-items:center;gap:12px">
    <input id="gain" type="range" min="1" max="10" value="3" style="flex:1" oninput="document.getElementById('val').textContent=this.value"/>
    <button id="send-guess" type="button" style="padding:6px 12px;border:1px solid #256f6c;border-radius:6px;background:#256f6c;color:#fff;cursor:pointer" onclick="window.__widgetSendMessage('增益调到 ' + document.getElementById('gain').value)">发给 Lumen</button>
  </div>
</div>`

const TITLES = ['为什么值得读', '核心主张', '自由能与惊讶', '预测编码', '层级结构', '证据：重复抑制', '与强化学习的关系', '这篇论文没说明的', '我的判断']
for (const [i, title] of TITLES.entries()) {
  const paragraphs = [
    { text: `第 ${i + 1} 节的第一段。自由能是惊讶的上界，所以把它压低，就等于让大脑停在它预期的状态里；这一节从原文第 ${i + 1} 页出发，把这个主张拆成能检验的几步。`, source: { kind: 'paper', page: i + 1, quote: LINE(i + 1) } },
    { text: `第 ${i + 1} 节的第二段是我的推断：如果这个框架成立，那么同一个机制应该在感知和行动里都看得到，而不只是在视觉皮层。这一点原文没有直接证明。`, source: { kind: 'inference' } },
    { text: `第 ${i + 1} 节的第三段把前两段连起来：原文用的是“${pages[i]![0]}”这句话来立论，我们读到这里应当能说清楚，它到底在主张什么、又没有主张什么。`, source: { kind: 'paper', page: i + 1, quote: pages[i]![0]! } },
  ]
  if (i === 1) paragraphs.splice(1, 0, { kind: 'widget', title: '2D 活结构图：预测误差增益', html: WIDGET_HTML, caption: '拖动滑块看表征更新，点放大展开', source: { kind: 'inference' } })
  studio.readings.write('fe', pdf.item.id, { title, paragraphs }, { threadId: null, runId: null })
}

// ---- The vite dev page (the discovery file points at the isolated service) ----
const vite = spawn('npm', ['run', 'dev', '--', '--port', port, '--strictPort'], {
  cwd: new URL('../..', import.meta.url).pathname, stdio: 'ignore', detached: true,
  env: { ...process.env, LUMEN_MASTRA_HOME: root, BROWSER: 'none' },
})
process.on('exit', () => { try { process.kill(-vite.pid, 'SIGTERM') } catch { /* already gone */ } })
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://localhost:${port}/`)).ok) break } catch { /* not up yet */ }
  if (i > 120) throw new Error('vite dev page never came up')
  await new Promise(resolve => setTimeout(resolve, 500))
}

if (process.argv.includes('--hold')) {
  console.log('HOLD fixture ready at', root, '; vite on', port)
  await new Promise(() => {})
}
const useWebkit = process.argv.includes('--webkit')
const browser = useWebkit
  ? await webkit.launch()
  : await chromium.launch({ executablePath: exe })
/** Drag-select characters [from, to) of a paragraph's text with the real mouse; returns the selected sentence's box */
async function dragSelect(page, paragraph, from, to) {
  const box = await page.evaluate(([index, start, end]) => {
    // Map a character index of the paragraph's text to (text node, offset): footprints split the text into several nodes
    const paragraph = document.querySelectorAll('[data-paragraph]')[index]
    const at = position => {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
      let rest = position
      for (let node = walker.nextNode(); node; node = walker.nextNode()) { if (rest <= node.data.length) return [node, rest]; rest -= node.data.length }
      throw new Error(`no character ${position}`)
    }
    const range = document.createRange()
    range.setStart(...at(start)); range.setEnd(...at(start + 1))
    const a = range.getClientRects()[0]
    range.setStart(...at(end - 1)); range.setEnd(...at(end))
    const b = range.getClientRects()[0]
    range.setStart(...at(start)); range.setEnd(...at(end))
    const all = range.getBoundingClientRect()
    return { x0: a.left + 1, y0: a.top + a.height / 2, x1: b.right - 1, y1: b.top + b.height / 2, rect: { left: all.left, right: all.right, top: all.top, bottom: all.bottom } }
  }, [paragraph, from, to])
  await page.mouse.move(box.x0, box.y0)
  await page.mouse.down()
  await page.mouse.move(box.x1, box.y1, { steps: 8 })
  await page.mouse.up()
  return box.rect
}
/** Every text line box of the reading in view (paragraphs with their chips, section titles) that meets the sprite's figure */
const linesUnderSprite = page => page.evaluate(() => {
  const figure = document.querySelector('.sprite-orb')?.getBoundingClientRect()
  const view = document.querySelector('.reading-scroll').getBoundingClientRect()
  if (!figure) return { lines: 0, hits: ['no sprite figure'] }
  let lines = 0
  const hits = []
  for (const node of document.querySelectorAll('.reading-para, .reading-quote, .reading-section h2')) {
    const range = document.createRange(); range.selectNodeContents(node)
    for (const line of range.getClientRects()) {
      if (line.width === 0 || line.bottom <= view.top || line.top >= view.bottom) continue
      lines++
      if (line.left < figure.right && figure.left < line.right && line.top < figure.bottom && figure.top < line.bottom) hits.push(`${Math.round(line.left)}–${Math.round(line.right)} @${Math.round(line.top)}`)
    }
  }
  return { lines, hits }
})
/** A paragraph's text lines and where a span [from, to) of it sits: the distinct line tops of the text, the first line of the span, the line the text before it ends on */
const textLines = (page, paragraph, from, to) => page.evaluate(([index, start, end]) => {
  const node = document.querySelectorAll('[data-paragraph]')[index]
  const at = position => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
    let rest = position
    for (let text = walker.nextNode(); text; text = walker.nextNode()) { if (rest <= text.data.length) return [text, rest]; rest -= text.data.length }
    throw new Error(`no character ${position}`)
  }
  const tops = range => [...new Set([...range.getClientRects()].filter(line => line.width > 0).map(line => Math.round(line.top)))]
  const range = document.createRange()
  range.selectNodeContents(node)
  const lines = tops(range).length
  range.setStart(...at(start)); range.setEnd(...at(end))
  const span = tops(range)
  range.setStart(...at(start - 1)); range.setEnd(...at(start))
  const before = range.getClientRects()[0]
  return { lines, spanLines: span.length, spanTop: span[0], beforeTop: Math.round(before.top), beforeRight: before.right }
}, [paragraph, from, to])
const rect = (page, selector) => page.evaluate(target => { const r = document.querySelector(target)?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null }, selector)

try {
  const matrix = useWebkit
    ? [['zh', 1440, 900, false], ['en', 1280, 800, true]]
    : [['zh', 1440, 900, false], ['zh', 1440, 900, true], ['zh', 1280, 800, false], ['zh', 1280, 800, true],
       ['en', 1440, 900, false], ['en', 1440, 900, true], ['en', 1280, 800, false], ['en', 1280, 800, true]]
  let pass = 0
  for (const [locale, w, h, dark] of matrix) {
    const M = catalogs[locale], S = M.studio, tag = `${useWebkit ? 'webkit ' : ''}${locale} ${w} ${dark ? 'dark' : 'light'}`
    const name = n => `${out}/${useWebkit ? 'webkit-' : ''}${locale}-${w}-${dark ? 'dark' : 'light'}-${n}.png`
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(seedLocale, locale)
    if (dark) await page.addInitScript(seedDark)
    await page.goto(`http://localhost:${port}/`)
    await page.waitForSelector('.studio-topics .topic')

    // ---- Empty state (light passes): the typewriter alone, no text and no button ----
    if (!dark) {
      await page.locator('.studio-topics .topic', { hasText: EMPTY }).click()
      await page.waitForSelector('.reading-empty')
      check(`${tag} 空态只有打字机、没有文字和按钮`, !!(await page.$('.reading-typewriter')) && !(await page.$('.reading-start button')) && !(await page.$('.reading-start p')))
      await page.screenshot({ path: name('empty') })
    }
    await page.locator('.studio-topics .topic', { hasText: TOPIC }).click()
    await page.waitForSelector('.material-reading')
    const tabs = await page.$$eval('.studio-views:not(.studio-views-ghost) [role=tab]', nodes => nodes.map(node => [node.getAttribute('aria-label'), node.getAttribute('aria-selected')]))
    check(`${tag} 解读是第一个视图且默认选中`, tabs[0]?.[0] === S.views.reading && tabs[0]?.[1] === 'true' && tabs.length === 6, JSON.stringify(tabs.map(t => t[0])))
    // The PDF's title resolves to its first-page heading; the row action opens the existing reading
    await page.locator('.material').filter({ hasText: /free energy principle|free-energy/i }).locator('.material-reading').click()
    await page.waitForFunction(() => document.querySelectorAll('.reading-section').length === 9)

    // ---- Column: prose stays ≤700px centred; column ≤960px lets widgets expand wider when room allows; zero horizontal overflow ----
    const column = await page.evaluate(() => {
      // Centred within the content box: the view pads the side where the sprite sits
      const scroller = document.querySelector('.reading-scroll'), style = getComputedStyle(scroller), box = scroller.getBoundingClientRect()
      const col = document.querySelector('.reading-column').getBoundingClientRect()
      const paraBox = document.querySelector('.reading-para').getBoundingClientRect()
      const widgetBox = document.querySelector('.reading-block-widget')?.getBoundingClientRect()
      const stage = { left: box.left + parseFloat(style.paddingLeft), right: box.left + scroller.clientWidth - parseFloat(style.paddingRight), width: scroller.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) }
      const para = getComputedStyle(document.querySelector('.reading-para')).fontFamily, ui = getComputedStyle(document.querySelector('.reading-num')).fontFamily
      return { width: col.width, paraWidth: paraBox.width, widgetWidth: widgetBox?.width ?? 0, stageWidth: stage.width,
        overflowX: scroller.scrollWidth > scroller.clientWidth + 1,
        centred: Math.abs((paraBox.left - stage.left) - (stage.right - paraBox.right)) <= 16 || paraBox.width >= stage.width - 57,
        colCentred: Math.abs((col.left - stage.left) - (stage.right - col.right)) <= 16 || col.width >= stage.width - 1,
        para, ui,
        nums: [...document.querySelectorAll('.reading-num')].map(node => node.textContent).join(','), chips: [...document.querySelectorAll('.reading-section')][0].querySelectorAll('.reading-chip').length }
    })
    check(`${tag} 文字栏居中且不超过 700px`, column.paraWidth <= 700 && column.centred, `para=${Math.round(column.paraWidth)}px col=${Math.round(column.width)}px`)
    check(`${tag} 栏宽不超过 960px 且无横向溢出`, column.width <= 960 && column.colCentred && !column.overflowX, `col=${Math.round(column.width)}px stage=${Math.round(column.stageWidth)}px overflowX=${column.overflowX}`)
    check(`${tag} widget 随栏宽舒展（视口充裕时大于文字栏）`, column.widgetWidth > 0 && (column.stageWidth > 760 ? column.widgetWidth > column.paraWidth : column.widgetWidth <= column.stageWidth + 1), `widget=${Math.round(column.widgetWidth)}px para=${Math.round(column.paraWidth)}px`)
    check(`${tag} 正文用阅读字体（不同于界面字体）`, column.para !== column.ui, column.para.slice(0, 60))
    check(`${tag} 页头只有标题`, await page.evaluate(() => { const head = document.querySelector('.reading-head'); return head.children.length === 1 && head.firstElementChild.classList.contains('reading-title') }))
    check(`${tag} 节标题编号`, column.nums === '1,2,3,4,5,6,7,8,9', column.nums)
    check(`${tag} 每段末尾有出处签`, column.chips === 3)
    check(`${tag} 原文签与推断签文字`, (await page.textContent('.reading-section .reading-chip')) === S.reading.page(1) && (await page.textContent('.reading-chip.source-chip-inferred')) === S.reading.inference)
    // ---- Every paper paragraph shows its quote under it: visible, inside the column, smaller than the body, readable (contrast ≥ 4.5:1) ----
    const quoteLook = await page.evaluate(() => {
      const rgb = value => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
      const lum = ([r, g, b]) => { const f = c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
      const surface = node => { for (let at = node; at; at = at.parentElement) { const bg = getComputedStyle(at).backgroundColor; if (bg && !/rgba\(.*,\s*0\)$/.test(bg) && bg !== 'transparent') return bg } return 'rgb(255,255,255)' }
      const first = document.querySelector('.reading-section')
      const paper = first.querySelectorAll('.reading-para:not(.is-inference)').length, quotes = [...first.querySelectorAll('.reading-quote')]
      const q = quotes[0], body = first.querySelector('.reading-para'), col = document.querySelector('.reading-column').getBoundingClientRect(), box = q.getBoundingClientRect()
      const a = lum(rgb(getComputedStyle(q).color)), b = lum(rgb(surface(q)))
      return { paper, quotes: quotes.length, under: q.previousElementSibling === body, chip: !!q.querySelector('.reading-chip'), inside: box.left >= col.left - 1 && box.right <= col.right + 1,
        smaller: parseFloat(getComputedStyle(q).fontSize) < parseFloat(getComputedStyle(body).fontSize), contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), text: q.textContent.slice(0, 40) }
    })
    check(`${tag} 每个原文段下面有引文行，签在引文末尾`, quoteLook.paper === quoteLook.quotes && quoteLook.under && quoteLook.chip, JSON.stringify({ paper: quoteLook.paper, quotes: quoteLook.quotes }))
    check(`${tag} 引文行可见、在栏内`, quoteLook.inside && await visibleAt(page, '.reading-quote'), quoteLook.text)
    check(`${tag} 引文比正文小`, quoteLook.smaller)
    check(`${tag} 引文对比度 ≥ 4.5`, quoteLook.contrast >= 4.5, quoteLook.contrast.toFixed(2))
    const clearTop = await linesUnderSprite(page)
    check(`${tag} 视口内每行正文都不压在精灵下（顶部）`, clearTop.lines > 10 && clearTop.hits.length === 0, `${clearTop.lines} lines; ${clearTop.hits.slice(0, 3).join(', ')}`)
    if (pass > 0) check(`${tag} 前几次页面的足迹重建`, (await page.$$('.reading-footprint')).length >= 1, String((await page.$$('.reading-footprint')).length))
    await page.screenshot({ path: name('reading') })

    // ---- Nine sections scroll inside the view: panes and headers stay put, the page itself does not scroll ----
    const before = { topics: await rect(page, '.studio-topics'), materials: await rect(page, '.studio-materials'), head: await rect(page, '.studio-center-head') }
    const scroll = await page.evaluate(() => { const s = document.querySelector('.reading-scroll'); return { inner: s.scrollHeight > s.clientHeight + 200, page: document.scrollingElement.scrollHeight <= innerHeight + 1 } })
    await page.locator('.reading-section').last().scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    const after = { topics: await rect(page, '.studio-topics'), materials: await rect(page, '.studio-materials'), head: await rect(page, '.studio-center-head') }
    check(`${tag} 九节在视图内滚动，页面不滚`, scroll.inner && scroll.page && await page.evaluate(() => scrollY === 0), JSON.stringify(scroll))
    check(`${tag} 滚动后左右栏与中栏头部不动`, JSON.stringify(before) === JSON.stringify(after))
    check(`${tag} 最后一节可见`, await visibleAt(page, '.reading-section:last-of-type h2'))
    await page.evaluate(() => { const s = document.querySelector('.reading-scroll'); s.scrollTop = s.scrollHeight })
    await page.waitForTimeout(200)
    const clearEnd = await linesUnderSprite(page)
    check(`${tag} 视口内每行正文都不压在精灵下（底部）`, clearEnd.lines > 10 && clearEnd.hits.length === 0, `${clearEnd.lines} lines; ${clearEnd.hits.slice(0, 3).join(', ')}`)
    await page.screenshot({ path: name('scrolled') })

    // ---- Near the bottom the window opens above the selection, never over it ----
    const lastPara = (await page.$$('[data-paragraph]')).length - 1
    await page.evaluate(index => { const node = document.querySelectorAll('[data-paragraph]')[index]; const scroller = document.querySelector('.reading-scroll'); scroller.scrollTop += node.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom + 24 }, lastPara)
    await page.waitForTimeout(200)
    const low = await dragSelect(page, lastPara, 2, 18)
    await page.waitForSelector('.reading-ask[data-placed="true"]')
    await page.waitForTimeout(150)
    const lowWindow = await rect(page, '.reading-ask')
    check(`${tag} 靠底时小窗在选区上方、不盖句子`, !overlaps(lowWindow, low) && lowWindow.bottom <= low.top, `win ${Math.round(lowWindow.top)}–${Math.round(lowWindow.bottom)} sel ${Math.round(low.top)}–${Math.round(low.bottom)}`)
    check(`${tag} 靠底时小窗、输入、发送可点`, await visibleAt(page, '.reading-ask') && await visibleAt(page, '.reading-ask textarea') && await visibleAt(page, '.reading-ask-send'))
    await page.screenshot({ path: name('ask-above') })
    await page.keyboard.press('Escape')
    check(`${tag} Esc 关窗`, !(await page.$('.reading-ask')))

    // ---- Near the top: a real selection inside one paragraph opens the window under it; centre, input and send pass the hit test ----
    // Each pass asks in its own section's inference paragraph (earlier passes' footprints stay elsewhere), scrolled near the top of the view
    // The asked sentence starts mid-line and runs onto the next line, so a footprint that is not inline text would jump to its own line (G4)
    const asked = pass * 3 + 1
    await page.evaluate(index => { const node = document.querySelectorAll('[data-paragraph]')[index]; const scroller = document.querySelector('.reading-scroll'); scroller.scrollTop += node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 120 }, asked)
    await page.waitForTimeout(200)
    const [from, to] = await page.evaluate(index => { const text = document.querySelectorAll('[data-paragraph]')[index].textContent; return [text.indexOf('如果'), text.indexOf('这一点')] }, asked)
    const plain = await textLines(page, asked, from, to)
    check(`${tag} 所问句子从行中开始并折到下一行`, plain.spanTop === plain.beforeTop && plain.spanLines >= 2, JSON.stringify(plain))
    const sentence = await dragSelect(page, asked, from, to)
    check(`${tag} 焦点在小窗输入里`, await page.evaluate(() => document.activeElement?.matches('.reading-ask textarea') ?? false))
    await page.waitForSelector('.reading-ask[data-placed="true"]')
    await page.waitForTimeout(150)
    const win = await rect(page, '.reading-ask')
    check(`${tag} 小窗在选区下方、不盖句子`, !overlaps(win, sentence) && win.top >= sentence.bottom, `win ${Math.round(win.top)} sel ${Math.round(sentence.bottom)}`)
    check(`${tag} 小窗中心可点`, await visibleAt(page, '.reading-ask'))
    check(`${tag} 输入可点`, await visibleAt(page, '.reading-ask textarea'))
    check(`${tag} 发送可点`, await visibleAt(page, '.reading-ask-send'))
    check(`${tag} 引文最多两行`, await page.evaluate(() => { const q = document.querySelector('.reading-ask-quote'); return q.getBoundingClientRect().height <= parseFloat(getComputedStyle(q).lineHeight) * 2 + 1 }))
    await page.screenshot({ path: name('ask-open') })
    await page.fill('.reading-ask textarea', locale === 'zh' ? '为什么说是上界？' : 'Why is it an upper bound?')
    await page.press('.reading-ask textarea', 'Enter')
    await page.waitForFunction(answer => [...document.querySelectorAll('.reading-ask-reply')].some(node => node.textContent.includes(answer)), ANSWER, { timeout: 30000 })
    const answered = await rect(page, '.reading-ask')
    check(`${tag} 回答出现在小窗里，窗仍不盖句子`, !overlaps(answered, sentence))
    check(`${tag} 回答后输入与发送仍可点`, await visibleAt(page, '.reading-ask textarea') && await visibleAt(page, '.reading-ask-send'))
    await page.screenshot({ path: name('ask-answered') })
    await page.keyboard.press('Escape')
    await page.waitForFunction(index => !!document.querySelectorAll('[data-paragraph]')[index].querySelector('.reading-footprint'), asked)
    const mark = await page.evaluate(index => { const node = document.querySelectorAll('[data-paragraph]')[index].querySelector('.reading-footprint'); node.setAttribute('data-just-asked', ''); return node.textContent }, asked)
    check(`${tag} 问过的句子留下足迹`, await visibleAt(page, '[data-just-asked]'), mark)
    const marked = await textLines(page, asked, from, to)
    const first = await page.evaluate(() => { const r = document.querySelector('[data-just-asked]').getClientRects()[0]; return { top: Math.round(r.top), left: r.left } })
    check(`${tag} 足迹不改变段落行数`, marked.lines === plain.lines, `${plain.lines} → ${marked.lines}`)
    check(`${tag} 足迹第一行与前文同一行`, first.top === marked.beforeTop && Math.abs(first.left - marked.beforeRight) < 2 && marked.spanTop === plain.spanTop,
      `footprint @${first.top}/${Math.round(first.left)} before @${marked.beforeTop}/${Math.round(marked.beforeRight)}`)
    await page.screenshot({ path: name('footprint') })

    // ---- E1/E2/E3: explorable widget wide layout, in-place expand (state preserved, single load, solid light surface, 8b13fde gate), Esc restore & split-view convergence ----
    if ((locale === 'zh' && w === 1440 && !dark) || (locale === 'en' && w === 1280 && dark)) {
      await page.locator('.reading-block-widget').scrollIntoViewIfNeeded()
      await page.waitForTimeout(400)
      let frame = null
      for (let attempt = 0; attempt < 60; attempt++) {
        const candidate = page.frames().find(item => item.url().includes('widget-receiver.html'))
        if (candidate && await candidate.locator('#gain').count().catch(() => 0) > 0) { frame = candidate; break }
        await page.waitForTimeout(150)
      }
      if (!frame) throw new Error('widget receiver frame with #gain did not appear')
      await frame.locator('#gain').waitFor({ state: 'visible', timeout: 10000 })
      // Count any reload on the iframe from here on (must stay 0 across expand + collapse => total load = 1)
      await page.evaluate(() => {
        const iframe = document.querySelector('.reading-block-widget iframe')
        window.__widgetReloads = 0
        iframe.addEventListener('load', () => { window.__widgetReloads++ })
      })
      // Mutate control inside the widget before expanding
      await frame.locator('#gain').fill('8')
      await frame.locator('#gain').dispatchEvent('input')
      const beforeWidget = await page.evaluate(() => ({
        scrollTop: document.querySelector('.reading-scroll').scrollTop,
        height: document.querySelector('.reading-block-widget iframe').getBoundingClientRect().height,
        slotHeight: document.querySelector('.reading-widget-slot').getBoundingClientRect().height,
      }))
      await page.screenshot({ path: name('widget-inline') })

      // Expand in place
      await page.click('.reading-widget-toggle')
      await page.waitForSelector('.reading-widget.is-expanded')
      await page.waitForTimeout(250)
      const expandedInfo = await page.evaluate(() => {
        const box = document.querySelector('.reading-widget.is-expanded')
        const cs = getComputedStyle(box)
        const slot = document.querySelector('.reading-widget-slot')
        return {
          position: cs.position, bg: cs.backgroundColor,
          width: box.getBoundingClientRect().width, height: box.getBoundingClientRect().height,
          slotMinHeight: parseFloat(slot.style.minHeight || '0'),
          fill: !!box.querySelector('.widget-frame-fill'),
        }
      })
      const valExpanded = await frame.locator('#gain').inputValue()
      const toggleClickable = await visibleAt(page, '.reading-widget.is-expanded .reading-widget-toggle')
      check(`${tag} 原地放大：position:fixed、实色浅底、占满视口、原位留占位、顶层不被侧栏遮挡`, expandedInfo.position === 'fixed' && expandedInfo.bg === 'rgb(255, 255, 255)' && expandedInfo.fill && expandedInfo.slotMinHeight >= beforeWidget.slotHeight - 2 && toggleClickable, JSON.stringify({ ...expandedInfo, toggleClickable }))
      check(`${tag} 放大后控件状态保持不变`, valExpanded === '8', `gain=${valExpanded}`)
      await page.screenshot({ path: name('widget-expanded') })

      // 8b13fde in expanded state: unclicked __widgetSendMessage is blocked; real click sends with R13 marker
      const beforeSessions = await service.application.studio.db.prepare('SELECT 1').all()
      void beforeSessions
      const msgCount = async () => {
        const res = await fetch(`http://127.0.0.1:${address.port}/lumen/topics/fe/sessions`, { headers: { Authorization: `Bearer ${lock.identity}` } })
        const sessions = (await res.json()).items
        let total = 0
        for (const s of sessions) {
          const id = encodeURIComponent(`fe:${s.taskId}`)
          const r = await fetch(`http://127.0.0.1:${address.port}/api/agent-controller/lumen/sessions/${id}/threads/${id}/messages`, { headers: { Authorization: `Bearer ${lock.identity}` } })
          const msgs = (await r.json()).messages ?? []
          total += msgs.length
        }
        return total
      }
      const count0 = await msgCount()
      // Wait for user-activation window from the expand click (outer doc) to not affect iframe; inside iframe no click happened yet
      await frame.locator('#val').evaluate(() => { window.__widgetSendMessage('无点击偷发') })
      await page.waitForTimeout(300)
      const countAfterUnclicked = await msgCount()
      check(`${tag} 放大态未点击调用 __widgetSendMessage 被拦（8b13fde）`, countAfterUnclicked === count0, `${count0} -> ${countAfterUnclicked}`)

      // Real click inside expanded iframe sends with R13 marker
      await frame.locator('#send-guess').click()
      await page.waitForFunction(async ([base, tok, prev]) => {
        const res = await fetch(`${base}/lumen/topics/fe/sessions`, { headers: { Authorization: `Bearer ${tok}` } })
        const sessions = (await res.json()).items
        for (const s of sessions) {
          const id = encodeURIComponent(`fe:${s.taskId}`)
          const r = await fetch(`${base}/api/agent-controller/lumen/sessions/${id}/threads/${id}/messages`, { headers: { Authorization: `Bearer ${tok}` } })
          const msgs = (await r.json()).messages ?? []
          const txt = JSON.stringify(msgs)
          if (txt.includes('— 小实验') && txt.includes('增益调到 8') && txt.includes('收到小实验参数')) return true
        }
        return false
      }, [`http://127.0.0.1:${address.port}`, lock.identity, count0], { timeout: 15000 })
      check(`${tag} 放大态真点击发出带 R13 标记的消息并获回复（8b13fde）`, true)

      // Collapse by clicking the toggle button, then expand again and collapse by Esc: both preserve state, scrollTop, height and load count = 1
      await page.click('.reading-widget.is-expanded .reading-widget-toggle')
      await page.waitForFunction(() => !document.querySelector('.reading-widget.is-expanded'))
      await page.waitForTimeout(250)
      const valAfterBtn = await frame.locator('#gain').inputValue()
      const reloadsAfterBtn = await page.evaluate(() => window.__widgetReloads)
      check(`${tag} 点收起按钮后控件值不变且 iframe 未重载`, valAfterBtn === '8' && reloadsAfterBtn === 0, `gain=${valAfterBtn} reloads=${reloadsAfterBtn}`)

      await page.click('.reading-widget-toggle')
      await page.waitForSelector('.reading-widget.is-expanded')
      await page.waitForTimeout(150)
      await page.keyboard.press('Escape')
      await page.waitForFunction(() => !document.querySelector('.reading-widget.is-expanded'))
      await page.waitForTimeout(300)
      const afterCollapse = await page.evaluate(() => ({
        reloads: window.__widgetReloads,
        scrollTop: document.querySelector('.reading-scroll').scrollTop,
        height: document.querySelector('.reading-block-widget iframe').getBoundingClientRect().height,
        fill: !!document.querySelector('.reading-widget .widget-frame-fill'),
      }))
      const valAfter = await frame.locator('#gain').inputValue()
      check(`${tag} 收起后控件值不变且 iframe 仅加载 1 次`, valAfter === '8' && afterCollapse.reloads === 0 && !afterCollapse.fill, JSON.stringify({ valAfter, ...afterCollapse }))
      check(`${tag} 收起后高度与滚动位置还原`, Math.abs(afterCollapse.height - beforeWidget.height) <= 40 && Math.abs(afterCollapse.scrollTop - beforeWidget.scrollTop) <= 8, JSON.stringify({ before: beforeWidget, after: afterCollapse }))

      // Split reader convergence: open PDF alongside and check no overflow
      await page.locator('.reading-section .reading-chip').first().click()
      await page.waitForSelector('.studio-split')
      await page.locator('.reading-block-widget').scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)
      const splitInfo = await page.evaluate(() => {
        const scroller = document.querySelector('.reading-scroll')
        const paraW = document.querySelector('.reading-para').getBoundingClientRect().width
        const widgetW = document.querySelector('.reading-block-widget').getBoundingClientRect().width
        return { overflowX: scroller.scrollWidth > scroller.clientWidth + 1, paraW, widgetW, clientW: scroller.clientWidth }
      })
      check(`${tag} 分屏下文字与 widget 自动收敛、无横向溢出`, !splitInfo.overflowX && splitInfo.paraW <= 700 && splitInfo.widgetW <= splitInfo.clientW + 1, JSON.stringify(splitInfo))
      await page.screenshot({ path: name('widget-split') })
      await page.click(`.studio-reader .reader-actions button[aria-label="${S.reader.close}"]`)
      await page.waitForFunction(() => !document.querySelector('.studio-split'))
      await page.waitForTimeout(150)
    }

    // ---- Once: the live write from the Materials row; sections appear while the run goes on ----
    if (pass === 0) {
      await page.locator('.material').filter({ hasText: /notes/i }).locator('.material-reading').click()
      await page.waitForSelector('.reading-section')
      const live = await page.$$eval('.reading-section', nodes => nodes.length)
      check(`${tag} 写解读后第一节随工具完成出现`, live >= 1, String(live))
      if (live === 1) check(`${tag} 已有一节时提示下一节，不再说第一节`, (await page.textContent('.reading-more')) === S.reading.more)
      await page.screenshot({ path: name('live-first') })
      await page.waitForFunction(() => document.querySelectorAll('.reading-section').length === 2, null, { timeout: 30000 })
      await page.waitForFunction(() => !document.querySelector('.reading-more'), null, { timeout: 30000 })
      check(`${tag} 无页材料的原文签不写页码`, (await page.textContent('.reading-chip')) === S.reading.paper)
      check(`${tag} 行内按钮变为「打开解读」`, (await page.locator('.material').filter({ hasText: /notes/i }).locator('.material-reading').textContent()) === S.reading.open)
      await page.screenshot({ path: name('live-done') })
    }
    check(`${tag} 无脚本错误`, !errors.length, errors.join('; ').slice(0, 200))
    await context.close()
    pass++
  }
} catch (error) {
  failure = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
  failed++
} finally {
  results.forEach(line => console.log(line))
  if (failure) console.log(`ERROR\n${failure}`)
  console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILURES`)
  await browser.close()
  network.close()
  await service.close()
  await removeDiscovery(lock)
  lock.release()
  try { process.kill(-vite.pid, 'SIGTERM') } catch { /* already gone */ }
  await rm(root, { recursive: true, force: true })
  process.exit(failed === 0 ? 0 : 1)
}
