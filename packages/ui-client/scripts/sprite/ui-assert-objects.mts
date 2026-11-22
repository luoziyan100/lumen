/**
 * [INPUT]: ./nav-tips.ts for the V6 measurement; ./music-checks.ts and ./music-sound-checks.ts for the music kit; a self-contained isolated fixture service (real Controller + controllable model: writes one reading section, holding it until the script releases it) and the vite
 *          dev page on PORT (default 5191, refused when already taken); data root LUMEN_ASSERT_ROOT (default /tmp/lumen-obj-data, /tmp/lumen-* only, wiped at start); seeded topics: one with a material, takeaways and no sheet, one empty, one already read and drawn on
 * [OUTPUT]: browser evidence for the objects in the product (1440x900 and 1280x800, light and dark, zh and en): each object shows only in its empty state (typewriter: no
 *           reading, alone and centred; cabinet: no material, alone and centred; box: room under the topic list; easel: no sheet, or a live sheet with no stroke (V0), alone and centred on the canvas;
 *           press: no takeaway, alone and centred, gone with one (and 「写一条沉淀」 back) (V1); cork board, lamp and type case alone and centred (V2–V4), named 「还没开放」 for screen readers only;
 *           every empty view holds only its object: min(560px, its room) wide, centre within 8px of the view's, no visible text outside the drawing, no button;
 *           the real controls next to them pass elementFromPoint (the Materials row's 写解读, upload, 写一条沉淀 once a takeaway exists, every view tab, ＋ new sheet, the lone tab and its 「⋯」, the canvas's zoom (Excalidraw's own since the canvas), Settings, every topic);
 *           the lamp's pool overlaps no text and no control; objects are aria-hidden, untabbable and never take focus; the box's card carries the topic's newest takeaway and
 *           a click on it changes nothing else; settled at rest, hovered and opened (no transition still running, only looping animations: the objects move on purpose); reduced motion leaves no transition over 100ms;
 *           the typewriter types (with no state line) while a reading requested from the row has no section and stops at the first one (zh 1440 light); one sheet shows one tab (glyph + 1) whose 「⋯」 still
 *           deletes it (V8); the box's boundary measured on both sides at 1440×900 and 1440×700 (topics added one by one), a 900→700→900 drag that folds and restores it once
 *           each way with the first/last rows and Settings unmoved; no console or page errors. V6 in Chromium and WebKit, zh and en: with icons only and the sprite parked under
 *           the navigation, every tab shows its name within 600ms by hover and by keyboard Tab, under the tab, inside the window, on top of the sprite, its name in title drawn by Tips (title borrowed while shown, so no native box); a pane toggle's title shows the same tip and comes back on leave.
 *           WebKit: rest and open captures of every object (zh 1440×1400 light). KIT=music (./music-checks.ts) seeds the music kit and runs the same checks on the music objects, then adds:
 *           the switch in Settings › Appearance without a reload, persistence after a reload, and the return to Instruments (every visible SVG byte-identical; the Ideas view pixel-identical,
 *           since most original instruments rasterize differently on any remount); ONLY=switch runs only that block, ONLY=sound only the sound and speaker checks; the piano playing and its staff drawing while a reading is written;
 *           notes inside their object and clear of text and controls over 10 frames on hover and click; the live sound and the header speaker of ./music-sound-checks.ts; a WebKit capture of the appearance pane
 * [POS]: an acceptance script that swaps the model network only and touches no product protocol; Chromium runs with --disable-gpu. Screenshots land in the evidence directory, never in the repo. Usage: node --experimental-strip-types ui-assert-objects.mts <evidence-dir> [--no-easel]. Prints BOX_BOUNDARY for the report
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { chromium, webkit } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
import { mkdir, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { assertPortFree, assertRoot } from './assert-env.ts'
import { compactNav, spriteUnderNav, tipChecks } from './nav-tips.ts'
import { KITS, listenAudio, notesClear, pickKit, pixelDiff, seedKit, still, type Kit } from './music-checks.ts'
import { headChecks, soundChecks } from './music-sound-checks.ts'
import { writeFile } from 'node:fs/promises'
import { createHttpService } from '../../../mastra-service/src/server.ts'
import { acquireServiceLock } from '../../../mastra-service/src/deployment/lock.ts'
import { publishDiscovery } from '../../../mastra-service/src/deployment/discovery.ts'
import { fixtureProvider, textReply, toolReply } from '../../../mastra-service/tests/provider-fixture.ts'
import { ensureTopic } from '../../../mastra-service/tests/topic-fixture.ts'
import { element } from '../../../mastra-service/tests/studio/canvas-fixtures.ts'

const out = process.argv[2]
if (!out) throw new Error('evidence dir required')
const EASEL = !process.argv.includes('--no-easel')
const KIT: Kit = process.env.KIT === 'music' ? 'music' : 'instruments', SVG = KITS[KIT], MUSIC = KIT === 'music'
const SWITCH_ONLY = MUSIC && process.env.ONLY === 'switch', SOUND_ONLY = MUSIC && process.env.ONLY === 'sound', FOCUS = SWITCH_ONLY || SOUND_ONLY
const catalogs = { zh: (await import('../../src/i18n/locales/zh.ts')).zh, en: (await import('../../src/i18n/locales/en.ts')).en }
const seedLocale = locale => localStorage.setItem('lumen:locale.v1', JSON.stringify({ version: 1, locale }))
const seedDark = () => localStorage.setItem('lumen:appearance.v2', JSON.stringify({ version: 1, mode: 'dark', skinId: 'yan-clear', overlay: 0, blurPx: 0, latinFont: 'source-serif', cjkFont: 'wenkai', justify: false }))
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const port = process.env.PORT ?? '5191'
const root = assertRoot('/tmp/lumen-obj-data')
assertPortFree(port)
const READ = '读一篇笔记', BLANK = '空的主题', DONE = '读过画过', LIVE = '正在写'
const NEWEST = '预测往下走，误差往上报；大脑多半时间在猜，而且猜得相当好，只有落差才往上传。'
const results = []
let boxBoundary: Record<number, { shown: number; hidden: number }> = {}
let failed = 0
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++ }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
/** The hit test at the centre of the element lands on it or inside it */
const hits = (page, selector) => page.evaluate(target => {
  const element = document.querySelector(target)
  if (!element) return false
  const box = element.getBoundingClientRect(), hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  return box.width > 0 && !!hit && (hit === element || element.contains(hit))
}, selector)
const allHit = (page, selector) => page.evaluate(target => [...document.querySelectorAll(target)].every(element => {
  const box = element.getBoundingClientRect(), hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  return box.width > 0 && !!hit && (hit === element || element.contains(hit))
}), selector)
/** Settled: no transition is still running inside the object and every running animation is a loop. The objects move on purpose
 *  (the plotter draws, the belt advances), so pixels never hold still; a state change that never finishes or a one-shot stuck mid-way does */
