/**
 * [INPUT]: a self-contained isolated fixture service (real Controller + controllable model: writes one reading section, holding it until the script releases it) and the vite
 *          dev page on PORT (default 5191); seeded topics: one with a material, takeaways and no sheet, one empty, one already read and drawn on
 * [OUTPUT]: browser evidence for the objects in the product (1440x900 and 1280x800, light and dark, zh and en): each object shows only in its empty state (typewriter: no
 *           reading; cabinet: no material; box: room under the topic list; easel: no sheet); the real controls next to them pass elementFromPoint (写解读, upload, ＋ new sheet,
 *           Settings, every topic); objects are aria-hidden, untabbable and never take focus; the box's card carries the topic's newest takeaway and a click on it changes
 *           nothing else; stillness (two captures 1 s apart identical) at rest, hovered and opened; reduced motion leaves no transition over 100ms; the typewriter types
 *           while a requested reading has no section and stops at the first one (zh 1440 light); the box's boundary measured on both sides at 1440×900 and 1440×700
 *           (topics added one by one), a 900→700→900 drag that folds and restores it once each way with the first/last rows and Settings unmoved; no console or page errors. WebKit: rest and open captures of the four objects (zh 1440×1400 light)
 * [POS]: an acceptance script that swaps the model network only and touches no product protocol; Chromium runs with --disable-gpu so stillness compares raster, not GPU
 *        noise. Screenshots land in the evidence directory, never in the repo. Usage: node --experimental-strip-types ui-assert-objects.mts <evidence-dir> [--no-easel]. Prints BOX_BOUNDARY for the report
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { chromium, webkit } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
import { mkdir, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createHttpService } from '../../../mastra-service/src/server.ts'
import { acquireServiceLock } from '../../../mastra-service/src/deployment/lock.ts'
import { publishDiscovery } from '../../../mastra-service/src/deployment/discovery.ts'
import { fixtureProvider, textReply, toolReply } from '../../../mastra-service/tests/provider-fixture.ts'
import { ensureTopic } from '../../../mastra-service/tests/topic-fixture.ts'

const out = process.argv[2]
if (!out) throw new Error('evidence dir required')
const EASEL = !process.argv.includes('--no-easel')
const catalogs = { zh: (await import('../../src/i18n/locales/zh.ts')).zh, en: (await import('../../src/i18n/locales/en.ts')).en }
const seedLocale = locale => localStorage.setItem('lumen:locale.v1', JSON.stringify({ version: 1, locale }))
const seedDark = () => localStorage.setItem('lumen:appearance.v2', JSON.stringify({ version: 1, mode: 'dark', skinId: 'yan-clear', overlay: 0, blurPx: 0, latinFont: 'source-serif', cjkFont: 'wenkai', justify: false }))
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const port = process.env.PORT ?? '5191'
const root = '/tmp/lumen-obj-data'
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
/** Two captures 1 s apart are byte-identical */
async function still(page, selector) {
  const a = await page.locator(selector).screenshot({ animations: 'allow' })
  await sleep(1000)
  const b = await page.locator(selector).screenshot({ animations: 'allow' })
  return a.equals(b)
}
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

// ---- Seed: READ has a material, two takeaways and no sheet; BLANK has no material and no sheet; DONE has a reading and a drawn sheet; LIVE has a material for the live write ----
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
studio.readings.write('done', done.id, { title: '读过了', paragraphs: [{ text: '这一节已经写好。', source: { kind: 'inference' } }] }, { threadId: null, runId: null })
const sheet = studio.board.createSheet('done')
studio.board.draw('done', { kind: 'text', title: '一张白板', content: { markdown: '已经画过。' } }, { threadId: 'done:a', runId: null }, sheet.id)
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

