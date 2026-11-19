/**
 * [INPUT]: ./assert-env.ts; a self-contained isolated fixture service (real Controller + controllable model: 等一下 holds the run until the script opens the gate,
 *          问我 waits on the user) and the vite dev page on PORT (default 5193, refused when already taken); data root LUMEN_ASSERT_ROOT (default /tmp/lumen-lc-data, /tmp/lumen-* only, wiped at start)
 * [OUTPUT]: browser evidence for U1–U8 (captures per pass: both menus, the inline rename, the conversation list, both delete dialogs, a busy menu, Settings › 已归档 with items and empty) in four passes (1440×900 zh light, 1280×800 en dark, 1440×900 en dark, 1280×800 zh light), each on its own seeded topics:
 *           the 「⋯」 menu opens by mouse and by keyboard on both lists with 重命名 · 复制 ID · 归档 ─ 删除 (danger last) and Esc gives focus back to its button;
 *           rename by the menu (Enter), by double click (Esc keeps, blur saves, empty keeps), checked on the service too; Copy ID puts the exact id on the clipboard
 *           with 「已复制」 and no id is visible as text; busy rows (running, waiting) have 归档/删除 disabled with the busy reason as the item's title while 重命名/复制 ID stay;
 *           archiving or deleting the selected row selects the neighbour (topic: next, else previous; conversation: next, else the new-conversation state); the delete dialog
 *           has the title, the one consequence line, 取消 focused, Esc cancels; Settings › 已归档 lists both kinds, unarchive brings a topic back and delete empties to 「还没有」;
 *           the conversation list has no 「新对话」 button and an untitled conversation shows the catalog's untitled word; no console or page errors.
 *           WebKit (zh 1440×900 light): the topic menu, the delete dialog and Settings › 已归档 captured
 * [POS]: an acceptance script that swaps the model network only and touches no product protocol. Screenshots land in the evidence directory, never in the repo.
 *        Usage: node --experimental-strip-types ui-assert-lifecycle.mts <evidence-dir>. Do not edit source while it runs: vite's reload replaces the page mid-check
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { chromium, webkit } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
import { mkdir, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { assertPortFree, assertRoot } from './assert-env.ts'
import { createHttpService } from '../../../mastra-service/src/server.ts'
import { acquireServiceLock } from '../../../mastra-service/src/deployment/lock.ts'
import { publishDiscovery } from '../../../mastra-service/src/deployment/discovery.ts'
import { fixtureProvider, textReply, toolReply } from '../../../mastra-service/tests/provider-fixture.ts'
import { ensureTopic } from '../../../mastra-service/tests/topic-fixture.ts'

const out = process.argv[2]
if (!out) throw new Error('evidence dir required')
const catalogs = { zh: (await import('../../src/i18n/locales/zh.ts')).zh, en: (await import('../../src/i18n/locales/en.ts')).en }
const seedLocale = locale => localStorage.setItem('lumen:locale.v1', JSON.stringify({ version: 1, locale }))
const seedDark = () => localStorage.setItem('lumen:appearance.v2', JSON.stringify({ version: 1, mode: 'dark', skinId: 'yan-clear', overlay: 0, blurPx: 0, latinFont: 'source-serif', cjkFont: 'wenkai', justify: false }))
const port = process.env.PORT ?? '5193'
const root = assertRoot('/tmp/lumen-lc-data')
assertPortFree(port)
const results = []
let failed = 0, step = 'start'
/** Ids of deleted topics, their sheets and deleted conversations: the only URLs whose late 404 is expected */
const deleted = new Set<string>()
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++ }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(probe, ms = 8000) {
  const limit = Date.now() + ms
  for (;;) { if (await probe()) return true; if (Date.now() > limit) return false; await sleep(100) }
}