const settled = (page, selector) => page.evaluate(target => {
  const host = document.querySelector(target)
  if (!host) return 'missing'
  const running = host.getAnimations({ subtree: true }).filter(a => a.playState === 'running')
  const moving = running.filter(a => a.constructor.name === 'CSSTransition').map(a => (a as CSSTransition).transitionProperty)
  const stuck = running.filter(a => a.constructor.name !== 'CSSTransition' && a.effect?.getTiming().iterations !== Infinity).map(a => (a as CSSAnimation).animationName)
  const loops = running.length - moving.length - stuck.length
  return moving.length || stuck.length ? JSON.stringify({ moving, stuck }) : `ok:${loops}`
}, selector)
/** An object is decoration: aria-hidden, untabbable, its SVG passes pointer events through, and a mousedown on it leaves focus where it was */
const decoration = (page, selector) => page.evaluate(target => {
  const host = document.querySelector(target)
  if (!host) return 'missing'
  const focusables = host.querySelectorAll('a, button, input, textarea, select, [tabindex]').length
  const svg = host.querySelector('svg')
  return host.getAttribute('aria-hidden') === 'true' && host.tabIndex < 0 && !host.hasAttribute('tabindex') && focusables === 0 && getComputedStyle(svg).pointerEvents === 'none' ? 'ok' : `aria=${host.getAttribute('aria-hidden')} tab=${host.tabIndex} focusables=${focusables} pe=${getComputedStyle(svg).pointerEvents}`
}, selector)

// ---- The controllable model: one section for a requested reading, held until the script opens the gate ----
let openGate = () => {}
let gate = new Promise(resolve => { openGate = resolve })
const model = (() => {
  let calls = 0
  return fixtureProvider(async request => {
    const index = request.messages.map(message => message.role).lastIndexOf('user')
    const text = JSON.stringify(request.messages[index])
    const results = request.messages.slice(index).filter(message => message.role === 'tool').length
    const item = /材料 id：([^）"\\]+)/.exec(text)?.[1]
    if (text.includes('写一份解读') && item) {
      if (results === 0) { await gate; return toolReply('reading_write', { itemId: item, title: '笔记在说什么', paragraphs: [{ text: '这份笔记把大脑说成一台不断预测的机器。', source: { kind: 'inference' } }] }, `call-${++calls}`) }
      return textReply('写好了。')
    }
    return textReply('好')
  })
})()

await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true, mode: 0o700 })
await mkdir(out, { recursive: true })
const lock = acquireServiceLock(root)
const service = await createHttpService({ dataRoot: root, token: lock.identity,
  model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: model.fetch }, allowedOrigins: [`http://localhost:${port}`] })
const { serve } = await import('@hono/node-server')
const network = serve({ hostname: '127.0.0.1', port: 0, fetch: request => service.app.fetch(request) })
if (!network.listening) await new Promise(resolve => network.once('listening', resolve))
await publishDiscovery(lock, `http://127.0.0.1:${network.address().port}`)

// ---- Seed: READ has a material, two takeaways and no sheet; BLANK has no material, no takeaway and no sheet; DONE has a reading, a drawn sheet and one takeaway;
//      LIVE has a material for the live write and keeps its first sheet, live and blank (V0) ----
const studio = service.application.studio
for (const [id, title] of [['read', READ], ['blank', BLANK], ['done', DONE], ['live', LIVE]]) ensureTopic({ studio }, id, title)
const add = async (name, body) => (await studio.library.add({ name, bytes: new TextEncoder().encode(body), addedBy: 'you' })).item
const notes = await add('predictive-notes.md', '# Notes\n\nThe brain minimises free energy over time.')
studio.topics.reference('read', notes.id)
studio.sediment.create('read', { text: '注意力是一次查表。', origin: 'typed' })
await sleep(20)
studio.sediment.create('read', { text: NEWEST, origin: 'typed' })
const done = await add('done-notes.md', '# Done\n\nAlready read.')
studio.topics.reference('done', done.id)
studio.sediment.create('done', { text: '只有这一句。', origin: 'typed' })
studio.readings.write('done', done.id, { title: '读过了', paragraphs: [{ text: '这一节已经写好。', source: { kind: 'inference' } }] }, { threadId: null, runId: null })
const sheet = studio.board.createSheet('done')
studio.board.canvas.save(sheet.id, [element('drawn', 'rectangle', { x: 80, y: 80, width: 200, height: 100 })])
const live = await add('live-notes.md', '# Live\n\nTo be read now.')
studio.topics.reference('live', live.id)
// A topic opens with its first sheet; the no-sheet state (the easel's) comes from deleting it (R17), as a person would
for (const id of ['read', 'blank']) for (const sheet of studio.board.sheets(id)) studio.board.deleteSheet(id, sheet.id, { confirmed: true, busy: new Set(), since: new Date().toISOString() })

// ---- The vite dev page (the discovery file points at the isolated service) ----
const vite = spawn('npm', ['run', 'dev', '--', '--port', port, '--strictPort'], {
  cwd: new URL('../..', import.meta.url).pathname, stdio: 'ignore', detached: true, env: { ...process.env, LUMEN_MASTRA_HOME: root, BROWSER: 'none' },
})
process.on('exit', () => { try { process.kill(-vite.pid, 'SIGTERM') } catch { /* already gone */ } })
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://localhost:${port}/`)).ok) break } catch { /* not up yet */ }
  if (i > 120) throw new Error('vite dev page never came up')
  await sleep(500)
}