async function open(browser, { locale, w, h, dark = false, reduced = false }) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  // The vite dev page has no favicon; that 404 belongs to the dev server, not to the app
  page.on('console', message => { const at = message.location()?.url ?? ''; if (message.type() === 'error' && !at.endsWith('/favicon.ico')) errors.push(`${message.text()} @ ${at}`) })
  await page.addInitScript(seedLocale, locale)
  if (dark) await page.addInitScript(seedDark)
  await page.goto(`http://localhost:${port}/`)
  await page.waitForSelector('.studio-topics .topic')
  return { context, page, errors }
}
const pick = async (page, title) => { await page.locator('.studio-topics .topic', { hasText: title }).click(); await page.waitForSelector('.studio-topics .topic.on >> text=' + title) }
const view = async (page, S, name) => page.locator(`.studio-views:not(.studio-views-ghost) [role=tab][aria-label="${S.views[name]}"]`).click()
/** Rest, hovered (mouse parked on the host) and opened (clicked): each settles, then holds still; the host is closed and left again afterwards */
async function states(page, selector, name, tag) {
  await page.mouse.move(2, 2); await sleep(1400)
  check(`${tag} ${name} 静止时不动`, await still(page, selector))
  await page.screenshot({ path: `${out}/${tag.replaceAll(' ', '-')}-${name}-rest.png` })
  await page.hover(selector); await sleep(1400)
  check(`${tag} ${name} 悬停停稳后不动`, await still(page, selector))
  const focus = await page.evaluate(() => document.activeElement?.className ?? '')
  await page.click(selector); await sleep(name === 'easel' ? 3200 : 1600)
  check(`${tag} ${name} 点开停稳后不动`, await still(page, selector))
  check(`${tag} ${name} 点击不夺焦点`, await page.evaluate(before => (document.activeElement?.className ?? '') === before, focus))
  await page.screenshot({ path: `${out}/${tag.replaceAll(' ', '-')}-${name}-open.png` })
  await page.click(selector); await page.mouse.move(2, 2); await sleep(1400)
}

