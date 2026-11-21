/**
 * [INPUT]: a self-contained isolated fixture service (real Controller + controllable model that answers with reading_patch / reading_insert) and the vite dev page on PORT
 *          (default 5191, refused when already taken); data root LUMEN_ASSERT_ROOT (default /tmp/lumen-rp-reading-data, /tmp/lumen-* only, wiped at start); a seeded one-section
 *          reading of a PDF: two prose paragraphs (seeded questions: one about the second, one about the first's last sentence with its block id, one that matches nothing) and a params widget whose script
 *          declares top-level const/let and listens to lumen:params
 * [OUTPUT]: browser evidence for reading_patch and rev1 B1 (Chromium zh 1440 light, `--webkit` the same; one pass each): the person moves the range to its max and flips the toggle;
 *           the model patches the widget's html (one text) and params (max 10 → 6) together: no page reload, exactly one fresh iframe, the page shows the new text, the other
 *           value is kept and the range is clamped, the page never reports a redeclared identifier; a params-only patch (label) keeps the same iframe (no load, no new node)
 *           and the values still reach the page; a prose patch shows the new sentence without a reload while the other paragraph keeps its footprint, and the footprint on the patched sentence turns dashed
 *           on the new sentence and still opens the original quote; a question that matches nothing keeps a mark at its paragraph's edge (hit-tested, line height kept); an inserted widget that
 *           throws shows the failure line, 「请 AI 修正」 sends the fix request naming reading_view(blockId) and reading_patch; the model's patch still throws, so the
 *           new generation shows the line again; a second patch that works clears it with the new code running. The deliberate widget's runtime errors are the only script errors tolerated
 * [POS]: the reading_patch acceptance beside ui-assert-reading.mts (kept apart so neither suite passes the 800-line cap); it swaps the model network only and touches no
 *        product protocol; screenshots land in the evidence directory, never in the repo
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
// Usage: node --experimental-strip-types ui-assert-reading-patch.mts <evidence-dir> [--webkit]
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
import { MODEL_TEXT } from '../../src/i18n/locales/model.ts'
import { sectionLabel } from '../../src/mastra/studio/reading-ask.ts'
import { messageRole, messageText } from '../../src/mastra/data/feed.ts'

const out = process.argv[2]
if (!out) throw new Error('evidence dir required')
const useWebkit = process.argv.includes('--webkit')
const seedLocale = () => { if (window === window.top) localStorage.setItem('lumen:locale.v1', JSON.stringify({ version: 1, locale: 'zh' })) }
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const port = process.env.PORT ?? '5191'
const root = assertRoot('/tmp/lumen-rp-reading-data')
assertPortFree(port)
const TOPIC = '局部修改', TITLE = '缩放与饱和', WIDGET = '常量小实验'
const LINE = 'Scaled dot-product attention divides the logits by the square root of the key dimension.'
const OLD_SENTENCE = '缩放让 softmax 留在梯度还够大的区域。', NEW_SENTENCE = '缩放把 logits 拉回 softmax 梯度还够大的区域。'
const ASKED = '没有缩放时，维度越大，点积的方差越大'
const ORPHAN = 'zzqq xxyy wwvv'
const FIX_MARK = '解读里的小实验运行出错：'
const params = (max: number, label = '增益') => [
  { type: 'range', name: 'gain', label, min: 0, max, step: 1, default: 3 },
  { type: 'toggle', name: 'feedback', label: '反馈', default: false },
]
const HTML = `<div style="padding:12px 16px;font:14px system-ui,sans-serif;color:#1f1d1a;background:#fbfaf7">
  <p id="ver">版本一：上限十</p>
  <pre id="seen" style="font:12px monospace"></pre>
</div>
<script>
const seen = document.getElementById('seen');
let shown = 0;
function show(p) { shown++; seen.textContent = JSON.stringify(p) }
show(window.lumenParams);
window.addEventListener('lumen:params', function (e) { show(e.detail) });
</script>`
const BROKEN = { kind: 'widget', title: '会出错的小实验', html: '<div id="x">坏</div><script>const x = document.getElementById("x"); x.textContent = missingValue.length</script>', source: { kind: 'inference' } }
const seeded = { itemId: '', sectionId: '', prose: '', widget: '' }
const brokenId = () => studio.readings.view('rp', seeded.itemId)!.sections[0]!.paragraphs.find(block => 'title' in block && block.title === BROKEN.title)!.id
const results: string[] = []
let failed = 0, failure = ''
const check = (name: string, ok: boolean, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++ }

// ---- The controllable model: each request names one patch; the fix request carries the broken block's id ----
const model = (() => {
  let calls = 0
  const call = (name: string, args: unknown) => toolReply(name, args, `call-${++calls}`)
  return fixtureProvider(async request => {
    const index = request.messages.map(message => message.role).lastIndexOf('user')
    const text = JSON.stringify(request.messages[index])
    if (request.messages.slice(index).some(message => message.role === 'tool')) return textReply('改好了。')
    const { itemId } = seeded
    if (text.includes(FIX_MARK)) {
      const blockId = /blockId: \\"(p[0-9a-f]{10})\\"/.exec(text)?.[1]
      return blockId ? call('reading_patch', { itemId, blockId, edits: [{ old: 'missingValue.length', new: 'otherMissing.length' }] }) : textReply('没找到块 id')
    }
    if (text.includes('请修好它')) return call('reading_patch', { itemId, blockId: brokenId(), edits: [{ old: 'otherMissing.length', new: '"修好了"' }] })
    if (text.includes('把上限调到六')) return call('reading_patch', { itemId, blockId: seeded.widget, edits: [{ old: '版本一：上限十', new: '版本二：上限六' }], params: params(6) })
    if (text.includes('改个名字')) return call('reading_patch', { itemId, blockId: seeded.widget, params: params(6, '增益系数') })
    if (text.includes('改一句')) return call('reading_patch', { itemId, blockId: seeded.prose, edits: [{ old: OLD_SENTENCE, new: NEW_SENTENCE }] })
    if (text.includes('加一个会出错的')) return call('reading_insert', { itemId, sectionId: seeded.sectionId, afterId: seeded.widget, block: BROKEN })
    return textReply('点积的方差随维度线性增长。')
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
const address = network.address() as { port: number }
await publishDiscovery(lock, `http://127.0.0.1:${address.port}`)
const api = (path: string) => fetch(`http://127.0.0.1:${address.port}${path}`, { headers: { Authorization: `Bearer ${lock.identity}` } }).then(response => response.json())

// ---- Seed: one section (two prose paragraphs, the params widget); a question about the second paragraph makes its footprint ----
const studio = service.application.studio
ensureTopic({ studio }, 'rp', TOPIC)
const pdf = await studio.library.add({ name: 'attention.pdf', bytes: pagedPdf([['Attention is all you need', LINE]]), addedBy: 'you' })
studio.topics.reference('rp', pdf.item.id)
const written = studio.readings.write('rp', pdf.item.id, { title: TITLE, paragraphs: [
  { text: `点积除以根号 d_k。${OLD_SENTENCE}`, source: { kind: 'paper', page: 1, quote: LINE } },
  { text: `${ASKED}，softmax 就越容易饱和。`, source: { kind: 'inference' } },
  { kind: 'widget', title: WIDGET, html: HTML, params: params(10), source: { kind: 'inference' } },
] }, { threadId: null, runId: null })
const section = written.reading.sections[0]!
Object.assign(seeded, { itemId: pdf.item.id, sectionId: written.sectionId, prose: section.paragraphs[0]!.id, widget: section.paragraphs[2]!.id })
await service.catalog.createSession('rp', 'a')
await (await service.application.session('rp', 'a')).sendMessage({ content: MODEL_TEXT.askReading(ASKED, sectionLabel(section), written.reading.itemTitle, '为什么方差会变大？') })
await (await service.application.session('rp', 'a')).sendMessage({ content: MODEL_TEXT.askReading(OLD_SENTENCE, sectionLabel(section), written.reading.itemTitle, '为什么要缩放？', seeded.prose) })
await (await service.application.session('rp', 'a')).sendMessage({ content: MODEL_TEXT.askReading(ORPHAN, sectionLabel(section), written.reading.itemTitle, '这句呢？', section.paragraphs[1]!.id) })

async function userMessages() {
  const texts: string[] = []
  for (const s of (await api('/lumen/topics/rp/sessions')).items) {
    const id = encodeURIComponent(`rp:${s.taskId}`)
    for (const message of (await api(`/api/agent-controller/lumen/sessions/${id}/threads/${id}/messages`)).messages ?? []) if (messageRole(message) === 'user') texts.push(messageText(message))
  }
  return texts
}

const vite = spawn('npm', ['run', 'dev', '--', '--port', port, '--strictPort'], {
  cwd: new URL('../..', import.meta.url).pathname, stdio: 'ignore', detached: true, env: { ...process.env, LUMEN_MASTRA_HOME: root, BROWSER: 'none' },
})
process.on('exit', () => { try { process.kill(-vite.pid!, 'SIGTERM') } catch { /* already gone */ } })
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://localhost:${port}/`)).ok) break } catch { /* not up yet */ }
  if (i > 120) throw new Error('vite dev page never came up')
  await new Promise(resolve => setTimeout(resolve, 500))
}