async function open(browser, { locale, w, h, dark = false, reduced = false, sounds = false, kit = KIT }) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(`${step}: ${error.message}`))
  // The vite dev page has no favicon; that 404 belongs to the dev server, not to the app
  page.on('console', message => { const at = message.location()?.url ?? ''; if (message.type() === 'error' && !at.endsWith('/favicon.ico')) errors.push(`${step}: ${message.text()} @ ${at}`) })
  await page.addInitScript(seedLocale, locale)
  await page.addInitScript(listenAudio)
  if (kit === 'music') await page.addInitScript(seedKit, [kit, sounds, dark])
  else if (dark) await page.addInitScript(seedDark)
  await page.goto(`http://localhost:${port}/`)
  await page.waitForSelector('.studio-topics .topic')
  return { context, page, errors }
}
/** An empty view is its object alone: min(560px, its container's content width) wide (the CAD instruments, a1be9e6), centre within 8px of the view's centre, inside the stage, the expected drawing,
 *  and nothing else in the view: no visible text outside the drawing (the drawing's own <text> is illustration) and no button, input or link */
const aloneCentred = (page, host, svg) => page.evaluate(([host, svg]) => {
  const h = document.querySelector(host), stage = document.querySelector('.studio-stage')
  if (!h) return { missing: host }
  const a = h.getBoundingClientRect(), s = stage.getBoundingClientRect()
  const off = Math.round(Math.hypot((a.left + a.right) / 2 - (s.left + s.right) / 2, (a.top + a.bottom) / 2 - (s.top + s.bottom) / 2))
  const bare = stage.cloneNode(true) as HTMLElement
  bare.querySelectorAll('.iso-host').forEach(node => node.remove())
  const text = bare.textContent.trim(), controls = stage.querySelectorAll('button, input, textarea, a, [role=button]').length
  const box = getComputedStyle(h.parentElement), room = h.parentElement.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight)
  const sized = Math.abs(a.width - Math.min(560, room)) < 1
  const ok = sized && off <= 8 && a.top >= s.top && a.bottom <= s.bottom && a.left >= s.left && a.right <= s.right && !!h.querySelector(`svg.${svg}`) && !text && !controls
  return ok ? 'ok' : { width: Math.round(a.width), room: Math.round(room), off, text, controls, svg: !!h.querySelector(`svg.${svg}`) }
}, [host, svg])
/** The lamp's pool overlaps no text line and no control anywhere on the page. The lamp is off at rest; the pool's box is the same lit or not */
const poolClear = page => page.evaluate(() => {
  const pool = document.querySelector('.studio-later-object .lm-light-pool ellipse')
  if (!pool) return 'no pool'
  const p = pool.getBoundingClientRect()
  const over = [...document.querySelectorAll('button, input, textarea, a, [role=tab], [role=button], p, h1, h2, h3, li')].filter(node => {
    const r = node.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && !(r.right <= p.left || p.right <= r.left || r.bottom <= p.top || p.bottom <= r.top)
  }).map(node => node.className || node.tagName)
  return over.length ? over.join(',') : 'ok'
})
/** The easel alone on the canvas (no line beside it): centred across the canvas, inside it, clear of the editor's controls and the tab strip, at most 560 wide (smaller when the stage is short) */
const easelAlone = page => page.evaluate(() => {
  const e = document.querySelector('.board-easel')!.getBoundingClientRect(), v = document.querySelector('.board-viewport')!.getBoundingClientRect()
  const s = document.querySelector('.board-sheets')!.getBoundingClientRect()
  const apart = (a: DOMRect, b: DOMRect) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
  // Since the canvas (2026-11-19) the zoom bar is Excalidraw's: every visible editor control counts
  const controls = [...document.querySelectorAll('.board-canvas .excalidraw button, .board-canvas .excalidraw label.ToolIcon')].map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0)
  const result = { width: Math.round(e.width), centred: Math.abs((e.left + e.right) / 2 - (v.left + v.right) / 2) < 2, inside: e.top >= v.top && e.bottom <= v.bottom && e.left >= v.left && e.right <= v.right,
    zoom: controls.every(r => apart(e, r)), sheets: apart(e, s), noLine: !document.querySelector('.board-empty') }
  return { ...result, ok: result.centred && result.inside && result.zoom && result.sheets && result.noLine && result.width <= 560 && result.width >= 200 }
})
const PLACEHOLDERS = MUSIC ? [['map', SVG.map, 'harp'], ['ideas', SVG.ideas, 'violin'], ['all', SVG.all, 'metronome']] : [['map', SVG.map, 'cork'], ['ideas', SVG.ideas, 'lamp'], ['all', SVG.all, 'case']]
/** The last topic picked and view opened, so a console error says where it came from */
let step = ''
const pick = async (page, title) => { step = title;  await page.locator('.studio-topics .topic', { hasText: title }).click(); await page.waitForSelector('.studio-topics .topic.on >> text=' + title) }
const view = async (page, S, name) => { step = step.split(' / ')[0] + ' / ' + name; return page.locator(`.studio-views:not(.studio-views-ghost) [role=tab][aria-label="${S.views[name]}"]`).click() }
/** Rest, hovered (mouse parked on the host) and opened (clicked): each must settle (see settled); the host is closed and left again afterwards */
async function states(page, selector, name, tag) {
  await page.mouse.move(2, 2); await sleep(1400)
  const rest = await settled(page, selector)
  check(`${tag} ${name} 静止时停稳：没有进行中的过渡，只有循环动画`, rest.startsWith('ok'), rest)
  await page.screenshot({ path: `${out}/${tag.replaceAll(' ', '-')}-${name}-rest.png` })
  await page.hover(selector); await sleep(1400)
  const hovered = await settled(page, selector)
  check(`${tag} ${name} 悬停后停稳`, hovered.startsWith('ok'), hovered)
  const focus = await page.evaluate(() => document.activeElement?.className ?? '')
  await page.click(selector); await sleep(name === 'easel' ? 3200 : 1600)
  const opened = await settled(page, selector)
  check(`${tag} ${name} 点开后停稳`, opened.startsWith('ok'), opened)
  check(`${tag} ${name} 点击不夺焦点`, await page.evaluate(before => (document.activeElement?.className ?? '') === before, focus))
  await page.screenshot({ path: `${out}/${tag.replaceAll(' ', '-')}-${name}-open.png` })
  await page.click(selector); await page.mouse.move(2, 2); await sleep(1400)
}

/** V6: icon-only navigation, the sprite parked under it; every tab names itself by hover and by keyboard within 600ms, under the tab, inside the window, on top.
 *  WebKit on macOS moves focus to buttons with Option+Tab (plain Tab only reaches fields unless the system's keyboard navigation is on), so WebKit presses Alt+Tab */
