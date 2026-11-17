/**
 * [INPUT]: a self-contained isolated fixture service (real Controller + controllable model: writes a reading of the notes, answers questions in two sentences) and the vite dev
 *          page on 5190; a seeded nine-section reading of a multi-page PDF written through the reading store
 * [OUTPUT]: browser evidence for P1-2 (1440x900 and 1280x800, light and dark, zh and en): Reading first and selected; the centred serif column within 700px; source chips;
 *           a nine-section reading scrolls inside the view while panes and headers stay put; a real mouse selection inside one paragraph opens the window, whose centre,
 *           input and send button pass elementFromPoint and which never covers the selected sentence (below, or above near the bottom); the reply arrives in the window;
 *           no text line in view runs under the sprite's figure (top and bottom of the reading); footprints from earlier page loads are rebuilt; the empty state; the live write from the Materials row (zh 1440 light)
 * [POS]: an acceptance script that swaps the model network only and touches no product protocol; screenshots land in the evidence directory, never in the repo
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
// Usage: node --experimental-strip-types ui-assert-reading.mts <evidence-dir> [--hold]  (--hold keeps the seeded service up for a manual or desktop look)
import { chromium } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
import { mkdir, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createHttpService } from '../../../mastra-service/src/server.ts'
import { acquireServiceLock } from '../../../mastra-service/src/deployment/lock.ts'
import { publishDiscovery, removeDiscovery } from '../../../mastra-service/src/deployment/discovery.ts'
import { fixtureProvider, textReply, toolReply } from '../../../mastra-service/tests/provider-fixture.ts'
import { pagedPdf } from '../../../mastra-service/tests/studio/library-fixtures.ts'
import { ensureTopic } from '../../../mastra-service/tests/topic-fixture.ts'

const out = process.argv[2]
if (!out) throw new Error('evidence dir required')
const catalogs = { zh: (await import('../../src/i18n/locales/zh.ts')).zh, en: (await import('../../src/i18n/locales/en.ts')).en }
const seedLocale = locale => localStorage.setItem('lumen:locale.v1', JSON.stringify({ version: 1, locale }))
const seedDark = () => localStorage.setItem('lumen:appearance.v2', JSON.stringify({ version: 1, mode: 'dark', skinId: 'yan-clear', overlay: 0, blurPx: 0, latinFont: 'source-serif', cjkFont: 'wenkai', justify: false }))
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const port = process.env.PORT ?? '5190'
const root = '/tmp/lumen-p1-reading-data'
const TOPIC = '自由能读书', EMPTY = '还没读的主题'
const ANSWER = 'KL 散度非负，所以自由能总在惊讶之上。压低它，就压住了惊讶。'
const results = []
let failed = 0
let failure = ''
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++ }
// Existing is not visible: the hit test must land on the element itself or a descendant
const visibleAt = (page, selector) => page.evaluate(target => {
  const element = document.querySelector(target)
  if (!element) return false
  const box = element.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return false
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  return !!hit && (hit === element || element.contains(hit))
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
const pages = Array.from({ length: 9 }, (_, i) => [`Section ${i + 1} of the free energy principle`, `Prediction error is minimised at level ${i + 1}`])
const pdf = await studio.library.add({ name: 'free-energy.pdf', bytes: pagedPdf(pages), addedBy: 'you' })
studio.topics.reference('fe', pdf.item.id)
const notes = await studio.library.add({ name: 'notes.md', bytes: new TextEncoder().encode('# Notes\n\nThe brain minimises free energy over time.'), addedBy: 'you' })
studio.topics.reference('fe', notes.item.id)
const TITLES = ['为什么值得读', '核心主张', '自由能与惊讶', '预测编码', '层级结构', '证据：重复抑制', '与强化学习的关系', '这篇论文没说明的', '我的判断']
for (const [i, title] of TITLES.entries()) {
  studio.readings.write('fe', pdf.item.id, { title, paragraphs: [
    { text: `第 ${i + 1} 节的第一段。自由能是惊讶的上界，所以把它压低，就等于让大脑停在它预期的状态里；这一节从原文第 ${i + 1} 页出发，把这个主张拆成能检验的几步。`, source: { kind: 'paper', page: i + 1, quote: `Prediction error is minimised at level ${i + 1}` } },
    { text: `第 ${i + 1} 节的第二段是我的推断：如果这个框架成立，那么同一个机制应该在感知和行动里都看得到，而不只是在视觉皮层。这一点原文没有直接证明。`, source: { kind: 'inference' } },
    { text: `第 ${i + 1} 节的第三段把前两段连起来：原文用的是“${pages[i]![0]}”这句话来立论，我们读到这里应当能说清楚，它到底在主张什么、又没有主张什么。`, source: { kind: 'paper', page: i + 1, quote: pages[i]![0]! } },
  ] }, { threadId: null, runId: null })
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
const browser = await chromium.launch({ executablePath: exe })
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
  for (const node of document.querySelectorAll('.reading-para, .reading-section h2')) {
    const range = document.createRange(); range.selectNodeContents(node)
    for (const line of range.getClientRects()) {
      if (line.width === 0 || line.bottom <= view.top || line.top >= view.bottom) continue
      lines++
      if (line.left < figure.right && figure.left < line.right && line.top < figure.bottom && figure.top < line.bottom) hits.push(`${Math.round(line.left)}–${Math.round(line.right)} @${Math.round(line.top)}`)
    }
  }
  return { lines, hits }
})
const rect = (page, selector) => page.evaluate(target => { const r = document.querySelector(target)?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null }, selector)

try {
  let pass = 0
  for (const locale of ['zh', 'en']) for (const [w, h] of [[1440, 900], [1280, 800]]) for (const dark of [false, true]) {
    const M = catalogs[locale], S = M.studio, tag = `${locale} ${w} ${dark ? 'dark' : 'light'}`
    const name = n => `${out}/${locale}-${w}-${dark ? 'dark' : 'light'}-${n}.png`
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(seedLocale, locale)
    if (dark) await page.addInitScript(seedDark)
    await page.goto(`http://localhost:${port}/`)
    await page.waitForSelector('.studio-topics .topic')

    // ---- Empty state (light passes): one line, Reading first and selected ----
    if (!dark) {
      await page.locator('.studio-topics .topic', { hasText: EMPTY }).click()
      await page.waitForSelector('.reading-empty')
      check(`${tag} 空态一句话`, (await page.textContent('.reading-empty')).trim() === S.reading.empty)
      await page.screenshot({ path: name('empty') })
    }
    await page.locator('.studio-topics .topic', { hasText: TOPIC }).click()
    await page.waitForSelector('.material-reading')
    const tabs = await page.$$eval('.studio-views:not(.studio-views-ghost) [role=tab]', nodes => nodes.map(node => [node.getAttribute('aria-label'), node.getAttribute('aria-selected')]))
    check(`${tag} 解读是第一个视图且默认选中`, tabs[0]?.[0] === S.views.reading && tabs[0]?.[1] === 'true' && tabs.length === 6, JSON.stringify(tabs.map(t => t[0])))
    // The PDF's title resolves to its first-page heading; the row action opens the existing reading
    await page.locator('.material').filter({ hasText: /free energy principle|free-energy/i }).locator('.material-reading').click()
    await page.waitForFunction(() => document.querySelectorAll('.reading-section').length === 9)

    // ---- Column: centred, at most 700px, serif reading font; numbered sections; chips ----
    const column = await page.evaluate(() => {
      // Centred within the content box: the view pads the side where the sprite sits
      const scroller = document.querySelector('.reading-scroll'), style = getComputedStyle(scroller), box = scroller.getBoundingClientRect()
      const col = document.querySelector('.reading-column').getBoundingClientRect()
      const stage = { left: box.left + parseFloat(style.paddingLeft), right: box.left + scroller.clientWidth - parseFloat(style.paddingRight), width: scroller.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) }
      const para = getComputedStyle(document.querySelector('.reading-para')).fontFamily, ui = getComputedStyle(document.querySelector('.reading-note')).fontFamily
      return { width: col.width, centred: Math.abs((col.left - stage.left) - (stage.right - col.right)) <= 16 || col.width >= stage.width - 1, para, ui,
        nums: [...document.querySelectorAll('.reading-num')].map(node => node.textContent).join(','), chips: [...document.querySelectorAll('.reading-section')][0].querySelectorAll('.reading-chip').length }
    })
    check(`${tag} 一栏居中、不超过 700px`, column.width <= 700 && column.centred, `${Math.round(column.width)}px`)
    check(`${tag} 正文用阅读字体（不同于界面字体）`, column.para !== column.ui, column.para.slice(0, 60))
    check(`${tag} 节标题编号`, column.nums === '1,2,3,4,5,6,7,8,9', column.nums)
    check(`${tag} 每段末尾有出处签`, column.chips === 3)
    check(`${tag} 原文签与推断签文字`, (await page.textContent('.reading-section .reading-chip')) === S.reading.page(1) && (await page.textContent('.reading-chip.source-chip-inferred')) === S.reading.inference)
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
    const asked = pass * 3 + 1
    await page.evaluate(index => { const node = document.querySelectorAll('[data-paragraph]')[index]; const scroller = document.querySelector('.reading-scroll'); scroller.scrollTop += node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 120 }, asked)
    await page.waitForTimeout(200)
    const sentence = await dragSelect(page, asked, 0, 24)
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
    await page.screenshot({ path: name('footprint') })

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
