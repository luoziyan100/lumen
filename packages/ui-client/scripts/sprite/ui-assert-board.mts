/**
 * [INPUT]: the production build of this branch (OUTDIR, default /tmp/lumen-bx-build-branch) served by `vite preview` on PORT (default 5196, refused when taken);
 *          a self-contained isolated fixture service (real Controller, controllable model with vision on) on LUMEN_ASSERT_ROOT (default /tmp/lumen-board-data, guarded by assert-env.ts)
 * [OUTPUT]: phase-1 browser acceptance of the co-drawn canvas (task 2026-11-19-lumen-board-excalidraw), PASS/FAIL lines and screenshots in <evidence-dir>:
 *           UI cleanup A (no diagnostics line, no seed, library/Help/sticky note hidden, Excalidraw's controls and ours hit-test as themselves with no overlap at
 *           1440×900 and at 1280×800 with both panes open, solid surfaces on islands, menus and our overlays); a user stroke saved and back after a reload;
 *           a fixture board_draw inside the user's viewport, laid out with the page's own fonts, committed as the AI's, its arrow bound to the user's shape;
 *           the glance PUT after the AI's write and before a send, board_look updated, every request with at most one image and the one after board_look with one;
 *           board_erase's banner, restore and keep; the viewport PUT; any console error once the board opens fails the run, and so does any request to esm.sh
 * [POS]: the canvas's browser acceptance; it swaps the model network only. Chromium runs both sizes (zh light, en dark), WebKit one pass. The build strips
 *        Excalidraw's esm.sh font fallback (vite.config.ts, excalidraw/excalidraw#12609), so nothing is allowed. Usage: node --experimental-strip-types ui-assert-board.mts <evidence-dir>
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { chromium, webkit } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
import { mkdir, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { assertPortFree, assertRoot } from './assert-env.ts'
import { createHttpService } from '../../../mastra-service/src/server.ts'
import { acquireServiceLock } from '../../../mastra-service/src/deployment/lock.ts'
import { publishDiscovery, removeDiscovery } from '../../../mastra-service/src/deployment/discovery.ts'
import { fixtureProvider, textReply, toolReply, type ProviderRequest } from '../../../mastra-service/tests/provider-fixture.ts'
import { ensureTopic } from '../../../mastra-service/tests/topic-fixture.ts'

const out = process.argv[2]
if (!out) throw new Error('evidence dir required')
const port = process.env.PORT ?? '5196'
const outDir = process.env.OUTDIR ?? '/tmp/lumen-bx-build-branch'
const root = assertRoot('/tmp/lumen-board-data')
assertPortFree(port)
const catalogs = { zh: (await import('../../src/i18n/locales/zh.ts')).zh, en: (await import('../../src/i18n/locales/en.ts')).en }
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const results: string[] = []
let failed = 0
const check = (name: string, ok: boolean, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++ }

// ---- The controllable model: draw beside the user's shape, look, erase the user's shape; everything else answers plainly ----
// The glance rides the request as a user message of its own after tool results; the user's turn is the last user message that is not a glance
const glanceOnly = (message: ProviderRequest['messages'][number]) => Array.isArray(message.content) && (message.content as { type: string; text?: string }[])[0]?.text?.startsWith('白板「') === true
const lastUserIndex = (request: ProviderRequest) => request.messages.findLastIndex(message => message.role === 'user' && !glanceOnly(message))
const toolResults = (request: ProviderRequest) => request.messages.slice(lastUserIndex(request)).filter(message => message.role === 'tool').map(message => {
  try { return JSON.parse(String(message.content)) } catch { return String(message.content) }
})
const userText = (request: ProviderRequest) => {
  const content = request.messages[lastUserIndex(request)]?.content
  return typeof content === 'string' ? content : JSON.stringify(content)
}
let calls = 0
const model = fixtureProvider(request => {
  const text = userText(request), done = toolResults(request), call = (name: string, args: unknown) => toolReply(name, args, `call-${++calls}`)
  if (text.includes('画一个')) {
    if (!done.length) return call('board_view', {})
    if (done.length === 1) {
      const view = done[0] as { viewport: { x: number; y: number; w: number; h: number } | null; elements: { id: string; type: string; by: string }[] }
      const mine = view.elements.find(element => element.by === 'user' && element.type === 'rectangle')
      const area = view.viewport ?? { x: 0, y: 0, w: 800, h: 600 }
      return call('board_draw', { title: '原因', elements: [
        { type: 'ellipse', id: 'aiCause', x: Math.round(area.x + area.w * 0.55), y: Math.round(area.y + area.h * 0.2), label: { text: '原因 cause' } },
        ...(mine ? [{ type: 'arrow', id: 'aiLink', x: 0, y: 0, start: { id: 'aiCause' }, end: { id: mine.id } }] : []),
      ] })
    }
    return textReply('画好了')
  }
  if (text.includes('看看')) return done.length ? textReply('看到了') : call('board_look', {})
  if (text.includes('擦')) {
    if (!done.length) return call('board_view', {})
    if (done.length === 1) {
      const view = done[0] as { elements: { id: string; type: string; by: string }[] }
      const mine = view.elements.find(element => element.by === 'user' && element.type === 'rectangle')
      return mine ? call('board_erase', { ids: [mine.id], reason: '画废的一笔' }) : textReply('没有可擦的')
    }
    return textReply('擦掉了画废的那一笔')
  }
  return textReply('好')
})

// ---- Isolated service with vision on, one topic per pass ----
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true, mode: 0o700 })
await mkdir(out, { recursive: true })
const lock = acquireServiceLock(root)
const service = await createHttpService({ dataRoot: root, token: lock.identity,
  model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', vision: 'on', fetch: model.fetch }, allowedOrigins: [`http://localhost:${port}`] })
const { serve } = await import('@hono/node-server')
const network = serve({ hostname: '127.0.0.1', port: 0, fetch: request => service.app.fetch(request) })
if (!network.listening) await new Promise(resolve => network.once('listening', resolve))
const baseUrl = `http://127.0.0.1:${(network.address() as { port: number }).port}`
await publishDiscovery(lock, baseUrl)
const studio = service.application.studio
const headers = { Authorization: `Bearer ${lock.identity}`, 'Content-Type': 'application/json' }

const PASSES = [
  { tag: 'chromium-1440-zh-light', engine: 'chromium', w: 1440, h: 900, locale: 'zh', mode: 'light' },
  { tag: 'chromium-1280-en-dark', engine: 'chromium', w: 1280, h: 800, locale: 'en', mode: 'dark' },
  { tag: 'webkit-1440-zh-light', engine: 'webkit', w: 1440, h: 900, locale: 'zh', mode: 'light' },
] as const
for (const pass of PASSES) ensureTopic({ studio }, pass.tag, `白板验收 ${pass.tag}`)

/** The sprite opens its own conversation in the topic: wait until the model is reached, then until no session of the topic runs and no request follows */
async function waitRun(topic: string, before: number, message: string) {
  const deadline = Date.now() + 60000
  const running = async () => ((await (await fetch(`${baseUrl}/lumen/topics/${topic}/sessions`, { headers })).json()) as { items: { running: boolean; waiting: boolean }[] }).items.some(item => item.running)
  while (model.requests.length <= before) { if (Date.now() > deadline) throw new Error(`run ${message} did not start`); await sleep(50) }
  for (;;) {
    while (await running()) { if (Date.now() > deadline) throw new Error(`run ${message} did not finish`); await sleep(100) }
    const seen = model.requests.length
    await sleep(500)
    if (!(await running()) && model.requests.length === seen) return
  }
}
async function until<T>(read: () => T | Promise<T>, ms = 10000): Promise<T | null> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) { const value = await read(); if (value) return value }
  return null
}
const images = (request: ProviderRequest) => (JSON.stringify(request.messages).match(/data:image\/png;base64,/g) ?? []).length