const chrome = await chromium.launch({ executablePath: exe, args: ['--disable-gpu'] })
try {
  for (const locale of ['zh', 'en']) for (const [w, h] of [[1440, 900], [1280, 800]]) for (const dark of [false, true]) {
    const M = catalogs[locale], S = M.studio, tag = `${locale} ${w} ${dark ? 'dark' : 'light'}`
    const { context, page, errors } = await open(chrome, { locale, w, h, dark })

    // ---- BLANK: the cabinet in empty Materials, the typewriter with the button disabled and the hint ----
    await pick(page, BLANK)
    await page.waitForSelector('.materials-cabinet')
    check(`${tag} 无素材：卡片柜在空句上方`, await page.evaluate(() => { const c = document.querySelector('.materials-cabinet').getBoundingClientRect(), n = document.querySelector('.materials-none').getBoundingClientRect(); return c.bottom <= n.top + 1 && Math.abs(c.width - 220) < 1 }))
    check(`${tag} 卡片柜是装饰`, (await decoration(page, '.materials-cabinet')) === 'ok', await decoration(page, '.materials-cabinet'))
    check(`${tag} 无素材：写解读不可用并提示先选`, await page.evaluate(([hint]) => document.querySelector('.reading-start-write').disabled && document.querySelector('.reading-start-hint')?.textContent === hint, [S.reading.pickFirst]))
    check(`${tag} 打字机约 300px`, await page.evaluate(() => Math.abs(document.querySelector('.reading-typewriter').getBoundingClientRect().width - 300) < 1))
    check(`${tag} 上传可点`, await hits(page, '.materials-upload'))
    check(`${tag} 写解读按钮可点（命中按钮本身）`, await hits(page, '.reading-start-write'))
    check(`${tag} 每个主题可点`, await allHit(page, '.studio-topics .topic'))
    check(`${tag} 设置可点`, await page.evaluate(label => { const b = [...document.querySelectorAll('.studio-topics .studio-item')].find(node => node.textContent === label); const r = b?.getBoundingClientRect(); const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && b.contains(hit) }, S.settings))
    check(`${tag} 沉淀盒在主题列表下、空卡`, !!(await page.$('.topics-box')) && await page.evaluate(() => { const box = document.querySelector('.topics-box').getBoundingClientRect(), last = [...document.querySelectorAll('.studio-topics .topic')].pop().getBoundingClientRect(); return box.top >= last.bottom + 16 }))
    check(`${tag} 沉淀盒是装饰`, (await decoration(page, '.topics-box')) === 'ok', await decoration(page, '.topics-box'))
    await page.screenshot({ path: `${out}/${tag.replaceAll(' ', '-')}-blank.png` })
    if (!dark && w === 1440) await states(page, '.materials-cabinet', 'cabinet', tag)
    if (EASEL) { await view(page, S, 'board'); await page.waitForSelector('.board-easel'); await view(page, S, 'reading') }

    // ---- READ: the typewriter with the title, the box's card with the newest takeaway; no cabinet ----
    await pick(page, READ)
    await page.waitForSelector('.material')
    check(`${tag} 有素材：没有卡片柜`, !(await page.$('.materials-cabinet')))
    check(`${tag} 唯一素材：写解读可用`, await page.evaluate(() => !document.querySelector('.reading-start-write').disabled))
    check(`${tag} 纸上是资料标题`, await page.evaluate(title => [...document.querySelectorAll('.reading-typewriter text')].some(node => node.textContent === title), notes.title))
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
      const easel = await page.evaluate(line => {
        const e = document.querySelector('.board-easel')!.getBoundingClientRect(), p = document.querySelector('.board-empty')!, l = p.getBoundingClientRect()
        const v = document.querySelector('.board-viewport')!.getBoundingClientRect(), z = document.querySelector('.board-zoom')!.getBoundingClientRect()
        const apart = (a: DOMRect, b: DOMRect) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
        return { width: Math.round(e.width), text: p.textContent === line, lineAt: Math.round(l.top + l.height / 2 - v.top - v.height * .4), below: e.top >= l.bottom + 8, inside: e.bottom <= v.bottom && e.left >= v.left && e.right <= v.right, zoom: apart(e, z) }
      }, S.board.noLive)
      check(`${tag} 没有白板：画架在原句下方、约 320 宽（矮时等比缩小）、不碰缩放条`, easel.text && easel.lineAt === 0 && easel.below && easel.inside && easel.zoom && easel.width <= 320 && easel.width >= 240, JSON.stringify(easel))
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
    await page.waitForSelector('[data-block]')
    check(`${tag} 有白板：没有画架`, !(await page.$('.board-easel')))
    await view(page, S, 'reading')

    // ---- LIVE (once): typing while the requested reading has no section; stops at the first section ----
    if (locale === 'zh' && w === 1440 && !dark) {
      await pick(page, LIVE)
      await page.waitForSelector('.reading-start-write:not([disabled])')
      await page.click('.reading-start-write')
      await page.waitForSelector('.reading-typewriter.is-typing')
      const typing = await page.evaluate(() => document.querySelector('.reading-typewriter svg').getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)
      const a = await page.locator('.reading-typewriter').screenshot({ animations: 'allow' }); await sleep(370)
      const b = await page.locator('.reading-typewriter').screenshot({ animations: 'allow' })
      check(`${tag} 请求后、第一节前在打字（动画在跑、画面在变）`, typing > 0 && !a.equals(b), `${typing} animations`)
      check(`${tag} 等待时状态句`, (await page.textContent('.reading-start [role=status]')) === S.reading.waiting)
      await page.screenshot({ path: `${out}/${tag.replaceAll(' ', '-')}-typing.png` })
      openGate()
      await page.waitForSelector('.reading-section')
      check(`${tag} 第一节一到，打字机停下并让位`, !(await page.$('.reading-typewriter')) && !(await page.$('.is-typing')))
    }
    check(`${tag} 无控制台错误`, errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  }

  // ---- Reduced motion: every object's transitions are at most 100ms ----
  {
    const { context, page, errors } = await open(chrome, { locale: 'zh', w: 1440, h: 900, reduced: true })
    await pick(page, BLANK)
    await page.waitForSelector('.materials-cabinet')
    const longest = async () => page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('.iso-host svg, .iso-host svg *')].flatMap(node => {
      const style = getComputedStyle(node), time = value => value.split(',').map(part => parseFloat(part) * (part.trim().endsWith('ms') ? 1 : 1000))
      return [...time(style.transitionDuration), ...time(style.animationDuration)]
    })))
    const blank = await longest()
    await pick(page, READ); await page.waitForSelector('.topics-box')
    await page.hover('.topics-box'); await page.click('.reading-typewriter')
    const read = await longest()
    let board = 0
    if (EASEL) { await view(page, catalogs.zh.studio, 'board'); await page.waitForSelector('.board-easel'); await page.click('.board-easel'); board = await longest() }
    check('减弱动效：所有物件过渡与动画 ≤ 100ms', Math.max(blank, read, board) <= 100, `${blank} / ${read} / ${board}ms`)
    check('减弱动效：无控制台错误', errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  }

  // ---- The box's boundary (Q1): at 1440×900 and 1440×700, the last topic count that still shows the box and the next that folds it, both measured, not assumed.
  //      Folding and coming back moves neither the first nor the last topic row nor Settings (0px); dragging 900→700→900 folds and restores it with no flicker ----
  {
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

// ---- WebKit: rest and open of the four objects ----
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
  await pick(page, BLANK); await page.waitForSelector('.materials-cabinet'); await shoot('.materials-cabinet', 'cabinet')
  await pick(page, READ); await page.waitForSelector('.reading-typewriter'); await shoot('.reading-typewriter', 'typewriter'); await shoot('.topics-box', 'box')
  if (EASEL) { await view(page, S, 'board'); await page.waitForSelector('.board-easel'); await shoot('.board-easel', 'easel') }
  await page.screenshot({ path: `${out}/webkit-page.png` })
  check('WebKit 四件物件静止与点开截图', true, EASEL ? '4 × 2' : '3 × 2（画架待批）')
  check('WebKit 无控制台错误', errors.length === 0, errors.slice(0, 2).join(' | '))
  await context.close()
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
