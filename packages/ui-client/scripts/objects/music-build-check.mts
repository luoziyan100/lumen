/**
 * [INPUT]: vite (build and preview, the project's own vite.config.ts) and the CSP string of src-tauri/tauri.conf.json; samples/SOURCES.md of objects/music/; an isolated fixture service
 *          (createHttpService with the controllable model) on a root under /tmp/lumen-*; listenAudio and seedKit of ../sprite/music-checks.ts; playwright-core from /tmp/lumen-s0-pw with Chromium 1228
 * [OUTPUT]: build facts (no data:audio in any .js/.css/.html of the bundle; the number of .m4a files in assets equals the rows of SOURCES.md; no recording inside a script chunk) and a preview run
 *           under the desktop's CSP sent as a response header: the recordings load, sources start on hover, no CSP violation and no console error (the preview server's favicon 404 and the web build's meta-CSP
 *           frame-ancestors notice are listed apart: neither comes from the music set); exit 1 on a failed check
 * [POS]: Q8's evidence that the recordings ship as file assets the desktop CSP allows. The desktop shell injects the service connection natively; here an init script plays that part.
 *        Usage: node --experimental-strip-types scripts/objects/music-build-check.mts <evidence-dir> (PORT, default 5207; LUMEN_ASSERT_ROOT, default /tmp/lumen-ms-build; the bundle goes to <root>-dist and is served by vite's preview() with the project config)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { chromium } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertPortFree, assertRoot } from '../sprite/assert-env.ts'
import { listenAudio, seedKit } from '../sprite/music-checks.ts'
import { createHttpService } from '../../../mastra-service/src/server.ts'
import { acquireServiceLock } from '../../../mastra-service/src/deployment/lock.ts'
import { fixtureProvider, textReply } from '../../../mastra-service/tests/provider-fixture.ts'
import { ensureTopic } from '../../../mastra-service/tests/topic-fixture.ts'

const out = process.argv[2]
if (!out) throw new Error('evidence dir required')
mkdirSync(out, { recursive: true })
const UI = fileURLToPath(new URL('../../', import.meta.url))
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const port = process.env.PORT ?? '5207', root = assertRoot('/tmp/lumen-ms-build'), dist = `${root}-dist`
assertPortFree(port)
const results: string[] = []
let failed = 0
const check = (name: string, ok: boolean, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++ }
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-gpu'] })

/* ------------------------------ the bundle ------------------------------ */
rmSync(dist, { recursive: true, force: true })
execFileSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir', '--logLevel', 'warn'], { cwd: UI, stdio: 'inherit' })
const files = (dir: string): string[] => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? files(path) : [path] })
const all = files(dist), text = all.filter(path => /\.(js|css|html)$/.test(path))
const inlined = text.filter(path => readFileSync(path, 'utf8').includes('data:audio'))
const rows = readFileSync(join(UI, 'src/mastra/studio/objects/music/samples/SOURCES.md'), 'utf8').split('\n').filter(line => /^\|\s*[\w-]+\.m4a\s*\|/.test(line)).length
const assets = all.filter(path => path.includes('/assets/') && path.endsWith('.m4a'))
check('构建：所有 .js/.css/.html 不含 data:audio', inlined.length === 0, inlined.join(' '))
check('构建：dist/assets 下样本文件数 = SOURCES.md 行数', assets.length === rows && rows > 0, `${assets.length} / ${rows}`)
const bytes = assets.reduce((sum, path) => sum + statSync(path).size, 0)
check('构建：样本合计 ≤ 2 MB', bytes <= 2 * 1024 * 1024, `${(bytes / 1024 / 1024).toFixed(2)} MB`)

/* ------------------------------ the preview under the desktop CSP ------------------------------ */
const csp = JSON.parse(readFileSync(join(UI, 'src-tauri/tauri.conf.json'), 'utf8')).app.security.csp as string
const { preview } = await import('vite')
const server = await preview({ root: UI, configFile: join(UI, 'vite.config.ts'), logLevel: 'warn', build: { outDir: dist }, preview: { host: '127.0.0.1', port: Number(port), strictPort: true, headers: { 'Content-Security-Policy': csp } } })
const origin = `http://127.0.0.1:${port}`
const header = (await fetch(origin)).headers.get('content-security-policy')
check('预览：响应头带 tauri.conf.json 的 CSP', header === csp)

