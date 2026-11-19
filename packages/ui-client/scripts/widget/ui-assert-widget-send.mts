/**
 * [INPUT]: the tests' tsx loader, playwright-core from /tmp/lumen-s0-pw (outside the repo, like the other browser assertions), the installed Chromium and WebKit, the real receiver document (buildReceiverSrcdoc)
 * [OUTPUT]: a command-line check, `node --experimental-strip-types scripts/widget/ui-assert-widget-send.mts`: in both engines a widget's __widgetSendMessage reaches the host only
 *           right after a trusted click or key press inside the widget; a call on load, on a timer, after a synthetic click, or after the window has passed sends nothing. Exit 1 on any failure
 * [POS]: the browser evidence for the receiver's send gate; jsdom cannot make a trusted event, so this is the only place the positive case is proven. Nothing here ships
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { register } from 'node:module'
import { chromium, webkit } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'

// receiver.ts imports its siblings without extensions, as Vite does; the tests' loader resolves them
register('../../tests/helpers/tsx-loader.mjs', import.meta.url)
const { buildReceiverSrcdoc, SEND_WINDOW_MS, WIDGET_SEND } = await import('../../src/components/widget/receiver.ts')

let failed = 0
function check(engine: string, name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine} · ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

// The receiver posts to `parent`; a top-level page is its own parent, so the page hears its own WIDGET_SEND messages
const page = buildReceiverSrcdoc('', false)

// The same Chromium build the other assertions launch; WebKit is playwright-core's own
const chrome = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

for (const engine of ['chromium', 'webkit'] as const) {
  const browser = engine === 'chromium' ? await chromium.launch({ executablePath: chrome, args: ['--disable-gpu'] }) : await webkit.launch()
  // The widget's own script stands in for what the AI writes; evaluate is a script too, so a call from it is exactly an untrusted call
  const context = await browser.newContext({ bypassCSP: true })
  const tab = await context.newPage()
  await tab.setContent(page)
  await tab.evaluate(([kind]) => {
    const sent: string[] = []
    ;(window as unknown as { __sent: string[] }).__sent = sent
    window.addEventListener('message', event => { if (event.data?.type === kind) sent.push(event.data.text) })
    const button = document.createElement('button')
    button.id = 'guess'; button.textContent = 'B'; button.style.cssText = 'position:fixed;left:20px;top:20px;width:80px;height:40px'
    button.addEventListener('click', () => (window as unknown as { __widgetSendMessage: (t: string) => void }).__widgetSendMessage('我猜 B'))
    document.body.append(button)
    const input = document.createElement('input')
    input.id = 'param'; input.style.cssText = 'position:fixed;left:20px;top:80px'
    input.addEventListener('keydown', event => { if (event.key === 'Enter') (window as unknown as { __widgetSendMessage: (t: string) => void }).__widgetSendMessage('参数 3') })
    document.body.append(input)
  }, [WIDGET_SEND])
  const sent = () => tab.evaluate(() => [...(window as unknown as { __sent: string[] }).__sent])
  const settle = () => tab.waitForTimeout(150)

  await tab.evaluate(() => (window as unknown as { __widgetSendMessage: (t: string) => void }).__widgetSendMessage('脚本自己说的'))
  await tab.evaluate(() => setTimeout(() => (window as unknown as { __widgetSendMessage: (t: string) => void }).__widgetSendMessage('定时器说的'), 10))
  await settle()
  check(engine, 'a call on load or on a timer sends nothing', (await sent()).length === 0, JSON.stringify(await sent()))

  await tab.evaluate(() => document.getElementById('guess')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await tab.evaluate(() => document.getElementById('guess')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
  await tab.evaluate(() => document.getElementById('guess')!.click())
  await settle()
  check(engine, 'a synthetic click sends nothing', (await sent()).length === 0, JSON.stringify(await sent()))

  await tab.click('#guess')
  await settle()
  check(engine, 'a real click sends', JSON.stringify(await sent()) === JSON.stringify(['我猜 B']), JSON.stringify(await sent()))

  await tab.click('#param')
  await tab.keyboard.press('Enter')
  await settle()
  check(engine, 'a real key press sends', (await sent()).at(-1) === '参数 3', JSON.stringify(await sent()))

  // After the window passes, the earlier touch no longer speaks for the person
  await tab.waitForTimeout(SEND_WINDOW_MS + 300)
  const before = (await sent()).length
  await tab.evaluate(() => (window as unknown as { __widgetSendMessage: (t: string) => void }).__widgetSendMessage('过期以后'))
  await settle()
  check(engine, `a call ${SEND_WINDOW_MS}ms after the last touch sends nothing`, (await sent()).length === before, JSON.stringify(await sent()))

  await browser.close()
}

console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