async function tooltips(browser, name, locale, key = 'Tab') {
  const { context, page, errors } = await open(browser, { locale, w: 1440, h: 900 })
  const S = catalogs[locale].studio
  await pick(page, READ)
  const width = await compactNav(page, 900)
  await spriteUnderNav(page); await page.reload(); await page.waitForSelector('.studio-views.is-compact:not(.studio-views-ghost)')
  await pick(page, READ)
  const titles = await page.evaluate(() => [...document.querySelectorAll('.studio-views:not(.studio-views-ghost) [role=tab]')].filter(tab => tab.hasAttribute('title')).length)
  const tips = await tipChecks(page, ['reading', 'board', 'settled', 'map', 'ideas', 'all'].map(view => S.views[view]), key)
  const bad = tips.filter(tip => 'missing' in tip || tip.ms > 600 || !tip.under || !tip.inside || !tip.topmost)
  const tag = `${name} ${locale} ${width}px`
  check(`${tag} 只剩图标：六个标签悬停与 Tab 聚焦都在 600ms 内出名字、在标签下方、不出窗口、在最上层`, tips.length === 12 && bad.length === 0, JSON.stringify(bad.length ? bad : tips.map(tip => `${tip.via}:${'ms' in tip ? tip.ms : '-'}`)))
  check(`${tag} 精灵就在提示下方，被提示盖住而不是盖住提示`, tips.some(tip => 'overSprite' in tip && tip.overSprite))
  check(`${tag} 名字放在 title 里，由 Tips 画`, titles === 6, String(titles))
  const box = await page.locator('.studio-views:not(.studio-views-ghost) [role=tab]').nth(3).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await sleep(700)
  check(`${tag} 提示显示时 title 被借走（原生框不出现）`, await page.evaluate(() => { const tab = document.querySelectorAll('.studio-views:not(.studio-views-ghost) [role=tab]')[3]!; return !tab.hasAttribute('title') && !!document.querySelector('.lumen-tip[data-shown]') }))
  await page.screenshot({ path: `${out}/${name}-${locale}-tooltip.png` })
  // Any other titled control gets the same tip: a pane toggle, and its title comes back on leave
  const toggle = page.locator('.pane-toggle').first(), want = await toggle.getAttribute('title'), tb = await toggle.boundingBox()
  await page.mouse.move(2, 2); await sleep(700)
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await sleep(700)
  const shown = await page.evaluate(() => ({ text: document.querySelector('.lumen-tip[data-shown] .kumo-tooltip-popup')?.textContent ?? null, title: document.querySelector('.pane-toggle')!.getAttribute('title') }))
  await page.screenshot({ path: `${out}/${name}-${locale}-tooltip-toggle.png` })
  await page.mouse.move(2, 2); await sleep(300)
  const back = await page.evaluate(() => ({ title: document.querySelector('.pane-toggle')!.getAttribute('title'), tip: !!document.querySelector('.lumen-tip') }))
  check(`${tag} 收起按钮的 title 也画成同一种提示，移开后 title 还原`, shown.text === want && shown.title === null && back.title === want && !back.tip, JSON.stringify({ want, shown, back }))
  check(`${tag} 提示：无控制台错误`, errors.length === 0, errors.slice(0, 2).join(' | '))
  await context.close()
  return tips
}