const browser = useWebkit ? await webkit.launch() : await chromium.launch({ executablePath: exe, args: ['--disable-features=IsolateSandboxedIframes'] })
const tag = useWebkit ? 'webkit' : 'chromium'
const shot = (n: string) => `${out}/${tag}-${n}.png`
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(seedLocale)
  await page.goto(`http://localhost:${port}/`)
  await page.waitForSelector('.studio-topics .topic')
  await page.locator('.studio-topics .topic', { hasText: TOPIC }).click()
  await page.locator('.material').first().locator('.material-reading').click()
  const figure = page.locator('.reading-block-widget').filter({ has: page.locator('.reading-widget-name', { hasText: WIDGET }) })
  await figure.waitFor()
  await figure.scrollIntoViewIfNeeded()
  const frameOf = async (block = figure, ready = '#seen') => {
    for (let attempt = 0; attempt < 80; attempt++) {
      const frame = await (await block.locator('iframe').elementHandle().catch(() => null))?.contentFrame().catch(() => null)
      if (frame && ((await frame.locator(ready).textContent().catch(() => '')) ?? '').trim()) return frame
      await page.waitForTimeout(150)
    }
    throw new Error(`widget frame never showed ${ready}`)
  }
  const seenIn = async () => JSON.parse((await (await frameOf()).locator('#seen').textContent())!)
  const ask = async (words: string, block = figure) => {
    await block.locator('.reading-widget-ask').click()
    await page.waitForSelector('.reading-ask[data-placed="true"]')
    await page.fill('.reading-ask textarea', words)
    await page.waitForSelector('.reading-ask-send:not([disabled])', { timeout: 30000 })
    await page.press('.reading-ask textarea', 'Enter')
  }
  // Mark the page and the widget's iframe; count every iframe node added under the widget and every load of the current iframe
  const watch = () => figure.evaluate(node => {
    const w = window as unknown as Record<string, unknown>
    w.__samePage = true
    w.__frames = 0
    w.__loads = 0
    const iframe = node.querySelector('iframe') as HTMLIFrameElement & { __old?: boolean }
    iframe.__old = true
    iframe.addEventListener('load', () => { (w.__loads as number)++ })
    new MutationObserver(records => { for (const record of records) for (const added of record.addedNodes) if (added instanceof Element && (added.tagName === 'IFRAME' || added.querySelector('iframe'))) (w.__frames as number)++ })
      .observe(node, { childList: true, subtree: true })
  })
  const counters = () => figure.evaluate(node => {
    const w = window as unknown as Record<string, unknown>
    return { samePage: w.__samePage === true, frames: w.__frames as number, loads: w.__loads as number, old: !!(node.querySelector('iframe') as HTMLIFrameElement & { __old?: boolean }).__old,
      diag: node.querySelector('.widget-frame')?.getAttribute('data-widget-diag') ?? '' }
  })

  // ---- Before: the footprint is on the second paragraph; the person moves the range to its max and flips the toggle ----
  const asked = page.locator('[data-paragraph]').nth(1).locator('.reading-footprint')
  await asked.waitFor({ timeout: 15000 })
  check(`${tag} 第二段带着种下的足迹`, await asked.count() === 1)
  const first = page.locator('[data-paragraph]').first()
  check(`${tag} 第一段被问的那句是普通足迹`, await first.locator('.reading-footprint:not(.is-edited)').count() === 1 && (await first.locator('.reading-footprint').textContent()) === OLD_SENTENCE)
  const mark = page.locator('[data-paragraph]').nth(1).locator('.reading-footprint-mark')
  check(`${tag} 一个字都对不上的提问退到那一段的边上`, await mark.count() === 1)
  const edge = await mark.evaluate(node => {
    const box = node.getBoundingClientRect(), para = node.closest('.reading-para')!, height = para.getBoundingClientRect().height
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    ;(node as HTMLElement).style.display = 'none'
    const without = para.getBoundingClientRect().height
    ;(node as HTMLElement).style.display = ''
    return { hit: !!hit && node.contains(hit), height, without }
  })
  check(`${tag} 边上的标记点得到、不撑高行`, edge.hit && Math.abs(edge.height - edge.without) < 0.5, JSON.stringify(edge))
  await figure.locator('[data-param="gain"] input').focus()
  await page.keyboard.press('End')
  await figure.locator('[data-param="feedback"] [role="switch"]').click()
  await page.waitForTimeout(400)
  check(`${tag} 调过的值送进小实验`, JSON.stringify(await seenIn()) === JSON.stringify({ gain: 10, feedback: true }), JSON.stringify(await seenIn()))
  await watch()

  // ---- 1. html + params patched together: one fresh iframe, the new text, values kept and clamped, no redeclared identifier ----
  await ask('请把上限调到六')
  await page.waitForFunction(() => Number(document.querySelector('[data-param="gain"] input')?.getAttribute('max')) === 6, null, { timeout: 30000 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(2500)
  let count = await counters()
  check(`${tag} 改 html 后页面没刷新、只换了一个新 iframe`, count.samePage && count.frames === 1 && !count.old, JSON.stringify(count))
  check(`${tag} 没有重复声明错误`, !/already been declared|redeclar|Can't create duplicate/i.test(count.diag + errors.join(' ')) && !/\berr\b/.test(count.diag), count.diag.slice(0, 200))
  const frame = await frameOf()
  check(`${tag} 新代码生效：页面上读到改过的那处文字`, (await frame.locator('#ver').textContent()) === '版本二：上限六')
  check(`${tag} 用户调过的值保留、越界的被夹回`, JSON.stringify(await seenIn()) === JSON.stringify({ gain: 6, feedback: true }), JSON.stringify(await seenIn()))
  check(`${tag} 换代后没有失败行`, await figure.locator('.reading-widget-failed').count() === 0)
  await figure.screenshot({ path: shot('patched-html') })

  // ---- 2. params only: the same iframe (no node, no load) and the values still reach the page ----
  await watch()
  await ask('请给增益改个名字')
  await page.waitForFunction(() => document.querySelector('[data-param="gain"] .widget-param-label')?.textContent === '增益系数', null, { timeout: 30000 })
  await page.keyboard.press('Escape')
  await figure.locator('[data-param="gain"] input').focus()
  await page.keyboard.press('Home')
  await page.waitForTimeout(500)
  count = await counters()
  check(`${tag} 只改 params：iframe 不重挂、不重载`, count.samePage && count.frames === 0 && count.loads === 0 && count.old, JSON.stringify(count))
  check(`${tag} 只改 params：值照旧送达`, JSON.stringify(await seenIn()) === JSON.stringify({ gain: 0, feedback: true }), JSON.stringify(await seenIn()))

  // ---- 3. a prose patch: the new sentence without a reload, the other paragraph keeps its footprint ----
  await ask('请改一句第一段')
  await page.waitForFunction(sentence => document.querySelector('[data-paragraph]')?.textContent?.includes(sentence), NEW_SENTENCE, { timeout: 30000 })
  await page.keyboard.press('Escape')
  check(`${tag} 文字段改了一句：不刷新就显示新句子`, (await counters()).samePage && !(await page.locator('[data-paragraph]').first().textContent())!.includes(OLD_SENTENCE))
  check(`${tag} 同节另一段的足迹不受影响`, await asked.count() === 1 && (await asked.textContent())!.includes(ASKED))
  const edited = first.locator('.reading-footprint.is-edited')
  check(`${tag} 被改的那句：足迹换成已改样式、挂在新句子上`, await edited.count() === 1 && (await edited.textContent()) === NEW_SENTENCE
    && await edited.evaluate(node => getComputedStyle(node).textDecorationStyle) === 'dashed')
  await edited.click()
  await page.waitForSelector('.reading-ask[data-placed="true"]')
  check(`${tag} 点开已改的足迹：小窗里仍是当时问的原句`, (await page.locator('.reading-ask-quote').textContent()) === OLD_SENTENCE)
  await page.keyboard.press('Escape')
  await page.locator('.reading-section').first().screenshot({ path: shot('patched-prose') })

  // ---- 4. a widget that throws; 「请 AI 修正」 names reading_view(blockId) + reading_patch; a patch that still throws shows the line again; a patch that works clears it ----
  await ask('再加一个会出错的')
  const broken = page.locator('.reading-block-widget').filter({ has: page.locator('.reading-widget-name', { hasText: BROKEN.title }) })
  const failedLine = broken.locator('.reading-widget-failed')
  await failedLine.waitFor({ timeout: 30000 })
  await page.keyboard.press('Escape')
  await broken.scrollIntoViewIfNeeded()
  check(`${tag} 会出错的小实验显示失败行`, await failedLine.count() === 1)
  await broken.screenshot({ path: shot('broken') })
  const firstError = await failedLine.getAttribute('title')
  await failedLine.locator('button').click()
  await page.waitForFunction(first => { const line = [...document.querySelectorAll('.reading-widget-failed')].at(-1); return !!line && line.getAttribute('title') !== first || (!!line && /Script error/.test(first ?? '')) }, firstError, { timeout: 30000 })
  await failedLine.waitFor({ timeout: 30000 })
  const fix = (await userMessages()).filter(text => text.startsWith(FIX_MARK)).at(-1) ?? ''
  check(`${tag} 修正请求指向 reading_view(blockId) 与 reading_patch`, /reading_view\(\{ itemId: "[^"]+", blockId: "p[0-9a-f]{10}" \}\)/.test(fix) && fix.includes('reading_patch') && !fix.includes('reading_write'), JSON.stringify(fix.slice(-160)))
  const secondError = await failedLine.getAttribute('title')
  check(`${tag} 换代后新代码再出错，失败行重新出现（${useWebkit ? 'WebKit 只给 Script error.' : '带新错误'}）`, await failedLine.count() === 1 && (useWebkit ? true : /otherMissing/.test(secondError ?? '')), String(secondError))
  await ask('请修好它', broken)
  await failedLine.waitFor({ state: 'detached', timeout: 30000 })
  await page.keyboard.press('Escape')
  let shownFixed = ''
  for (let attempt = 0; attempt < 80 && shownFixed !== '修好了'; attempt++) {
    shownFixed = await (async () => (await (await broken.locator('iframe').elementHandle())?.contentFrame())?.locator('#x').textContent({ timeout: 500 }))().catch(() => '') ?? ''
    if (shownFixed !== '修好了') await page.waitForTimeout(150)
  }
  await page.waitForTimeout(3500)
  check(`${tag} patch 修好后失败行消失、新代码在跑`, await failedLine.count() === 0 && shownFixed === '修好了', shownFixed)
  await broken.screenshot({ path: shot('fixed') })
  const unexpected = errors.filter(message => !/missingValue|otherMissing/.test(message))
  check(`${tag} 无脚本错误（故意抛错的 missingValue/otherMissing 除外）`, !unexpected.length, unexpected.join('; ').slice(0, 200))
  await context.close()
} catch (error) {
  failure = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
  failure += `\nlast tool result: ${String(model.requests.at(-1)?.messages.filter(message => message.role === 'tool').at(-1)?.content ?? '').slice(0, 400)}`
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
  try { process.kill(-vite.pid!, 'SIGTERM') } catch { /* already gone */ }
  await rm(root, { recursive: true, force: true })
  process.exit(failed === 0 ? 0 : 1)
}