rmSync(root, { recursive: true, force: true })
mkdirSync(root, { recursive: true, mode: 0o700 })
const lock = acquireServiceLock(root)
const model = fixtureProvider(() => textReply('好'))
const service = await createHttpService({ dataRoot: root, token: lock.identity, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: model.fetch }, allowedOrigins: [origin] })
const { serve } = await import('@hono/node-server')
const network = serve({ hostname: '127.0.0.1', port: 0, fetch: request => service.app.fetch(request) })
if (!network.listening) await new Promise(resolve => network.once('listening', resolve))
ensureTopic({ studio: service.application.studio }, 'blank', '空的主题')
const connection = { baseUrl: `http://127.0.0.1:${(network.address() as { port: number }).port}`, token: lock.identity }

try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const errors: string[] = [], recordings: { name: string; status: number }[] = []
  page.on('pageerror', error => errors.push(error.message))
  const known: string[] = []
  page.on('console', message => {
    if (message.type() !== 'error' && !/Content Security Policy/i.test(message.text())) return
    const line = `${message.text()} @ ${message.location()?.url ?? ''}`
    if (line.endsWith('/favicon.ico') || line.includes("'frame-ancestors' is ignored when delivered via a <meta> element")) known.push(line)
    else errors.push(line)
  })
  page.on('response', response => { const name = response.url().match(/\/assets\/([\w-]+?)-[\w-]{8}\.m4a/)?.[1]; if (name) recordings.push({ name, status: response.status() }) })
  await page.addInitScript(value => { (window as unknown as { __LUMEN_MASTRA__: unknown }).__LUMEN_MASTRA__ = value; localStorage.setItem('lumen.studio.topic', 'blank'); localStorage.setItem('lumen:locale.v1', JSON.stringify({ version: 1, locale: 'zh' })) }, connection)
  await page.addInitScript(() => {
    const seen: string[] = []
    Object.defineProperty(window, '__csp', { value: seen })
    document.addEventListener('securitypolicyviolation', event => seen.push(`${event.violatedDirective} ${event.blockedURI}`))
  })
  await page.addInitScript(seedKit, ['music', true, false])
  await page.addInitScript(listenAudio)
  await page.goto(origin)
  await page.waitForSelector('.reading-typewriter svg.mu-piano', { timeout: 20000 })
  await page.mouse.move(4, 450); await page.mouse.down(); await page.mouse.up(); await sleep(2000)
  await page.hover('.reading-typewriter'); await sleep(1500)
  const heard = await page.evaluate(() => ({ contexts: (window as any).__audio.contexts, sources: (window as any).__audio.sources.length, csp: (window as any).__csp }))
  check('预览：录音以文件资源加载且全部 200', recordings.length > 0 && recordings.every(r => r.status === 200), `${recordings.length} 个：${recordings.filter(r => r.status !== 200).map(r => `${r.name} ${r.status}`).join(' ')}`)
  check('预览：解锁后悬停钢琴有声（起了声音节点）', heard.contexts === 1 && heard.sources > 0, JSON.stringify({ contexts: heard.contexts, sources: heard.sources }))
  check('预览：无 CSP 违规', heard.csp.length === 0, heard.csp.join(' | '))
  check('预览：无控制台错误（预览服务器的 favicon 404 与 web 版 meta CSP 的 frame-ancestors 提示另列）', errors.length === 0, errors.slice(0, 3).join(' | '))
  results.push(`INFO 另列的已知行：${[...new Set(known)].join(' | ')}`)
  await page.screenshot({ path: `${out}/preview-csp.png` })
} finally {
  await browser.close()
  network.close()
  await service.close()
  lock.release()
  await server.close()
}

writeFileSync(`${out}/build-check.txt`, results.join('\n') + '\n')
console.log(results.join('\n'))
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