// ONLY=webkit skips the Chromium passes (a quick re-run of the WebKit captures and V6); acceptance runs both
if (process.env.ONLY !== 'webkit') {
const chrome = await chromium.launch({ executablePath: exe, args: ['--disable-gpu'] })
try {
  if (!FOCUS) for (const locale of ['zh', 'en']) for (const [w, h] of [[1440, 900], [1280, 800]]) for (const dark of [false, true]) {
    const M = catalogs[locale], S = M.studio, tag = `${locale} ${w} ${dark ? 'dark' : 'light'}`
    const { context, page, errors } = await open(chrome, { locale, w, h, dark })

    // ---- BLANK: the cabinet alone in empty Materials, the typewriter alone in the empty Reading view ----
    await pick(page, BLANK)
    await page.waitForSelector('.materials-cabinet')
    check(`${tag} 无素材：卡片柜独自居中、没有说明句`, await page.evaluate(() => {
      const c = document.querySelector('.materials-cabinet').getBoundingClientRect(), pane = document.querySelector('.studio-materials').getBoundingClientRect()
      return Math.abs(c.width - 220) < 1 && Math.abs((c.left + c.right) / 2 - (pane.left + pane.right) / 2) < 2 && !document.querySelector('.materials-empty p')
    }))
    check(`${tag} 卡片柜是装饰`, (await decoration(page, '.materials-cabinet')) === 'ok', await decoration(page, '.materials-cabinet'))
    const typewriter = await aloneCentred(page, '.reading-typewriter', SVG.reading)
    check(`${tag} 解读为空：只有打字机、居中（≤8px）、没有文字和按钮`, typewriter === 'ok', JSON.stringify(typewriter))
    check(`${tag} 上传可点`, await hits(page, '.materials-upload'))
    check(`${tag} 每个主题可点`, await allHit(page, '.studio-topics .topic'))
    check(`${tag} 设置可点`, await page.evaluate(label => { const b = [...document.querySelectorAll('.studio-topics .studio-item')].find(node => node.textContent === label); const r = b?.getBoundingClientRect(); const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && b.contains(hit) }, S.settings))
    check(`${tag} 沉淀盒在主题列表下、空卡`, !!(await page.$('.topics-box')) && await page.evaluate(() => { const box = document.querySelector('.topics-box').getBoundingClientRect(), last = [...document.querySelectorAll('.studio-topics .topic')].pop().getBoundingClientRect(); return box.top >= last.bottom + 16 }))
    check(`${tag} 沉淀盒是装饰`, (await decoration(page, '.topics-box')) === 'ok', await decoration(page, '.topics-box'))
    await page.screenshot({ path: `${out}/${tag.replaceAll(' ', '-')}-blank.png` })
    if (!dark && w === 1440) await states(page, '.materials-cabinet', 'cabinet', tag)
    if (EASEL) { await view(page, S, 'board'); await page.waitForSelector('.board-easel'); await view(page, S, 'reading') }

    // ---- V1–V4 on BLANK: the press, the cork board, the lamp and the type case, each alone and centred in its view ----
    await view(page, S, 'settled'); await page.waitForSelector('.sediment-press')
    const press = await aloneCentred(page, '.sediment-press', SVG.takeaways)
    check(`${tag} 沉淀为空：只有压花板、居中（≤8px）、宽 min(560, 可用宽)、没有文字和按钮`, press === 'ok', JSON.stringify(press))
    check(`${tag} 压花板是装饰`, (await decoration(page, '.sediment-press')) === 'ok', await decoration(page, '.sediment-press'))
    await page.screenshot({ path: `${out}/${tag.replaceAll(' ', '-')}-settled.png` })
    if (!dark && w === 1440) await states(page, '.sediment-press', 'press', tag)
    for (const [name, svg, id] of PLACEHOLDERS) {
      await view(page, S, name); await page.waitForSelector(`.studio-later-object svg.${svg}`)
      const placed = await aloneCentred(page, '.studio-later-object', svg)
      check(`${tag} ${S.views[name]}：只有物件、居中（≤8px）、没有可见文字，读屏名是「${S.notOpen}」`, placed === 'ok' && await page.getAttribute('.studio-later', 'aria-label') === S.notOpen, JSON.stringify(placed))
      check(`${tag} ${S.views[name]} 物件是装饰`, (await decoration(page, '.studio-later-object')) === 'ok', await decoration(page, '.studio-later-object'))
      check(`${tag} ${S.views[name]}：每个视图标签可点`, await allHit(page, '.studio-views:not(.studio-views-ghost) [role=tab]'))
      if (name === 'ideas' && !MUSIC) check(`${tag} 台灯光斑不压任何文字与控件`, (await poolClear(page)) === 'ok', await poolClear(page))
      await page.screenshot({ path: `${out}/${tag.replaceAll(' ', '-')}-${name}.png` })
      if (!dark && w === 1440) await states(page, '.studio-later-object', id, tag)
    }
    await view(page, S, 'reading')

    // ---- READ: the typewriter with the title, the box's card with the newest takeaway; no cabinet ----
    await pick(page, READ)
    await page.waitForSelector('.material')
    check(`${tag} 有素材：没有卡片柜`, !(await page.$('.materials-cabinet')))
    const readTypewriter = await aloneCentred(page, '.reading-typewriter', SVG.reading)
    check(`${tag} 有素材、没解读：仍只有打字机、居中、没有按钮`, readTypewriter === 'ok', JSON.stringify(readTypewriter))
    check(`${tag} 素材行的写解读可点`, await hits(page, '.material-reading'))
    if (!MUSIC) check(`${tag} 纸上是资料标题`, await page.evaluate(title => [...document.querySelectorAll('.reading-typewriter text')].some(node => node.textContent === title), notes.title))
    check(`${tag} 打字机是装饰`, (await decoration(page, '.reading-typewriter')) === 'ok', await decoration(page, '.reading-typewriter'))
    await page.waitForFunction(() => document.querySelectorAll('.topics-box text').length > 0 && [...document.querySelectorAll('.topics-box text')].some(node => node.textContent?.startsWith('预测往下走')))
    const card = await page.evaluate(() => [...document.querySelectorAll('.topics-box g[clip-path] text')].map(node => node.textContent))
    check(`${tag} 卡片是最新一句原话（两行、省略）`, card.length === 3 && NEWEST.startsWith(card[1]) && card[2].endsWith('…'), JSON.stringify(card))
    const before = { topic: await page.evaluate(() => document.querySelector('.studio-topics .topic.on')?.textContent), view: await page.evaluate(() => document.querySelector('.studio-views [role=tab][aria-selected=true]')?.getAttribute('aria-label')) }
    await page.click('.topics-box'); await sleep(300)
    const after = { topic: await page.evaluate(() => document.querySelector('.studio-topics .topic.on')?.textContent), view: await page.evaluate(() => document.querySelector('.studio-views [role=tab][aria-selected=true]')?.getAttribute('aria-label')) }
    check(`${tag} 点沉淀盒不跳转`, JSON.stringify(before) === JSON.stringify(after) && await page.$('.topics-box[data-open]') !== null, JSON.stringify(after))
    await page.click('.topics-box'); await page.mouse.move(2, 2); await sleep(1400)
    await page.screenshot({ path: `${out}/${tag.replaceAll(' ', '-')}-read.png` })
    if (!dark && w === 1440) { await states(page, '.reading-typewriter', 'typewriter', tag); await states(page, '.topics-box', 'box', tag) }
    if (EASEL) {
      await view(page, S, 'board')
      await page.waitForSelector('.board-easel')
      const easel = await easelAlone(page)
      check(`${tag} 没有白板：画架独自居中、至多 560 宽（矮时等比缩小）、不碰缩放条和标签条、没有说明句`, easel.ok, JSON.stringify(easel))
      check(`${tag} 画架是装饰`, (await decoration(page, '.board-easel')) === 'ok', await decoration(page, '.board-easel'))
      check(`${tag} ＋ 新白板可点`, await hits(page, '.board-sheet-new'))
      await page.screenshot({ path: `${out}/${tag.replaceAll(' ', '-')}-board.png` })
      if (!dark && w === 1440) await states(page, '.board-easel', 'easel', tag)
      await view(page, S, 'reading')
    }

    // ---- DONE: a reading and a sheet exist, so no typewriter and no easel ----
    await pick(page, DONE)
    await page.waitForSelector('.reading-section')
    check(`${tag} 有解读：没有打字机`, !(await page.$('.reading-typewriter')) && !(await page.$('.reading-start')))
    check(`${tag} 有素材：没有卡片柜（读过）`, !(await page.$('.materials-cabinet')))
    await view(page, S, 'board')
    await page.waitForSelector('.board-canvas .excalidraw__canvas.interactive'); await sleep(800)
    check(`${tag} 有白板：没有画架`, !(await page.$('.board-easel')))
    await view(page, S, 'settled'); await page.waitForSelector('.sediment-entry')
    check(`${tag} 一条沉淀：没有压花板，「写一条沉淀」回来`, !(await page.$('.sediment-press')) && (await page.$$('.sediment-entry')).length === 1 && await page.textContent('.sediment-keep') === S.sediment.keep)
    check(`${tag} 「写一条沉淀」可点`, await hits(page, '.sediment-keep'))
    await view(page, S, 'reading')

    // ---- V0 and V8 on LIVE: its first sheet is live and blank, so the easel stands alone on it, and the strip shows that one sheet's tab ----
    await pick(page, LIVE)
    await view(page, S, 'board')
    await page.waitForSelector('.board-easel')
    const blank = await easelAlone(page)
    check(`${tag} 空白板（V0）：画架独自居中、不碰缩放条和白板标签、没有说明句`, blank.ok, JSON.stringify(blank))
    const lone = await page.evaluate(() => [...document.querySelectorAll('.board-tabs .board-tab > button:first-child')].map(tab => [tab.textContent, !!tab.querySelector('svg')]))
    check(`${tag} 一张白板（V8）：标签条显示一个标签（图标 + 1）`, JSON.stringify(lone) === '[["1",true]]', JSON.stringify(lone))
    for (const [selector, name] of [['.board-tabs .board-tab > button:first-child', '白板标签'], ['.board-tab.is-on .board-tab-more', '「⋯」'], ['.board-sheet-new', '＋'], ['.board-canvas .zoom-out-button', '缩小'], ['.board-canvas .reset-zoom-button', '重置缩放']])
      check(`${tag} 空白板：${name}可点`, await hits(page, selector))
    // The easel shows before the editor has finished mounting: zoom once the canvas takes input
    await page.waitForSelector('.board-canvas .excalidraw__canvas.interactive'); await sleep(600)
    const zoom = await page.textContent('.board-canvas .reset-zoom-button')
    await page.click('.board-canvas .zoom-in-button'); await sleep(300)
    check(`${tag} 空白板：放大照常`, (await page.textContent('.board-canvas .reset-zoom-button')) !== zoom)
    await page.click('.board-canvas .reset-zoom-button')
    await page.screenshot({ path: `${out}/${tag.replaceAll(' ', '-')}-blank-sheet.png` })
    await view(page, S, 'reading')

    // ---- LIVE (once): typing while the requested reading has no section; stops at the first section ----
    if (locale === 'zh' && w === 1440 && !dark) {
      await pick(page, LIVE)
      await page.waitForSelector('.material-reading:not([disabled])')
      await page.click('.material-reading')
      await page.waitForSelector('.reading-typewriter.is-typing')
      const typing = await page.evaluate(() => document.querySelector('.reading-typewriter svg').getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)
      const a = await page.locator('.reading-typewriter').screenshot({ animations: 'allow' }); await sleep(370)
      const b = await page.locator('.reading-typewriter').screenshot({ animations: 'allow' })
      check(`${tag} 请求后、第一节前在打字（动画在跑、画面在变）`, typing > 0 && !a.equals(b), `${typing} animations`)
      if (MUSIC) check(`${tag} 正在写解读：钢琴在弹，五线谱在画`, await page.evaluate(() => ['.pn-staff', '.pn-k'].every(target => document.querySelector('.reading-typewriter')!.querySelector(target) && [...document.querySelectorAll(`.reading-typewriter ${target}`)].some(node => node.getAnimations({ subtree: true }).some(a => a.playState === 'running')))))
      check(`${tag} 等待时只有打字机在打字，没有状态句`, !(await page.$('.reading-start [role=status]')) && !(await page.$('.reading-start p')))
      await page.screenshot({ path: `${out}/${tag.replaceAll(' ', '-')}-typing.png` })
      openGate()
      await page.waitForSelector('.reading-section')
      check(`${tag} 第一节一到，打字机停下并让位`, !(await page.$('.reading-typewriter')) && !(await page.$('.is-typing')))
    }
    check(`${tag} 无控制台错误`, errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  }

  // ---- Reduced motion: every object's transitions are at most 100ms ----
  if (!FOCUS) {
    const { context, page, errors } = await open(chrome, { locale: 'zh', w: 1440, h: 900, reduced: true })
    await pick(page, BLANK)
    await page.waitForSelector('.materials-cabinet')
    const longest = async () => page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('.iso-host svg, .iso-host svg *')].flatMap(node => {
      const style = getComputedStyle(node), time = value => value.split(',').map(part => parseFloat(part) * (part.trim().endsWith('ms') ? 1 : 1000))
      return [...time(style.transitionDuration), ...time(style.animationDuration)]
    })))
    const blank = await longest()
    const S = catalogs.zh.studio, views: number[] = []
    await view(page, S, 'settled'); await page.waitForSelector('.sediment-press'); await page.click('.sediment-press'); views.push(await longest())
    for (const [name] of PLACEHOLDERS) { await view(page, S, name); await page.waitForSelector('.studio-later-object'); await page.click('.studio-later-object'); views.push(await longest()) }
    await view(page, S, 'reading')
    await pick(page, READ); await page.waitForSelector('.topics-box')
    await page.hover('.topics-box'); await page.click('.reading-typewriter')
    const read = await longest()
    let board = 0
    if (EASEL) { await view(page, catalogs.zh.studio, 'board'); await page.waitForSelector('.board-easel'); await page.click('.board-easel'); board = await longest() }
    check('减弱动效：所有物件过渡与动画 ≤ 100ms', Math.max(blank, read, board, ...views) <= 100, `${blank} / ${read} / ${board} / ${views.join(' / ')}ms`)
    check('减弱动效：无控制台错误', errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  }

  // ---- The music kit only: switching without a reload, persistence, pixel-identical return; notes inside the frame; the live sound and the header speaker (./music-sound-checks.ts) ----
  if (MUSIC) {
    if (!SOUND_ONLY) {
    for (const locale of ['zh', 'en']) {
      const { context, page, errors } = await open(chrome, { locale, w: 1440, h: 900, kit: 'instruments' })
      const catalog = catalogs[locale], S = catalog.studio, tag = `${locale} 切换`
      const markup = () => page.evaluate(() => [...document.querySelectorAll('.iso-host')].map(host => `${host.className.split(' ')[1]}:${host.innerHTML.length}:${host.innerHTML}`).sort())
      const ideas = async () => { await view(page, S, 'ideas'); await page.waitForSelector('.studio-later-object'); await page.mouse.move(2, 2); await sleep(1400); return still(page, '.studio-later-object') }
      await pick(page, BLANK); await view(page, S, 'settled'); await page.waitForSelector(`.sediment-press svg.${KITS.instruments.takeaways}`)
      const before = await markup()
      const baseline = await ideas()
      await page.evaluate(() => { (window as unknown as { __stay: number }).__stay = 1 })
      await pickKit(page, catalog, 'music')
      await page.waitForSelector(`.studio-later-object svg.${KITS.music.ideas}`)
      const swapped = await page.evaluate(() => ({ stay: (window as unknown as { __stay?: number }).__stay, kits: [...document.querySelectorAll('.iso-host svg')].map(svg => svg.classList.contains('mu')) }))
      check(`${tag}：设置里选「${catalog.appearance.deskKits.music}」，可见物件不刷新就换成音乐`, swapped.stay === 1 && swapped.kits.length >= 3 && swapped.kits.every(Boolean), JSON.stringify(swapped))
      await page.reload(); await page.waitForSelector('.studio-topics .topic')
      await pick(page, BLANK); await view(page, S, 'settled')
      check(`${tag}：刷新后仍是音乐`, !!(await page.waitForSelector(`.sediment-press svg.${KITS.music.takeaways}`).catch(() => null)))
      await page.screenshot({ path: `${out}/switch-${locale}-music.png` })
      await pickKit(page, catalog, 'instruments')
      await page.waitForSelector(`.sediment-press svg.${KITS.instruments.takeaways}`)
      const after = await markup()
      check(`${tag}：切回「${catalog.appearance.deskKits.instruments}」，每件可见物件的 SVG 与基线逐字节一致`, after.length >= 3 && JSON.stringify(after) === JSON.stringify(before), after.map(m => m.split(':').slice(0, 2).join(':')).join(' '))
      const back = await ideas(), again = await still(page, '.studio-later-object')
      await writeFile(`${out}/switch-${locale}-baseline.png`, baseline); await writeFile(`${out}/switch-${locale}-back.png`, back)
      const diff = await pixelDiff(page, baseline, back), noise = await pixelDiff(page, back, again)
      check(`${tag}：切回「${catalog.appearance.deskKits.instruments}」与基线逐像素一致（灵感视图，重挂载可复现的物件）`, diff.size && diff.pixels === 0, JSON.stringify({ diff, noise }))
      check(`${tag}：无控制台错误`, errors.length === 0, errors.slice(0, 2).join(' | '))
      await context.close()
    }
    for (const dark of [false, true]) {
      const { context, page, errors } = await open(chrome, { locale: 'zh', w: 1440, h: 900, dark })
      const S = catalogs.zh.studio, tag = `音符 ${dark ? 'dark' : 'light'}`
      const sample = async (host: string, name: string) => {
        await page.mouse.move(2, 2); await sleep(600)
        await page.hover(host); await sleep(500)
        const hovered = await notesClear(page, host)
        await page.click(host); await sleep(300)
        const opened = await notesClear(page, host)
        await page.click(host); await page.mouse.move(2, 2)
        const frames = [...hovered, ...opened]
        check(`${tag} ${name}：悬停与点击各 10 帧，音符都在物件框内、不压文字和控件`, frames.every(f => f.startsWith('ok')), frames.join(' '))
      }
      await pick(page, BLANK); await page.waitForSelector('.materials-cabinet')
      await sample('.materials-cabinet', 'cello'); await sample('.reading-typewriter', 'piano'); await sample('.topics-box', 'music box')
      await view(page, S, 'settled'); await page.waitForSelector('.sediment-press'); await sample('.sediment-press', 'gramophone')
      for (const [name, , id] of PLACEHOLDERS) { await view(page, S, name); await page.waitForSelector('.studio-later-object'); await sample('.studio-later-object', id) }
      if (EASEL) { await view(page, S, 'board'); await page.waitForSelector('.board-easel'); await sample('.board-easel', 'stand') }
      check(`${tag}：无控制台错误`, errors.length === 0, errors.slice(0, 2).join(' | '))
      await context.close()
    }
    }
    if (!SWITCH_ONLY) {
      const ctx = { open, pick, view, check, sleep, catalogs, browser: chrome, out, BLANK, READ }
      await soundChecks(ctx)
      await headChecks(ctx)
    }
  }

  // ---- V8: LIVE's only sheet is empty, so its 「⋯」 deletes it with no dialog and the no-sheet state follows, easel included ----
  if (!FOCUS) {
    const { context, page, errors } = await open(chrome, { locale: 'zh', w: 1440, h: 900 })
    const S = catalogs.zh.studio
    await pick(page, LIVE); await view(page, S, 'board'); await page.waitForSelector('.board-tab')
    await page.click('.board-tab.is-on .board-tab-more')
    await page.locator('[role=menuitem]', { hasText: S.board.remove }).click()
    await page.waitForFunction(() => !document.querySelector('.board-tab') && !!document.querySelector('.board-easel'))
    check('一张白板（V8）：「⋯」照常删除空白板，回到没有白板的状态和画架', !(await page.$('.board-tab')) && !(await page.$('.board-remove-modal')) && !!(await page.$('.board-easel')))
    await page.screenshot({ path: `${out}/lone-sheet-deleted.png` })
    check('删除：无控制台错误', errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  }

  if (!FOCUS) for (const locale of ['zh', 'en']) await tooltips(chrome, 'chromium', locale)

  // ---- The box's boundary (Q1): at 1440×900 and 1440×700, the last topic count that still shows the box and the next that folds it, both measured, not assumed.
  //      Folding and coming back moves neither the first nor the last topic row nor Settings (0px); dragging 900→700→900 folds and restores it with no flicker ----
  if (!FOCUS) {
    const { context, page, errors } = await open(chrome, { locale: 'zh', w: 1440, h: 900 })
    await pick(page, READ)
    const settings = catalogs.zh.studio.settings
    /** First and last topic rows (absolute), Settings measured from the window's bottom (it sits at the panel's foot), and whether the box shows */
    const probe = () => page.evaluate(label => {
      const rows = [...document.querySelectorAll('.studio-topics .topic')].map(node => node.getBoundingClientRect())
      const gear = [...document.querySelectorAll('.studio-topics .studio-item')].find(node => node.textContent === label)!.getBoundingClientRect()
      const at = (r: DOMRect) => [r.left, r.top, r.width, r.height].map(Math.round).join(',')
      return { first: at(rows[0]!), last: at(rows[rows.length - 1]!), settings: [gear.left, innerHeight - gear.top, gear.width, gear.height].map(Math.round).join(','), box: !!document.querySelector('.topics-box'), rows: rows.length }
    }, settings)
    const freeFits = () => page.evaluate(() => {
      const scroll = document.querySelector('.studio-topics .studio-scroll') as HTMLElement, content = document.querySelector('.topics-content') as HTMLElement
      return scroll.clientHeight - (parseFloat(getComputedStyle(scroll).paddingTop) || 0) - content.offsetHeight >= 200 * 300 / 320 + 32
    })
    /** Drag 900→700→900 in 20px steps: the box shows exactly when the free height fits, flips once each way, and nothing in the panel moves */
    async function drag(count: number) {
      await page.setViewportSize({ width: 1440, height: 900 }); await sleep(300)
      const shown = await probe()
      check(`1440×900、${count} 个主题：显示`, shown.box)
      const states: boolean[] = [], mismatches: number[] = []
      let moved = ''
      for (const h of [...Array.from({ length: 11 }, (_, i) => 900 - i * 20), ...Array.from({ length: 10 }, (_, i) => 720 + i * 20)]) {
        await page.setViewportSize({ width: 1440, height: h }); await sleep(120)
        const now = await probe()
        states.push(now.box)
        if (now.box !== await freeFits()) mismatches.push(h)
        if (now.first !== shown.first || now.last !== shown.last || now.settings !== shown.settings) moved ||= `${h}: ${JSON.stringify(now)}`
        if (h === 700) await page.screenshot({ path: `${out}/box-folded-1440x700-${count}topics.png` })
      }
      const flips = states.slice(1).filter((value, i) => value !== states[i]).length
      check(`拖动 900→700→900（${count} 个主题）：盒子收起又出现，各翻一次（不闪）`, flips === 2 && states[0]! && states[states.length - 1]! && mismatches.length === 0, `flips ${flips}; mismatches ${mismatches.join(',')}`)
      check(`收起与出现前后：第一行、最后一行主题与设置入口位置不变（0px）`, !moved, moved)
    }
    // Topics only grow (there is no delete), so add one at a time and look at both heights each time: 700 folds first, and at that very count 900 still shows,
    // which is where the drag runs; then keep adding until 900 folds too
    const boundary: Record<number, { shown: number; hidden: number }> = {}
    let count = (await probe()).rows, extra = 0
    while (!boundary[900] && count < 40) {
      const before: Record<number, boolean> = {}
      for (const h of [700, 900]) { await page.setViewportSize({ width: 1440, height: h }); await sleep(250); before[h] = (await probe()).box }
      for (const h of [700, 900]) if (!boundary[h] && !before[h]) {
        boundary[h] = { shown: count - 1, hidden: count }
        if (h === 700 && before[900]) await drag(count)
      }
      if (boundary[900]) break
      ensureTopic({ studio }, `extra-${++extra}`, `补充主题 ${extra}`)
      count++
      await page.waitForFunction(n => document.querySelectorAll('.studio-topics .topic').length === n, count, { timeout: 15000 })
    }
    for (const h of [900, 700]) check(`沉淀盒边界 1440×${h}：${boundary[h]?.shown} 个主题仍显示，${boundary[h]?.hidden} 个收起（两侧都实测）`, !!boundary[h] && boundary[h]!.shown >= 1, JSON.stringify(boundary[h]))
    boxBoundary = boundary
    check('收放：无控制台错误', errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  }
} finally {
  await chrome.close()
}

}

// ---- WebKit: rest and open of the four objects ----
if (FOCUS) { console.log(results.join('\n')); console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0) }
const wk = await webkit.launch()
try {
  // Taller than the Chromium passes: the boundary check above left more topics than a 900px panel has room for beside the box
  const { context, page, errors } = await open(wk, { locale: 'zh', w: 1440, h: 1400 })
  const S = catalogs.zh.studio
  const shoot = async (selector, name) => {
    await page.mouse.move(2, 2); await sleep(1400)
    await page.locator(selector).screenshot({ path: `${out}/webkit-${name}-rest.png` })
    await page.click(selector); await sleep(name === 'easel' ? 3200 : 1600); await page.mouse.move(2, 2); await sleep(1400)
    await page.locator(selector).screenshot({ path: `${out}/webkit-${name}-open.png` })
    await page.click(selector)
  }
  await pick(page, BLANK); await page.waitForSelector('.materials-cabinet')
  await shoot('.materials-cabinet', 'cabinet')
  await pick(page, READ); await page.waitForSelector('.reading-typewriter'); await shoot('.reading-typewriter', 'typewriter'); await shoot('.topics-box', 'box')
  if (EASEL) { await view(page, S, 'board'); await page.waitForSelector('.board-easel'); await shoot('.board-easel', 'easel') }
  await page.screenshot({ path: `${out}/webkit-page.png` })
  await pick(page, BLANK)
  await view(page, S, 'settled'); await page.waitForSelector('.sediment-press'); await shoot('.sediment-press', 'press')
  for (const [name, svg, id] of PLACEHOLDERS) { await view(page, S, name); await page.waitForSelector(`.studio-later-object svg.${svg}`); await shoot('.studio-later-object', id) }
  if (MUSIC) {
    await page.locator('.studio-topics .studio-item', { hasText: S.settings }).click()
    await page.locator('.settings-nav-item', { hasText: catalogs.zh.settings.tabs.preference }).click()
    await page.locator('.pref-desk').scrollIntoViewIfNeeded(); await sleep(400)
    await page.locator('.settings-modal').screenshot({ path: `${out}/webkit-settings-appearance.png` })
    await page.locator('.settings-close').click()
  }
  check('WebKit 物件静止与点开截图', true, EASEL ? '8 × 2' : '7 × 2（画架待批）')
  check('WebKit 无控制台错误', errors.length === 0, errors.slice(0, 2).join(' | '))
  await context.close()
  for (const locale of ['zh', 'en']) await tooltips(wk, 'webkit', locale, 'Alt+Tab')
} finally {
  await wk.close()
}

console.log(results.join('\n'))
console.log('BOX_BOUNDARY', JSON.stringify(boxBoundary))
console.log(`\n${results.length - failed}/${results.length} passed`)
network.close()
await service.close()
lock.release()
process.exit(failed ? 1 : 0)