// ---- The production build, served as is ----
const vite = spawn('npx', ['vite', 'preview', '--outDir', outDir, '--port', port, '--strictPort'], {
  cwd: new URL('../..', import.meta.url).pathname, stdio: 'ignore', detached: true, env: { ...process.env, BROWSER: 'none' },
})
process.on('exit', () => { try { process.kill(-vite.pid!, 'SIGTERM') } catch { /* already gone */ } })
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://localhost:${port}/`)).ok) break } catch { /* not up yet */ }
  if (i > 120) throw new Error('vite preview never came up')
  await sleep(500)
}

const local = (url: string) => /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|data:|blob:|about:)/.test(url)
const browsers = { chromium: await chromium.launch({ executablePath: exe }), webkit: await webkit.launch() }
let failure = ''

// ---- Page measurements ----
/** The visible controls of the editor and ours: each must be the topmost element at its own centre */
const covered = (page) => page.evaluate(() => {
  const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
  const controls = [...document.querySelectorAll('.board-canvas .excalidraw button, .board-canvas .excalidraw label.ToolIcon, .board-sheets button')].filter(shown)
  return controls.filter(el => {
    const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !hit || !(hit === el || el.contains(hit) || hit.contains(el))
  }).map(el => el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-testid') || el.className)
})
/** Islands stay inside the canvas, the strip sits below it, and nothing of the editor meets the strip or the panes' headers */
const geometry = (page) => page.evaluate(() => {
  const r = (el: Element | null) => el?.getBoundingClientRect() ?? null
  const meet = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
  const canvas = r(document.querySelector('.board-canvas'))!, strip = r(document.querySelector('.board-sheets'))!
  const islands = [...document.querySelectorAll('.board-canvas .excalidraw .Island')].map(el => r(el)!).filter(box => box.width > 0 && box.height > 0)
  const heads = [...document.querySelectorAll('.studio-topics-head, .studio-center-head, .studio-materials-head, .pane-head, header')].map(el => r(el)!).filter(box => box.width > 0)
  return {
    islands: islands.length,
    outside: islands.filter(box => box.left < canvas.left - 0.5 || box.right > canvas.right + 0.5 || box.top < canvas.top - 0.5 || box.bottom > canvas.bottom + 0.5).length,
    onStrip: islands.filter(box => meet(box, strip)).length,
    onHeads: islands.filter(box => heads.some(head => meet(box, head))).length,
    stripBelow: strip.top >= canvas.bottom - 0.5,
  }
})
/** Background alpha of the visible surfaces matched by selector (0 surfaces fails) */
const surfaces = (page, selector: string) => page.evaluate(selector => [...document.querySelectorAll(selector)].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }).map(el => {
  const style = getComputedStyle(el), match = style.backgroundColor.match(/rgba?\(([^)]+)\)/), parts = match ? match[1].split(/[ ,/]+/).filter(Boolean) : []
  return { name: (el as HTMLElement).className.toString().slice(0, 40), alpha: parts.length === 4 ? Number(parts[3]) : parts.length === 3 ? 1 : 0, blur: style.backdropFilter && style.backdropFilter !== 'none' }
}), selector)
const solid = (list: { alpha: number; blur: boolean }[]) => list.length > 0 && list.every(item => item.alpha === 1 && !item.blur)
/** Ink inside a page rectangle: how many pixels differ from its corner colour */
async function ink(page, clip: { x: number; y: number; width: number; height: number }) {
  const shot = await page.screenshot({ clip })
  return page.evaluate(async png => {
    const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode()
    const c = document.createElement('canvas'); c.width = image.width; c.height = image.height
    const x = c.getContext('2d')!; x.drawImage(image, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 60) n++
    return n
  }, shot.toString('base64'))
}