// ---- The controllable model: 等一下 holds until the gate opens, 问我 asks the user, anything else answers at once ----
// Each pass holds its own run, so the gate is replaced per pass; a held call keeps the promise it started with
let openGate = () => {}
let gate = Promise.resolve()
const newGate = () => { gate = new Promise<void>(resolve => { openGate = resolve }) }
let calls = 0
const model = fixtureProvider(async request => {
  const last = JSON.stringify(request.messages.filter(message => message.role === 'user').at(-1) ?? '')
  const answered = request.messages.some(message => message.role === 'tool')
  if (last.includes('问我')) return answered ? textReply('好') : toolReply('ask_user', { question: '先看哪一段？' }, `ask-${++calls}`)
  if (last.includes('等一下')) { await gate; return textReply('等到了') }
  return textReply('好')
})

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
const api = (path, init: RequestInit = {}) => service.app.fetch(new Request(`http://local${path}`, { ...init, headers: { Authorization: `Bearer ${lock.identity}`, 'Content-Type': 'application/json' } }))
const studio = service.application.studio
const session = (topic, task) => api(`/lumen/topics/${topic}/sessions`, { method: 'POST', body: JSON.stringify({ taskId: task }) })
const send = (topic, task, message) => api(`/api/agent-controller/lumen/sessions/${encodeURIComponent(`${topic}:${task}`)}/messages`, { method: 'POST', body: JSON.stringify({ message }) })
const sessionsOf = async topic => (await (await api(`/lumen/topics/${topic}/sessions`)).json()).items ?? []
const topicLight = async topic => (await (await api(`/lumen/topics/${topic}`)).json())

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

async function open(browser, { locale, w, h, dark = false }) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
  if (browser === chromiumBrowser) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${port}` })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(`${step}: ${error.message}`))
  // A request already in flight when its topic or conversation is deleted answers 404; the browser logs that itself. Only those URLs are allowed (deleted holds their ids)
  page.on('console', message => {
    const at = message.location()?.url ?? ''
    const late = /status of 404/.test(message.text()) && [...deleted].some(key => decodeURIComponent(at).includes(key))
    if (message.type() === 'error' && !at.endsWith('/favicon.ico') && !late) errors.push(`${step}: ${message.text()} @ ${at}`)
  })
  await page.addInitScript(seedLocale, locale)
  if (dark) await page.addInitScript(seedDark)
  await page.goto(`http://localhost:${port}/`)
  await page.waitForSelector('.studio-topics .topic')
  return { context, page, errors }
}
const topicRow = (page, title) => page.locator('.studio-topics .action-row', { has: page.locator('.action-row-title', { hasText: new RegExp(`^${title}$`) }) })
const selectedTopic = page => page.locator('.studio-topics .topic.on .action-row-title').textContent().catch(() => null)
const menuItems = page => page.locator('[role=menu] [role=menuitem]')
/** Hover the row, click its 「⋯」 and wait until the menu's items are there */
async function openMenu(page, row) {
  await row.hover(); await row.locator('.action-row-more').click()
  await page.waitForSelector('[role=menu] [role=menuitem]'); await sleep(150)
}
/** The open menu as [text, disabled, title] rows plus whether a separator sits right before the last item */
const menuShape = page => page.evaluate(() => {
  const menu = document.querySelector('[role=menu]')
  if (!menu) return null
  const items = [...menu.querySelectorAll('[role=menuitem]')].map(node => [node.textContent!.trim(), node.getAttribute('aria-disabled') === 'true' || node.hasAttribute('data-disabled'), node.getAttribute('title') ?? ''])
  const last = menu.querySelectorAll('[role=menuitem]')[3]
  return { items, separator: last?.previousElementSibling?.getAttribute('role') === 'separator', danger: (last?.className ?? '').includes('danger') || getComputedStyle(last!).color !== getComputedStyle(menu.querySelector('[role=menuitem]')!).color }
})
const pick = async (page, title) => { step = title; await topicRow(page, title).locator('button').first().click(); await until(async () => await selectedTopic(page) === title) }

