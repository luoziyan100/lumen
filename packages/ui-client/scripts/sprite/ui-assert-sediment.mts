/**
 * [INPUT]: a self-contained isolated fixture service (real Controller + controllable model: draw skeletons, invite, quote back) and the vite dev page on 5190; the panels regression fixture (three sheets + a PDF)
 * [OUTPUT]: browser evidence for P1-1 (1440x900 and 1280x800, clear and dark, zh and en): the full-board row and its invite, keeping one, the offer strikethrough and keep,
 *           an old block's chip (title only, no jump, since the canvas of 2026-11-19; each pass seeds one old block and its takeaway), the deleted link after a sheet delete, the takeaways view, speech habits in settings; ui-assert-panels.mjs then re-runs as a child (the R16/R17 assertions live there)
 * [POS]: an acceptance script that swaps the model network only and touches no product protocol; screenshots land in the evidence directory, never in the repo
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
// Usage: node --experimental-strip-types ui-assert-sediment.mts <evidence-dir>
import { chromium } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
import { mkdir, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { assertPortFree, assertRoot } from './assert-env.ts'
import { createHttpService } from '../../../mastra-service/src/server.ts'
import { acquireServiceLock } from '../../../mastra-service/src/deployment/lock.ts'
import { publishDiscovery, removeDiscovery } from '../../../mastra-service/src/deployment/discovery.ts'
import { fixtureProvider, textReply, toolReply } from '../../../mastra-service/tests/provider-fixture.ts'
import { titledPdf } from '../../../mastra-service/tests/studio/library-fixtures.ts'
import { element, legacyBlock } from '../../../mastra-service/tests/studio/canvas-fixtures.ts'
import { ensureTopic } from '../../../mastra-service/tests/topic-fixture.ts'

const out = process.argv[2]
if (!out) throw new Error('evidence dir required')
const LOCALE = process.env.LOCALE ?? 'zh'
const M = (await import(`../../src/i18n/locales/${LOCALE}.ts`))[LOCALE]
const seedLocale = locale => localStorage.setItem('lumen:locale.v1', JSON.stringify({ version: 1, locale }))
const seedDark = () => localStorage.setItem('lumen:appearance.v2', JSON.stringify({ version: 1, mode: 'dark', skinId: 'yan-clear', overlay: 0, blurPx: 0, latinFont: 'source-serif', cjkFont: 'wenkai', justify: false }))
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const port = process.env.PORT ?? '5190'
const root = assertRoot('/tmp/lumen-p1-sediment-data')
assertPortFree(port)
const sizes = [[1440, 900], [1280, 800]]
const results = []
let failed = 0
let failure = ''
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++ }
// F1 lesson recorded: existing is not visible — the hit test must land on the element itself or a descendant
const visibleAt = (page, selector) => page.evaluate(target => {
  const element = document.querySelector(target)
  if (!element) return false
  const box = element.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return false
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  return !!hit && (hit === element || element.contains(hit))
}, selector)

// ---- The controllable model: fill eight blocks, invite, quote back; everything else answers plainly ----
const model = (() => {
  let calls = 0
  const call = (name, args) => toolReply(name, args, `call-${++calls}`)
  const lastUser = request => {
    const index = request.messages.map(message => message.role).lastIndexOf('user')
    return JSON.stringify(request.messages[index])
  }
  return fixtureProvider(request => {
    const text = lastUser(request)
    const results = request.messages.slice(request.messages.map(m => m.role).lastIndexOf('user')).filter(m => m.role === 'tool').length
    // Since the canvas (2026-11-19) a draw is an ElementSkeleton fragment; the app lays it out when the board opens
    if (text.includes('画满')) return results < 3 ? call('board_draw', { title: `第${results + 1}笔`, elements: [{ type: 'rectangle', x: results * 240, y: 0, width: 200, height: 80, label: { text: `对齐的第 ${results + 1} 点` } }] }) : textReply('画好了，值得留的我指给你')
    // The invite points at no element: the draws above are still waiting for the app to lay them out
    if (text.includes('邀请')) return results ? textReply('等你写一句') : call('sediment_invite', { question: '对齐是在做什么，用你自己的话说？' })
    if (text.includes('递回')) return results ? textReply('给你递回去了') : call('sediment_quote', { text: '注意力就是把查询和键对齐' })
    return textReply('好')
  })
})()

await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true, mode: 0o700 })
await mkdir(out, { recursive: true })
const lock = acquireServiceLock(root)
const service = await createHttpService({ dataRoot: root, token: lock.identity,
  model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: model.fetch },
  allowedOrigins: [`http://localhost:${port}`] })
const { serve } = await import('@hono/node-server')
const network = serve({ hostname: '127.0.0.1', port: 0, fetch: request => service.app.fetch(request) })
if (!network.listening) await new Promise(resolve => network.once('listening', resolve))
const address = network.address()
await publishDiscovery(lock, `http://127.0.0.1:${address.port}`)
const base = `http://127.0.0.1:${address.port}`
const headers = { Authorization: `Bearer ${lock.identity}`, 'Content-Type': 'application/json' }
const request = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers })

// ---- Seed: the sediment scenario plus the panels regression one (three sheets + a PDF) ----
ensureTopic({ studio: service.application.studio }, 'attn', '注意力为什么能对齐')
ensureTopic({ studio: service.application.studio }, 'sv', '自注意力为什么能取代循环')
const studio = service.application.studio
await request('/lumen/topics/attn/sessions', { method: 'POST', body: JSON.stringify({ taskId: 'a' }) })
await request('/lumen/topics/sv/sessions', { method: 'POST', body: JSON.stringify({ taskId: 'a' }) })
const run = async (topic, message) => {
  const current = await service.application.session(topic, 'a')
  const response = await request(`/api/agent-controller/lumen/sessions/${encodeURIComponent(`${topic}:a`)}/messages`, { method: 'POST', body: JSON.stringify({ message }) })
  if (response.status !== 200) throw new Error(`send ${message}: ${response.status} ${await response.text()}`)
  // A run may not have started when POST returns: first wait until it reaches the model, then for the end, then confirm no further requests (a queued follow-up)
  const before = model.requests.length
  const deadline = Date.now() + 90000
  while (model.requests.length <= before) {
    if (Date.now() > deadline) throw new Error(`run ${message} did not start`)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  for (;;) {
    while (current.displayState.get().isRunning) {
      if (Date.now() > deadline) throw new Error(`run ${message} did not finish`)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const seen = model.requests.length
    await new Promise(resolve => setTimeout(resolve, 400))
    if (!current.displayState.get().isRunning && model.requests.length === seen) break
  }
  console.log('run done:', message, 'requests:', model.requests.length, 'last tools:', JSON.stringify((model.requests.at(-1)?.messages ?? []).filter(m => m.role === 'tool').map(m => String(m.content).slice(0, 80))).slice(0, 300))
}
// Old data (before the canvas): a takeaway linked to an old block on attn's first sheet; its chip shows the title only, and deleting that sheet still counts it (R17).
// Each pass deletes the first sheet, so each pass seeds its own
const seedLegacy = () => {
  const legacy = legacyBlock(studio.db, studio.board.sheets('attn')[0]!.id, { title: '旧白板上的一块' })
  studio.sediment.create('attn', { text: '旧白板时留下的一句', origin: 'typed', blocks: [{ id: legacy, rev: 1 }] })
}
await run('attn', '我觉得那个注意力就是把查询和键对齐')
await run('attn', '画满')
await run('attn', '邀请')
await run('attn', '递回')
await run('attn', '递回')
// The panels scenario: three sheets, the first with two blocks (text + ladder), and a PDF referenced into the topic
const svSheets = studio.board.sheets('sv')
studio.board.canvas.save(svSheets[0]!.id, [element('step', 'rectangle', { x: 40, y: 40, width: 220, height: 90 }), element('ladder', 'diamond', { x: 320, y: 40, width: 160, height: 120 })])
studio.board.createSheet('sv')
studio.board.createSheet('sv')
// The panels assertion finds the material by arXiv id: the title comes from the PDF info
// The title falls back to the file name (panels looks the material up by arXiv id); no first-page big type, or the heading would claim the title
const pdf = await studio.library.add({ name: '1706.03762.pdf', bytes: titledPdf({}), addedBy: 'you' })
studio.topics.reference('sv', pdf.item.id)

// ---- The vite dev page (the discovery file points at the isolated service) ----
const vite = spawn('npm', ['run', 'dev', '--', '--port', port, '--strictPort'], {
  cwd: new URL('../..', import.meta.url).pathname, stdio: 'ignore', detached: true,
  env: { ...process.env, LUMEN_MASTRA_HOME: root, BROWSER: 'none' },
})
process.on('exit', () => { try { process.kill(-vite.pid, 'SIGTERM') } catch { /* already gone */ } })
const pageReady = async () => {
  for (let i = 0; i < 120; i++) {
    try { const response = await fetch(`http://localhost:${port}/`); if (response.ok) return } catch { /* not up yet */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('vite dev page never came up')
}
await pageReady()

if (process.argv.includes('--hold')) {
  console.log('HOLD fixture ready; vite on', port)
  await new Promise(() => {})
}
const browser = await chromium.launch({ executablePath: exe })
const settle = page => page.waitForTimeout(600)
// Reading is the default view since P1-2: the board's cases start from the Board view
const openBoardView = page => page.locator('.studio-views [role=tab]', { hasText: M.studio.views.board }).click()
try {
  // ==== Sediment cases: main language x both viewports; clear skin by default, one dark pass and one English pass ====
  for (const [w, h] of sizes) {
    // Before each pass refill the currently selected sheet and prepare an invite and two offers (the previous pass deleted a sheet and consumed offers)
    seedLegacy()
    await run('attn', '画满')
    await run('attn', '邀请')
    await run('attn', '递回')
    await run('attn', '递回')
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    const dark = w === 1280
    await page.addInitScript(seedLocale, LOCALE)
    if (dark) await page.addInitScript(seedDark)
    await page.goto(`http://localhost:${port}/`)
    await page.waitForSelector('.studio-topics .topic')
    const shot = name => page.screenshot({ path: `${out}/${w}-${dark ? 'dark-' : ''}${name}.png` })
    await page.locator('.studio-topics .topic', { hasText: '注意力为什么能对齐' }).click()
    await openBoardView(page)
    try {
      await page.waitForSelector('.board-sediment-row', { timeout: 15000 })
    } catch {
      await page.screenshot({ path: `${out}/${w}-DEBUG-no-row.png` })
      const debug = await page.evaluate(async () => {
        const connection = (window).__LUMEN_MASTRA__
        const sheets = connection ? await fetch(`${connection.baseUrl}/lumen/topics/attn/sheets`, { headers: { Authorization: `Bearer ${connection.token}` } }).then(r => r.json()).catch(error => String(error)) : null
        return { connection, sheets, board: document.querySelector('.studio-board')?.textContent?.slice(0, 200) ?? 'no board', later: document.querySelector('.studio-later')?.textContent ?? '' }
      })
      console.log('DEBUG', JSON.stringify(debug).slice(0, 600))
      throw new Error('board-sediment-row did not appear')
    }
    // ---- The full-board row: invite question + pre-linked blocks + one-line input + skip ----
    const rowText = await page.textContent('.board-sediment-row')
    check(`${w} 邀请行：问题与输入都在`, rowText.includes('对齐是在做什么') && !!(await page.$('.sediment-input')), '')
    check(`${w} 邀请行可见可点（elementFromPoint）`, await visibleAt(page, '.board-sediment-row') && await visibleAt(page, '.sediment-input') && await visibleAt(page, '.board-sediment-skip'), '')
    check(`${w} 邀请问题可见`, await visibleAt(page, '.board-sediment-invite'), '')
    await shot('full-row')
    // ---- Keep one (the full-board entry, with the two invited blocks pre-linked) ----
    await page.fill('.sediment-input', LOCALE === 'zh' ? '对齐让相关的词互相靠近' : 'Alignment brings related words together')
    await page.press('.sediment-input', 'Enter')
    await page.waitForSelector('.board-sediment-row .mw-error, .board-sediment-row', { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(800)
    await shot('after-keep-row')
    // ---- The takeaways view: entries, pending offers, the strikethrough interaction, keep ----
    await page.locator('.studio-views [role=tab]', { hasText: M.studio.views.settled }).click()
    await page.waitForSelector('.sediment-entry')
    const entries = await page.$$('.sediment-entry')
    check(`${w} 自写条目在列`, entries.length >= 1, String(entries.length))
    check(`${w} 「写一条沉淀」可见可点`, await visibleAt(page, '.sediment-keep'), '')
    check(`${w} 待确认报价单在输入上方`, (await page.$$('.sediment-offer')).length >= 1, String((await page.$$('.sediment-offer')).length))
    check(`${w} 报价单的留下/不要可见可点`, await visibleAt(page, '.sediment-offer .sediment-offer-actions button'), '')
    await shot('takeaways')
    // Strikethrough: click restores, click again re-deletes, then keep (a second offer stays pending for the dark/English passes)
    const strike = page.locator('.sediment-offer').first().locator('.sediment-strike').first()
    await strike.click()
    check(`${w} 删除线点一下放回`, await strike.evaluate(node => node.classList.contains('is-restored')))
    await strike.click()
    check(`${w} 再点一下再删`, await strike.evaluate(node => !node.classList.contains('is-restored')))
    await shot('offer-strike')
    await page.locator('.sediment-offer').first().locator('button', { hasText: M.studio.sediment.offerKeep }).click()
    await page.waitForTimeout(800)
    check(`${w} 留下后成为原话条目`, (await page.$$('.sediment-entry')).length >= 2 && !!(await page.$('.sediment-origin')), '')
    await shot('after-offer-keep')
    // ---- An old block's chip (before the canvas): its title only; a click goes nowhere and breaks nothing ----
    const retired = page.locator('.sediment-chip.is-retired').first()
    check(`${w} 旧白板的链接只显示标题`, (await retired.count()) === 1 && (await retired.textContent())!.includes('旧白板上的一块') && (await retired.evaluate(node => node.tagName)) === 'SPAN', '')
    await retired.click()
    await page.waitForTimeout(400)
    check(`${w} 点旧链接不跳转、不报错、不空白`, !!(await page.$('.sediment-entry')) && !(await page.$('.studio-board')) && !(await page.$('.mw-error')), '')
    await shot('chip-retired')
    await openBoardView(page)
    // ---- Delete the sheet: the dialog carries the takeaway count; entries stay, links report the deletion ----
    await page.locator('.board-sheet-new').click()
    await page.waitForTimeout(600)
    const tabs = page.locator('.board-tabs .board-tab > button:first-child')
    await tabs.first().click()
    await page.locator('.board-tab').first().locator('.board-tab-more').click()
    await page.locator('[role=menuitem]', { hasText: M.studio.board.remove }).click()
    await page.waitForSelector('.board-remove-modal')
    const dialog = await page.textContent('.board-remove-modal')
    check(`${w} 删除确认框带受影响条目数`, /\d/.test(dialog) && dialog.includes(LOCALE === 'zh' ? '沉淀' : 'takeaway'), dialog.slice(0, 100))
    await shot('delete-dialog')
    await page.locator('.board-remove-modal button', { hasText: M.studio.board.removeConfirm }).click()
    await page.waitForTimeout(900)
    await page.locator('.studio-views [role=tab]', { hasText: M.studio.views.settled }).click()
    await page.waitForSelector('.sediment-chip.is-gone')
    check(`${w} 链接标为已删、条目保留`, (await page.$$('.sediment-entry')).length >= 2, '')
    await shot('deleted-link')
    // ---- Settings: speech habits ----
    await page.locator('.studio-foot button', { hasText: M.studio.settings }).click()
    await page.waitForSelector('.settings-nav')
    await page.locator('.settings-nav-item', { hasText: M.settings.tabs.habits }).click()
    await page.waitForSelector('.habits-row')
    check(`${w} 习惯页列出片段`, (await page.$$('.habits-row')).length >= 1, '')
    await shot('habits')
    await page.keyboard.press('Escape')
    await context.close()
  }

  // ==== The other skin at each size: shoot the full row and the takeaways page (both sizes × both skins) ====
  for (const [w, h] of sizes) {
    const other = w === 1440
    // The row comes with an invite: the full-board row retired with the canvas (2026-11-19)
    await run('attn', '画满')
    await run('attn', '邀请')
    await run('attn', '递回')
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    await page.addInitScript(seedLocale, LOCALE)
    if (other) await page.addInitScript(seedDark)
    await page.goto(`http://localhost:${port}/`)
    await page.waitForSelector('.studio-topics .topic')
    await page.locator('.studio-topics .topic', { hasText: '注意力为什么能对齐' }).click()
    await openBoardView(page)
    await page.waitForSelector('.board-sediment-row')
    check(`${w} ${other ? 'dark' : 'light'} 邀请行可见`, await visibleAt(page, '.sediment-input') && await visibleAt(page, '.board-sediment-skip'), '')
    await page.screenshot({ path: `${out}/${w}-${other ? 'dark' : 'light'}-full-row.png` })
    await page.fill('.sediment-input', '对齐让相关的词互相靠近')
    await page.press('.sediment-input', 'Enter')
    await page.waitForTimeout(800)
    await page.locator('.studio-views [role=tab]', { hasText: M.studio.views.settled }).click()
    await page.waitForSelector('.sediment-entry')
    // offers list above entries (S8/S9), so the first entry can start below the fold on 1280×800: scroll as a user would, then hit-test
    const scrolled = await visibleAt(page, '.sediment-entry') ? 'in place' : 'after scroll'
    if (scrolled === 'after scroll') await page.locator('.sediment-entry').first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    check(`${w} ${other ? 'dark' : 'light'} 沉淀页可见（${scrolled}）`, await visibleAt(page, '.sediment-entry'), '')
    await page.screenshot({ path: `${out}/${w}-${other ? 'dark' : 'light'}-takeaways.png` })
    await context.close()
  }

  // ==== One English pass (1440×900 clear): catalog and layout both ----
  if (LOCALE !== 'en') {
    // Re-seed before the English pass too: refill the selected sheet and prepare offers
    await run('attn', '画满')
    await run('attn', '邀请')
    await run('attn', '递回')
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    await page.addInitScript(locale => localStorage.setItem('lumen:locale.v1', JSON.stringify({ version: 1, locale })), 'en')
    await page.goto(`http://localhost:${port}/`)
    await page.waitForSelector('.studio-topics .topic')
    await page.locator('.studio-topics .topic', { hasText: '注意力为什么能对齐' }).click()
    await page.locator('.studio-views [role=tab]', { hasText: 'Board' }).click()
    await page.waitForSelector('.board-sediment-row')
    const row = await page.textContent('.board-sediment-row')
    check('en 邀请行', row.includes("The AI's question"), row.slice(0, 60))
    await page.screenshot({ path: `${out}/1440-en-full-row.png` })
    await page.locator('.studio-views [role=tab]', { hasText: 'Takeaways' }).click()
    await page.waitForSelector('.sediment-entry')
    await page.screenshot({ path: `${out}/1440-en-takeaways.png` })
    check('en 沉淀视图', (await page.$$('.sediment-entry')).length >= 2, '')
    await context.close()
  }

  // ==== The panels regression (the R16/R17 assertions live there; its own LOCALE picks the language) ====
  const panels = await new Promise(resolve => {
    const child = spawn('node', ['scripts/sprite/ui-assert-panels.mjs', `${out}/panels`, '自注意力为什么能取代循环'], {
      cwd: new URL('../..', import.meta.url).pathname, env: { ...process.env, PORT: port, LOCALE, UI2: '1' },
    })
    let text = ''
    child.stdout.on('data', chunk => { text += chunk; process.stdout.write(chunk) })
    child.stderr.on('data', chunk => process.stderr.write(chunk))
    child.on('exit', code => resolve({ code, text }))
  })
  check('panels 回归脚本退出码 0', panels.code === 0, `exit=${panels.code}`)
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