try {
  for (const pass of PASSES) {
    const { tag, engine, w, h, locale, mode } = pass, S = catalogs[locale].studio, topic = tag
    const sheetId = studio.board.sheets(topic)[0]!.id
    const context = await browsers[engine].newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    const errors: string[] = [], boot: string[] = [], external: string[] = [], fontFiles: string[] = [], state = { phase: 'boot' }
    // Offline: anything off this machine gets an empty answer and is listed (the app's web-font stylesheets; the board must add nothing)
    await context.route('**/*', route => {
      const url = route.request().url()
      if (/\.woff2(\?|$)/.test(url)) fontFiles.push(url)
      if (local(url)) return route.continue()
      external.push(`${state.phase} ${url}`)
      return route.fulfill({ status: 200, body: '', contentType: url.includes('css') ? 'text/css' : 'application/octet-stream' })
    })
    const page = await context.newPage()
    const record = (line: string) => (state.phase === 'boot' ? boot : errors).push(line)
    page.on('pageerror', error => record(`pageerror: ${error.message}`))
    page.on('console', message => { if (message.type() === 'error') record(`${message.text()} @ ${message.location()?.url ?? ''}`) })
    await page.addInitScript(([connection, locale, mode]) => {
      Object.assign(window, { __LUMEN_MASTRA__: connection })
      localStorage.setItem('lumen:locale.v1', JSON.stringify({ version: 1, locale }))
      localStorage.setItem('lumen:appearance.v2', JSON.stringify({ version: 1, mode, skinId: 'yan-clear', overlay: 0, blurPx: 0, latinFont: 'source-serif', cjkFont: 'wenkai', justify: false }))
    }, [{ baseUrl, token: lock.identity }, locale, mode])
    const shot = (name: string) => page.screenshot({ path: `${out}/${tag}-${name}.png` })
    const openBoard = async () => {
      state.phase = 'boot'
      await page.waitForSelector('.studio-topics .topic')
      state.phase = 'board'
      await page.locator('.studio-topics .topic', { hasText: `白板验收 ${tag}` }).click()
      await page.locator(`.studio-views:not(.studio-views-ghost) [role=tab][aria-label="${S.views.board}"]`).click()
      await page.waitForSelector('.board-canvas .excalidraw .excalidraw__canvas.interactive', { timeout: 30000 })
      await sleep(1200)
    }
    // Send from the sprite as the user does (the board refetches on the conversation's tool signal), wait for the run, then fold the sprite off the canvas
    const say = async (message: string) => {
      if (!(await page.locator('.composer-input').isVisible())) { await page.locator('.sprite-orb').focus(); await page.keyboard.press('Enter') }
      await page.waitForSelector('.sprite-floating[data-phase="open"] .composer-input', { state: 'visible' })
      const before = model.requests.length
      await page.fill('.composer-input', message)
      await page.press('.composer-input', 'Enter')
      await waitRun(topic, before, message).catch(async error => { await shot(`DEBUG-${message}`); throw error })
      await sleep(600)
    }
    const fold = async () => {
      const button = page.locator(`.sprite-floating button[aria-label="${catalogs[locale].studio.sprite.collapse}"]`)
      if (await button.count()) { await button.click(); await page.waitForSelector('.sprite-orb[data-phase="closed"]'); await sleep(300) }
    }
    await page.goto(`http://localhost:${port}/`)
    await openBoard()

    // ==== UI cleanup A ====
    check(`${tag} 没有诊断行`, !(await page.$('.board-canvas-diag, [data-canvas-diag]')) && !/diag|sceneVersion|fps/i.test(await page.textContent('.studio-board') ?? ''))
    check(`${tag} 没有种子：新白板是空的，画架在`, studio.board.canvas.liveElements(sheetId).length === 0 && !!(await page.$('.board-easel')))
    const hidden = await page.evaluate(() => ['.default-sidebar-trigger', '.help-icon', '[data-testid="toolbar-stickynote"]'].map(selector => {
      const el = document.querySelector(`.board-canvas .excalidraw ${selector}`)
      return { selector, present: !!el, shown: !!el && el.getBoundingClientRect().width > 0 }
    }))
    check(`${tag} 资料库/帮助/便利贴三个入口隐藏`, hidden.every(item => !item.shown), JSON.stringify(hidden))
    const geo = await geometry(page)
    check(`${tag} 编辑器的岛都在画布里、不碰白板条和栏头，白板条在画布下方`, geo.islands > 0 && !geo.outside && !geo.onStrip && !geo.onHeads && geo.stripBelow, JSON.stringify(geo))
    const blocked = await covered(page)
    check(`${tag} 编辑器与白板条的每个控件 elementFromPoint 命中自己`, !blocked.length, blocked.join('; '))
    check(`${tag} 编辑器的岛是实色`, solid(await surfaces(page, '.board-canvas .excalidraw .Island')), JSON.stringify(await surfaces(page, '.board-canvas .excalidraw .Island')))
    check(`${tag} 白板条是实色`, solid(await surfaces(page, '.board-sheets')), JSON.stringify(await surfaces(page, '.board-sheets')))
    await page.locator('.board-canvas .excalidraw [data-testid="main-menu-trigger"]').click(); await sleep(300)
    check(`${tag} 主菜单是实色`, solid(await surfaces(page, '.board-canvas .excalidraw .dropdown-menu-container')), JSON.stringify(await surfaces(page, '.board-canvas .excalidraw .dropdown-menu-container')))
    await shot('menu')
    await page.keyboard.press('Escape')
    await shot('empty')

    // ==== A user stroke: saved, and back after a reload ====
    const area = (await page.locator('.board-canvas .excalidraw__canvas.interactive').boundingBox())!
    const box = { x: area.x + area.width * 0.15, y: area.y + area.height * 0.35, width: 180, height: 110 }
    await page.locator('.board-canvas [data-testid="toolbar-rectangle"]').click()
    await page.mouse.move(box.x, box.y); await page.mouse.down(); await page.mouse.move(box.x + box.width, box.y + box.height, { steps: 8 }); await page.mouse.up()
    await page.keyboard.press('Escape'); await page.mouse.click(area.x + area.width * 0.8, area.y + area.height * 0.85)
    const saved = await until(() => studio.board.canvas.liveElements(sheetId).find(row => row.element.type === 'rectangle' && row.author === 'you'))
    check(`${tag} 用户画的框 600ms 后存进服务端，作者是用户`, !!saved)
    check(`${tag} 第一笔后画架离开`, !(await page.$('.board-easel')))
    const strokeClip = { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 }
    state.phase = 'boot'; await page.reload(); await openBoard()
    check(`${tag} 刷新后用户的框还在（画面有线条、服务端版本未变）`, (await ink(page, strokeClip)) > 200 && studio.board.canvas.liveElements(sheetId).find(row => row.element.id === saved?.element.id)?.element.version === saved?.element.version,
      `ink=${await ink(page, strokeClip)}`)

    // ==== The viewport: a scroll is saved ====
    const before = studio.board.canvas.viewport(sheetId)
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2)
    await page.mouse.wheel(0, 120); await sleep(200); await page.mouse.wheel(0, -60)
    const viewport = await until(() => { const now = studio.board.canvas.viewport(sheetId); return now && JSON.stringify(now) !== JSON.stringify(before) ? now : null }, 4000)
    check(`${tag} 滚动后视口存进服务端`, !!viewport, JSON.stringify(viewport))

    // ==== AI draws beside the user's shape, inside the viewport, with the page's fonts ====
    const sent = model.requests.length
    await say('画一个原因，连到我的框')
    const committed = await until(() => {
      const live = studio.board.canvas.liveElements(sheetId)
      return !studio.board.canvas.ops(sheetId).length && live.some(row => row.element.id === 'aiCause') ? live : null
    }, 15000)
    const byId = new Map((committed ?? []).map(row => [row.element.id, row]))
    const cause = byId.get('aiCause'), link = byId.get('aiLink'), label = (committed ?? []).find(row => row.element.containerId === 'aiCause')
    check(`${tag} AI 画的落了笔，作者是 AI`, !!cause && cause.author === 'ai' && link?.author === 'ai' && label?.author === 'ai' && (cause.element.customData as { author?: string })?.author === 'ai')
    check(`${tag} AI 的箭头绑在用户的框上，用户的框只多出这条箭头`, link?.element.endBinding?.elementId === saved?.element.id && link?.element.startBinding?.elementId === 'aiCause'
      && JSON.stringify(byId.get(saved?.element.id ?? "")?.element.boundElements) === JSON.stringify([{ id: 'aiLink', type: 'arrow' }]) && byId.get(saved?.element.id ?? "")?.author === 'you',
      JSON.stringify({ start: link?.element.startBinding, end: link?.element.endBinding, bound: byId.get(saved?.element.id ?? "")?.element.boundElements }))
    const stored = studio.board.canvas.viewport(sheetId)
    const centre = cause && { x: cause.element.x + cause.element.width / 2, y: cause.element.y + cause.element.height / 2 }
    check(`${tag} AI 画在用户看的区域里`, !!stored && !!centre && centre.x > stored.x && centre.x < stored.x + stored.width && centre.y > stored.y && centre.y < stored.y + stored.height, JSON.stringify({ stored, centre }))
    // document.fonts.check is true when no face matches, so the faces' own status and the font requests decide
    const faces = await page.evaluate(() => [...new Set([...document.fonts].filter(face => face.status === 'loaded').map(face => face.family.replaceAll('"', '')))])
    const own = fontFiles.filter(url => local(url) && new URL(url).pathname.startsWith('/excalidraw/fonts/')), foreignFonts = fontFiles.filter(url => !local(url))
    const families = [...new Set(own.map(url => new URL(url).pathname.split('/')[3]))]
    check(`${tag} 手写字体从同源 /excalidraw/fonts/ 加载（Excalifont 与 Xiaolai 都已载入）`, faces.includes('Excalifont') && faces.includes('Xiaolai') && families.includes('Excalifont') && families.includes('Xiaolai') && !foreignFonts.length,
      JSON.stringify({ faces, families, requests: own.length, foreign: foreignFonts.slice(0, 3) }))
    const word = label?.element as { width: number; text: string; fontSize: number } | undefined
    // The fixed-width stand-in the Node tests use would give 0.6em per character; real faces measure differently
    check(`${tag} 标签按真实字体量宽`, !!word && word.width > 0 && Math.abs(word.width - word.text.length * word.fontSize * 0.6) > 1, JSON.stringify(word && { width: word.width, text: word.text }))
    check(`${tag} 对话卡片出现`, (await until(() => page.$('.board-card'), 5000)) !== null)
    await fold()
    const glance = await until(() => studio.board.canvas.glanceCurrent(sheetId), 8000)
    check(`${tag} AI 写完后画面（glance）送到服务端并跟上最新版本`, !!glance, JSON.stringify(studio.board.canvas.glance(sheetId) && { v: studio.board.canvas.glance(sheetId)!.sceneVersion, now: studio.board.canvas.sceneVersion(sheetId) }))
    await shot('ai-draw')
    check(`${tag} 本轮每个请求最多一张图`, model.requests.slice(sent).every(request => images(request) <= 1), model.requests.slice(sent).map(images).join(','))

    // ==== board_look: the model asks, the glance is current, the next request carries it ====
    const looking = model.requests.length
    await say('看看画得怎么样'); await fold()
    const turn = model.requests.slice(looking), afterLook = turn.find(request => toolResults(request).length > 0)
    const look = afterLook && toolResults(afterLook)[0] as { updated?: boolean }
    check(`${tag} board_look 拿到新画面`, look?.updated === true, JSON.stringify(look))
    check(`${tag} board_look 之后的请求带一张图，本轮每个请求最多一张`, !!afterLook && images(afterLook) === 1 && turn.every(request => images(request) <= 1), turn.map(images).join(','))

    // ==== Before a send from the sprite, the glance catches up with what the user drew ====
    if (engine === 'chromium') {
      await page.locator('.board-canvas [data-testid="toolbar-ellipse"]').click()
      const at = { x: area.x + area.width * 0.2, y: area.y + area.height * 0.75 }
      await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x + 90, at.y + 50, { steps: 6 }); await page.mouse.up()
      await page.keyboard.press('Escape')
      await until(() => studio.board.canvas.liveElements(sheetId).some(row => row.element.type === 'ellipse' && row.author === 'you'), 4000)
      const stale = !studio.board.canvas.glanceCurrent(sheetId)
      const asked = model.requests.length
      await say('这样呢')
      const first = model.requests[asked]
      check(`${tag} 发送前画面跟上用户刚画的（发送前过期、第一个请求就带上新图）`, stale && !!first && images(first) === 1 && studio.board.canvas.glance(sheetId)!.sceneVersion >= studio.board.canvas.sceneVersion(sheetId) - 0,
        JSON.stringify({ stale, images: first && images(first), glance: studio.board.canvas.glance(sheetId)?.sceneVersion, scene: studio.board.canvas.sceneVersion(sheetId) }))
      await fold()
    }

    // ==== board_erase: the user's stroke goes to the recycle record; the banner restores it ====
    await say('把我画废的框擦掉'); await fold()
    const banner = await until(() => page.$('.board-erased'), 8000)
    check(`${tag} 擦了用户的笔画：横幅出现，带笔数与理由`, !!banner && (await banner.textContent())!.includes('1') && (await banner.textContent())!.includes('画废的一笔'), banner ? (await banner.textContent())! : '')
    check(`${tag} 用户的框从画布上软删`, !studio.board.canvas.liveElements(sheetId).some(row => row.element.id === saved?.element.id))
    check(`${tag} 横幅实色、按钮可点`, solid(await surfaces(page, '.board-erased')) && !(await covered(page)).length && await page.evaluate(() => {
      const b = document.querySelector('.board-erased-act')!.getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      return !!hit && !!hit.closest('.board-erased-act')
    }))
    await shot('erased')
    await page.locator('.board-erased-act', { hasText: S.board.restoreErased }).click()
    const back = await until(() => studio.board.canvas.liveElements(sheetId).find(row => row.element.id === saved?.element.id), 5000)
    check(`${tag} 一键恢复：用户的框回来，作者仍是用户，横幅消失`, !!back && back.author === 'you' && !(await until(() => page.$('.board-erased').then(el => !el), 3000) === null))
    await sleep(800)
    check(`${tag} 恢复后画面上有那个框`, (await ink(page, strokeClip)) > 200)
    // Erase again and keep it gone
    await say('把我画废的框擦掉'); await fold()
    await until(() => page.$('.board-erased'), 8000)
    await page.locator('.board-erased-act', { hasText: S.board.keepErased }).click()
    check(`${tag} 「不用恢复」：横幅消失，框不回来`, !!(await until(() => page.$('.board-erased').then(el => !el), 3000)) && !studio.board.canvas.liveElements(sheetId).some(row => row.element.id === saved?.element.id))
    await shot('final')

    // ==== Console and network ====
    check(`${tag} 打开白板之后控制台 0 条错误（构建已删 esm.sh 字体回退，excalidraw/excalidraw#12609）`, !errors.length, `${errors.length} 条 ${[...new Set(errors.map(line => line.slice(0, 160)))].slice(0, 5).join(' | ')}`)
    const off = external.filter(line => line.startsWith('board '))
    check(`${tag} 白板没有发往本机以外的请求`, !off.length, off.slice(0, 5).join(' | '))
    check(`${tag} 没有任何 esm.sh 请求`, !external.some(line => line.includes('esm.sh')))
    // Page load, before the board: not this task's, listed so a reviewer sees them
    results.push(`INFO ${tag} 载入阶段（白板之前）控制台 ${boot.length} 条：${[...new Set(boot.map(line => line.slice(0, 110)))].join(' | ')}；外部请求 ${external.filter(line => line.startsWith('boot ')).length} 条`)
    await context.close()
  }
} catch (error) {
  failure = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
  failed++
} finally {
  results.forEach(line => console.log(line))
  if (failure) console.log(`ERROR\n${failure}`)
  console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILURES`)
  for (const browser of Object.values(browsers)) await browser.close()
  network.close()
  await service.close()
  await removeDiscovery(lock)
  lock.release()
  try { process.kill(-vite.pid!, 'SIGTERM') } catch { /* already gone */ }
  await rm(root, { recursive: true, force: true })
  process.exit(failed === 0 ? 0 : 1)
}