async function pass(browser, { locale, w, h, dark, tag }) {
  const L = catalogs[locale], R = L.studio.row, A = L.settings.archived
  // ---- Seed this pass's topics: A (selected, renamed and archived), B (runs), C (waits), D (deleted), E (conversations) ----
  const id = (name: string) => `${name}-${tag}`
  const name = (letter: string) => `${letter}·${tag}`
  for (const letter of ['a', 'b', 'c', 'd', 'e']) ensureTopic({ studio }, id(letter), name(letter.toUpperCase()))
  for (const task of ['one', 'two', 'three']) await session(id('e'), task)
  await send(id('e'), 'one', '你好'); await send(id('e'), 'two', '再来')
  await until(async () => (await sessionsOf(id('e'))).filter(item => item.title).length === 2 && (await sessionsOf(id('e'))).every(item => !item.running))
  const { context, page, errors } = await open(browser, { locale, w, h, dark })
  const shot = async name => page.screenshot({ path: `${out}/${tag}-${name}.png` })
  try {
    // ---- U1: the 「⋯」 shows on hover; mouse opens the menu with four items, a separator and danger last; Esc returns focus ----
    step = `${tag} U1`
    await pick(page, name('A'))
    const rowB = topicRow(page, name('B'))
    await page.mouse.move(2, 2)
    const hidden = await rowB.locator('.action-row-more').evaluate(node => getComputedStyle(node).opacity)
    await rowB.hover(); await sleep(250)
    const shown = await rowB.locator('.action-row-more').evaluate(node => getComputedStyle(node).opacity)
    check(`${tag} U1 「⋯」悬停才出现、选中行常显`, hidden === '0' && shown === '1' && await topicRow(page, name('A')).locator('.action-row-more').evaluate(node => getComputedStyle(node).opacity) === '1', `${hidden}→${shown}`)
    await openMenu(page, rowB)
    const shape = await menuShape(page)
    check(`${tag} U1 主题菜单：重命名·复制 ID·归档─删除`, JSON.stringify(shape?.items.map(item => item[0])) === JSON.stringify([R.rename, R.copyId, R.archive, R.remove]) && !!shape?.separator && !!shape?.danger, JSON.stringify(shape))
    await shot('topic-menu')
    await page.keyboard.press('Escape')
    check(`${tag} U1 Esc 关菜单焦点回到「⋯」`, await until(async () => !await page.locator('[role=menu]').count()) && await page.evaluate(() => document.activeElement?.classList.contains('action-row-more')))
    // Keyboard: Tab from the row's button reaches its 「⋯」, Enter opens, arrows move, Enter on 重命名 opens the input with the text selected
    await topicRow(page, name('B')).locator('button').first().focus()
    await page.keyboard.press('Tab')
    const onMore = await page.evaluate(() => document.activeElement?.classList.contains('action-row-more'))
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role=menu]')
    await until(async () => await page.evaluate(() => document.activeElement?.getAttribute('role') === 'menuitem'))
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp')
    const focusedItem = await page.evaluate(() => document.activeElement?.textContent?.trim())
    await page.keyboard.press('Enter')
    const input = page.locator('.studio-topics .row-rename')
    await input.waitFor()
    await shot('rename')
    const selected = await input.evaluate(node => (node as HTMLInputElement).selectionStart === 0 && (node as HTMLInputElement).selectionEnd === (node as HTMLInputElement).value.length && document.activeElement === node)
    check(`${tag} U1/U2 键盘：Tab 到「⋯」、Enter 开菜单、Enter 重命名，输入框聚焦全选`, onMore && focusedItem === R.rename && selected, `${onMore} ${focusedItem} ${selected}`)
    // ---- U2: Enter saves (trimmed, on the service too) ----
    step = `${tag} U2`
    await input.fill(`  ${name('B')}改  `); await page.keyboard.press('Enter')
    check(`${tag} U2 菜单重命名 Enter 保存（去空白，服务端一致）`, await until(async () => await topicRow(page, `${name('B')}改`).count() === 1) && (await topicLight(id('b'))).title === `${name('B')}改`)
    // Double click: Esc keeps, blur saves, empty keeps
    const rowD = () => topicRow(page, name('D')).locator('button').first()
    await rowD().dblclick(); await input.waitFor(); await input.fill('不要这个'); await page.keyboard.press('Escape')
    check(`${tag} U2 双击重命名 Esc 取消`, await until(async () => !await input.count()) && await topicRow(page, name('D')).count() === 1)
    await rowD().dblclick(); await input.waitFor(); await input.fill('   '); await page.keyboard.press('Enter')
    check(`${tag} U2 空标题保留原名`, await until(async () => !await input.count()) && await topicRow(page, name('D')).count() === 1 && (await topicLight(id('d'))).title === name('D'))
    await rowD().dblclick(); await input.waitFor(); await input.fill(`${name('D')}改`); await page.locator('.studio-head-title').first().click()
    check(`${tag} U2 双击重命名失焦保存`, await until(async () => await topicRow(page, `${name('D')}改`).count() === 1) && (await topicLight(id('d'))).title === `${name('D')}改`)
    // ---- U3: Copy ID puts the topic id on the clipboard; 「已复制」 shows about a second; no id visible ----
    step = `${tag} U3`
    await openMenu(page, topicRow(page, name('C')))
    await menuItems(page).nth(1).click()
    const copied = await until(async () => await topicRow(page, name('C')).locator('.action-row-copied').count() === 1, 1000)
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    const gone = await until(async () => !await topicRow(page, name('C')).locator('.action-row-copied').count(), 2500)
    const ids = await page.evaluate(tag => document.body.innerText.includes(`-${tag}`), tag)
    check(`${tag} U3 复制主题 ID 精确、「已复制」约一秒后消失、界面不显示 ID`, copied && clip === id('c') && gone && !ids, `${clip}`)
    // ---- U6: running (B) and waiting (C) rows have 归档/删除 disabled with the reason; 重命名/复制 ID stay ----
    step = `${tag} U6`
    newGate()
    await session(id('b'), 'run'); await send(id('b'), 'run', '等一下')
    await session(id('c'), 'ask'); await send(id('c'), 'ask', '问我')
    await until(async () => !!(await page.locator('.topic .topic-light-running').count()) && !!(await page.locator('.topic .topic-light-waiting').count()), 15000)
    for (const [label, row] of [['运行中', `${name('B')}改`], ['等你', name('C')]]) {
      await openMenu(page, topicRow(page, row))
      const busy = await menuShape(page)
      check(`${tag} U6 ${label}：归档/删除禁用并说明原因，重命名/复制可用`, !!busy && !busy.items[0][1] && !busy.items[1][1] && busy.items[2][1] && busy.items[3][1] && busy.items[2][2] === R.busy && busy.items[3][2] === R.busy, JSON.stringify(busy?.items))
      if (label === '运行中') await shot('busy-menu')
      await page.keyboard.press('Escape'); await until(async () => !await page.locator('[role=menu]').count())
    }
    // ---- U4: archiving the selected topic (A) removes it and selects the next one ----
    step = `${tag} U4`
    await pick(page, name('A'))
    const order = await page.locator('.studio-topics .action-row-title').allTextContents()
    const next = order[order.indexOf(name('A')) + 1] ?? order[order.indexOf(name('A')) - 1]
    await openMenu(page, topicRow(page, name('A'))); await menuItems(page).nth(2).click()
    check(`${tag} U4 归档选中主题：离开列表并选中相邻`, await until(async () => !await topicRow(page, name('A')).count() && await selectedTopic(page) === next), `next=${next} now=${await selectedTopic(page)}`)
    // ---- U5: deleting the selected topic (D) asks once; Esc cancels; 删除 removes it and selects the neighbour ----
    step = `${tag} U5`
    await pick(page, `${name('D')}改`)
    const dOrder = await page.locator('.studio-topics .action-row-title').allTextContents()
    const dNext = dOrder[dOrder.indexOf(`${name('D')}改`) + 1] ?? dOrder[dOrder.indexOf(`${name('D')}改`) - 1]
    const openRemove = async (row: string) => { await openMenu(page, topicRow(page, row)); await menuItems(page).nth(3).click(); await page.waitForSelector('[role=alertdialog]') }
    await openRemove(`${name('D')}改`)
    await until(async () => await page.evaluate(() => !!document.activeElement?.closest('[role=alertdialog]')))
    const dialog = await page.evaluate(() => {
      const box = document.querySelector('[role=alertdialog]')!
      return { title: box.querySelector('h2, [id$=title], [class*=title]')?.textContent?.trim(), body: box.querySelector('p, [class*=hint]')?.textContent?.trim(), focus: document.activeElement?.textContent?.trim(), buttons: [...box.querySelectorAll('button')].map(node => node.textContent?.trim()) }
    })
    check(`${tag} U5 删除确认：标题、一行后果、取消聚焦`, dialog.title === R.removeTopic(`${name('D')}改`) && dialog.body === R.removeTopicBody && dialog.focus === R.cancel && JSON.stringify(dialog.buttons.filter(Boolean)) === JSON.stringify([R.cancel, R.confirm]), JSON.stringify(dialog))
    await shot('remove-dialog')
    await page.keyboard.press('Escape')
    check(`${tag} U5 Esc 取消，主题还在`, await until(async () => !await page.locator('[role=alertdialog]').count()) && await topicRow(page, `${name('D')}改`).count() === 1)
    await openRemove(`${name('D')}改`)
    deleted.add(`/topics/${id('d')}`); for (const sheet of studio.board.sheets(id('d'))) deleted.add(sheet.id)
    await page.locator('[role=alertdialog] button', { hasText: new RegExp(`^${R.confirm}$`) }).click()
    check(`${tag} U5 删除选中主题：离开列表、选中相邻、服务端 404`, await until(async () => !await topicRow(page, `${name('D')}改`).count() && await selectedTopic(page) === dNext) && (await api(`/lumen/topics/${id('d')}`)).status === 404, `next=${dNext}`)
    openGate()
    // ---- Conversations (E): no 「新对话」 button, untitled word, menu by mouse and keyboard, copy, rename, archive and delete move the open one ----
    step = `${tag} sprite`
    await pick(page, name('E'))
    await page.locator('.sprite-orb').click()
    if (!await until(async () => !!await page.locator('.sprite-floating .sprite-title').count(), 4000)) { await shot('debug-sprite'); throw new Error('the sprite did not open') }
    const S = L.studio.sprite
    const listOpen = async () => { if (!await page.locator('.sprite-list').count()) await page.locator('.sprite-title').click(); await page.waitForSelector('.sprite-list .action-row') }
    await listOpen()
    await until(async () => await page.locator('.sprite-list .action-row').count() === 3)
    await shot('session-list')
    const stray = await page.evaluate(() => [...document.querySelectorAll('.sprite-list button')].filter(node => !node.closest('.action-row')).length)
    const titles = await page.locator('.sprite-list .action-row-title').allTextContents()
    check(`${tag} U8 对话列表没有「新对话」按钮，未命名显示目录词`, stray === 0 && titles.includes(S.untitled) && titles.filter(title => title === S.untitled).length === 1, JSON.stringify(titles))
    const sessionRow = (title: string) => page.locator('.sprite-list .action-row', { has: page.locator('.action-row-title', { hasText: new RegExp(`^${title}$`) }) })
    const items = await sessionsOf(id('e'))
    const titleOf = task => items.find(item => item.taskId === task)?.title ?? S.untitled
    await openMenu(page, sessionRow(titleOf('two')))
    const sShape = await menuShape(page)
    check(`${tag} U1 对话菜单与主题同形`, JSON.stringify(sShape?.items.map(item => item[0])) === JSON.stringify([R.rename, R.copyId, R.archive, R.remove]) && !!sShape?.separator, JSON.stringify(sShape))
    await shot('session-menu')
    await menuItems(page).nth(1).click()
    const sClip = await until(async () => await page.evaluate(() => navigator.clipboard.readText()) === `${id('e')}:two`, 1500)
    check(`${tag} U3 复制对话 ID 为 topicId:taskId`, sClip, await page.evaluate(() => navigator.clipboard.readText()))
    step = `${tag} sprite keyboard`
    // Keyboard on the conversation list: focus the row, Tab to 「⋯」, Enter, 重命名 (first item), type, Enter
    // The closing menu hands focus back to its own 「⋯」; wait for that before moving focus, or it lands on the previous row
    await until(async () => !await page.locator('[role=menu]').count()); await sleep(300)
    await sessionRow(S.untitled).locator('button').first().focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Enter')
    await page.waitForSelector('[role=menu]'); await until(async () => await page.evaluate(() => document.activeElement?.getAttribute('role') === 'menuitem'))
    await page.keyboard.press('Enter')
    const sInput = page.locator('.sprite-list .row-rename')
    await sInput.waitFor(); await sInput.fill('第三段'); await page.keyboard.press('Enter')
    check(`${tag} U1/U2 对话键盘菜单重命名`, await until(async () => await sessionRow('第三段').count() === 1) && (await sessionsOf(id('e'))).find(item => item.taskId === 'three')?.title === '第三段')
    step = `${tag} sprite dblclick`
    // Double click renames (the deferred single click does not open the conversation)
    await sessionRow(titleOf('one')).locator('button').first().dblclick(); await sInput.waitFor(); await sInput.fill('第一段'); await page.keyboard.press('Enter')
    check(`${tag} U2 对话双击重命名`, await until(async () => await sessionRow('第一段').count() === 1) && !!await page.locator('.sprite-list').count())
    step = `${tag} sprite archive`
    // Open 第一段, archive it from the list: the open conversation becomes the next one (two)
    await sessionRow('第一段').locator('button').first().click()
    await until(async () => !await page.locator('.sprite-list').count())
    await listOpen()
    const sOrder = await page.locator('.sprite-list .action-row-title').allTextContents()
    const sNext = sOrder[sOrder.indexOf('第一段') + 1]
    await openMenu(page, sessionRow('第一段')); await menuItems(page).nth(2).click()
    check(`${tag} U4 归档打开中的对话：离开列表、打开下一段`, await until(async () => !await sessionRow('第一段').count() && await page.locator('.sprite-list .action-row.is-on .action-row-title').textContent().catch(() => null) === sNext), `next=${sNext}`)
    step = `${tag} sprite delete`
    // Delete the open one (now sNext) through the dialog
    await openMenu(page, sessionRow(sNext)); await menuItems(page).nth(3).click()
    await page.waitForSelector('[role=alertdialog]')
    await until(async () => await page.evaluate(() => !!document.activeElement?.closest('[role=alertdialog]')))
    const sDialog = await page.evaluate(() => ({ text: document.querySelector('[role=alertdialog]')!.textContent, focus: document.activeElement?.textContent?.trim() }))
    await shot('session-remove-dialog')
    check(`${tag} U5 对话删除确认`, sDialog.text!.includes(R.removeSession(sNext)) && sDialog.text!.includes(R.removeSessionBody) && sDialog.focus === R.cancel)
    deleted.add(`${id('e')}:${(await sessionsOf(id('e'))).find(item => item.title === sNext)?.taskId}`)
    await page.locator('[role=alertdialog] button', { hasText: new RegExp(`^${R.confirm}$`) }).click()
    const left = await until(async () => !await sessionRow(sNext).count())
    check(`${tag} U5 删除对话后列表与服务端一致`, left && !(await sessionsOf(id('e'))).some(item => item.title === sNext))
    // ---- U7: Settings › 已归档 lists A and 第一段; unarchive A brings it back; delete 第一段 empties the list ----
    step = `${tag} U7`
    await page.locator('.sprite-floating [aria-label="' + S.collapse + '"]').click().catch(() => {})
    await page.locator('.studio-foot .studio-item').click()
    await page.locator('.settings-nav-item', { hasText: new RegExp(`^${L.settings.tabs.archived}$`) }).click()
    await page.waitForSelector('.archived-pane .habits-list, .archived-pane .set-hint')
    const archivedRow = (title: string) => page.locator('.archived-row', { has: page.locator('.archived-title', { hasText: new RegExp(`^${title}$`) }) })
    const listed = await until(async () => await archivedRow(name('A')).count() === 1 && await archivedRow('第一段').count() === 1)
    check(`${tag} U7 已归档列出主题与对话（对话带主题名）`, listed && (await archivedRow('第一段').locator('.archived-topic').textContent()) === name('E'))
    await shot('settings-archived')
    await archivedRow(name('A')).locator('button', { hasText: A.unarchive }).click()
    check(`${tag} U7 取消归档：离开已归档`, await until(async () => !await archivedRow(name('A')).count()))
    await archivedRow('第一段').locator('button', { hasText: A.remove }).click()
    await page.waitForSelector('[role=alertdialog]')
    check(`${tag} U7 已归档删除同一确认框`, (await page.locator('[role=alertdialog]').textContent())!.includes(R.removeSessionBody))
    await page.locator('[role=alertdialog] button', { hasText: new RegExp(`^${R.confirm}$`) }).click()
    check(`${tag} U7 删光后两表都写「还没有」`, await until(async () => !await page.locator('.archived-row').count() && (await page.locator('.archived-pane .set-hint').allTextContents()).filter(text => text === A.none).length >= 1))
    await shot('settings-archived-empty')
    await page.keyboard.press('Escape')
    check(`${tag} U7 取消归档的主题回到左栏`, await until(async () => await topicRow(page, name('A')).count() === 1, 6000))
    check(`${tag} 删除后界面没有报错行`, !await page.locator('[role=alert]').filter({ hasText: /\S/ }).count())
    check(`${tag} 无控制台错误`, errors.length === 0, errors.slice(0, 3).join(' | '))
  } catch (error) {
    await shot('error').catch(() => {})
    throw error
  } finally {
    openGate()
    await context.close()
  }
}

let chromiumBrowser
const passes = [
  { locale: 'zh', w: 1440, h: 900, dark: false, tag: 'zh1440l' },
  { locale: 'en', w: 1280, h: 800, dark: true, tag: 'en1280d' },
  { locale: 'en', w: 1440, h: 900, dark: true, tag: 'en1440d' },
  { locale: 'zh', w: 1280, h: 800, dark: false, tag: 'zh1280l' },
]
chromiumBrowser = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' })
try {
  // ONLY=<tag> runs one pass and skips WebKit, for debugging a single pass
  for (const options of passes.filter(item => !process.env.ONLY || item.tag === process.env.ONLY)) {
    try { await pass(chromiumBrowser, options) } catch (error) { check(`${options.tag} 运行中断`, false, `${step}: ${(error as Error).message.split('\n')[0]}`) }
  }
} finally { await chromiumBrowser.close() }

// ---- WebKit: the topic menu, the delete dialog and Settings › 已归档 (zh 1440×900 light) ----
const wk = await webkit.launch()
try {
  if (process.env.ONLY) throw new Error('skip')
  const L = catalogs.zh, R = L.studio.row
  ensureTopic({ studio }, 'wk-keep', '留着看'); ensureTopic({ studio }, 'wk-old', '收起来的'); ensureTopic({ studio }, 'wk-go', '要删的')
  await api('/lumen/topics/wk-old', { method: 'PATCH', body: JSON.stringify({ archived: true }) })
  const { context, page, errors } = await open(wk, { locale: 'zh', w: 1440, h: 900 })
  step = 'webkit'
  await pick(page, '要删的')
  await openMenu(page, topicRow(page, '要删的')); await sleep(300)
  await page.screenshot({ path: `${out}/webkit-topic-menu.png` })
  await menuItems(page).nth(3).click(); await page.waitForSelector('[role=alertdialog]'); await until(async () => await page.evaluate(() => !!document.activeElement?.closest('[role=alertdialog]'))); await sleep(300)
  await page.screenshot({ path: `${out}/webkit-remove-dialog.png` })
  check('WebKit 删除框取消聚焦', await page.evaluate(() => document.activeElement?.textContent?.trim()) === R.cancel)
  await page.keyboard.press('Escape')
  await page.locator('.studio-foot .studio-item').click()
  await page.locator('.settings-nav-item', { hasText: /^已归档$/ }).click()
  await page.waitForSelector('.archived-row'); await sleep(300)
  await page.screenshot({ path: `${out}/webkit-settings-archived.png` })
  check('WebKit 已归档列出收起来的主题', await page.locator('.archived-title', { hasText: /^收起来的$/ }).count() === 1)
  check('WebKit 无控制台错误', errors.length === 0, errors.slice(0, 2).join(' | '))
  await context.close()
} catch (error) { if ((error as Error).message !== 'skip') throw error } finally { await wk.close() }

console.log(results.join('\n'))
console.log(`\n${results.length - failed}/${results.length} passed`)
openGate()
network.close()
await service.close()
lock.release()
process.exit(failed ? 1 : 0)
