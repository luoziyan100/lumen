/**
 * [INPUT]: a Playwright page on the studio with a topic picked, the locale's six view labels; the Kumo-styled tooltip popup (`.kumo-tooltip-popup`, drawn by components/Tips.tsx from the tab's title)
 * [OUTPUT]: compactNav (narrows the window until ViewNav shows icons only), tipChecks (V6: per tab, by hover and by keyboard Tab, how long the label takes to show,
 *           whether it sits under the tab, inside the window, and is the topmost thing at its centre, plus whether it ever overlapped the sprite)
 * [POS]: shared by ui-assert-objects.mts's Chromium and WebKit passes so both browsers run the same measurement. Times run from just before the input
 *        to the first frame the popup holds the label, measured inside the page, so the driver's round trip only makes them longer, never shorter
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
type Page = any                                                 // playwright-core ships no types to this script
const TABS = '.studio-views:not(.studio-views-ghost) [role=tab]'

/** Narrow the window step by step until the navigation is icon-only; returns the width used */
export async function compactNav(page: Page, height: number) {
  for (const width of [1100, 1000, 920, 860, 800]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(300)
    if (await page.$('.studio-views.is-compact:not(.studio-views-ghost)')) return width
  }
  throw new Error('the navigation never went icon-only')
}

/** Put the sprite right under the navigation's centre, where the tooltips open, so "above the sprite" is tested, not assumed */
export async function spriteUnderNav(page: Page) {
  const at = await page.evaluate(selector => { const tabs = [...document.querySelectorAll(selector)].map(node => node.getBoundingClientRect()); return { x: (tabs[0]!.left + tabs.at(-1)!.right) / 2, y: tabs[0]!.bottom } }, TABS)
  await page.evaluate(({ x, y }) => localStorage.setItem('lumen.studio.sprite', JSON.stringify({ open: false, docked: false, anchor: { h: 'left', dx: Math.round(x - 30), v: 'top', dy: Math.round(y + 4) }, w: 420, h: 560 })), at)
}

export interface Tip { label: string; via: 'hover' | 'focus'; ms: number; under: boolean; inside: boolean; topmost: boolean; overSprite: boolean }

/** The label's popup: appeared (ms since `since`), and its geometry against the tab, the window and the sprite */
async function measure(page: Page, index: number, label: string, since: number) {
  return page.evaluate(async ({ selector, index, label, since }) => {
    const tab = document.querySelectorAll(selector)[index]!
    const shown = () => [...document.querySelectorAll('.kumo-tooltip-popup')].find(node => node.textContent === label && node.getBoundingClientRect().width > 0)
    let popup = shown()
    while (!popup && performance.now() - since < 1500) { await new Promise(resolve => requestAnimationFrame(resolve)); popup = shown() }
    const ms = Math.round(performance.now() - since)
    if (!popup) return null
    await new Promise(resolve => setTimeout(resolve, 250))              // the 150ms scale-in finishes before the box is measured
    const p = popup.getBoundingClientRect(), t = tab.getBoundingClientRect(), orb = document.querySelector('.sprite-orb')?.getBoundingClientRect()
    // Tips' layer passes the pointer through (pointer-events: none); hit-testing is switched on for this one probe so it measures what is drawn on top
    const layer = popup.closest<HTMLElement>('.lumen-tip')
    if (layer) layer.style.pointerEvents = 'auto'
    const top = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2)
    if (layer) layer.style.pointerEvents = ''
    return { ms, under: p.top >= t.bottom && p.left < t.right && p.right > t.left, inside: p.left >= 0 && p.top >= 0 && p.right <= innerWidth && p.bottom <= innerHeight,
      topmost: !!top && popup.contains(top), overSprite: !!orb && !(orb.right <= p.left || p.right <= orb.left || orb.bottom <= p.top || p.bottom <= orb.top) }
  }, { selector: TABS, index, label, since })
}

const now = (page: Page) => page.evaluate(() => performance.now())
const closed = async (page: Page) => { await page.mouse.move(2, 2); await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); await page.waitForTimeout(700) }

/** Every tab by hover, then every tab by keyboard (`key`: Tab, or Alt+Tab where the browser moves focus to buttons only with Option) */
export async function tipChecks(page: Page, labels: string[], key = 'Tab'): Promise<(Tip | { label: string; via: string; missing: true })[]> {
  const tips: (Tip | { label: string; via: string; missing: true })[] = []
  for (const [index, label] of labels.entries()) {
    await closed(page)
    const box = await page.locator(TABS).nth(index).boundingBox()
    const since = await now(page)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const tip = await measure(page, index, label, since)
    tips.push(tip ? { label, via: 'hover', ...tip } : { label, via: 'hover', missing: true })
  }
  await closed(page)
  // Reach the first tab the way a person does: Tab from the page until it has focus
  for (let i = 0; i < 60 && !(await page.evaluate(selector => document.activeElement === document.querySelector(selector), TABS)); i++) await page.keyboard.press(key)
  for (const [index, label] of labels.entries()) {
    if (index > 0) {
      const since = await now(page)
      await page.keyboard.press(key)
      const tip = await measure(page, index, label, since)
      tips.push(tip ? { label, via: 'focus', ...tip } : { label, via: 'focus', missing: true })
      continue
    }
    // The first tab already holds focus: blur and refocus it by Shift+Tab then Tab, so its popup opens from closed as well
    await page.keyboard.press(key.replace('Tab', 'Shift+Tab')); await page.waitForTimeout(700)
    const since = await now(page)
    await page.keyboard.press(key)
    const focused = await page.evaluate(selector => document.activeElement === document.querySelector(selector), TABS)
    const tip = focused ? await measure(page, 0, label, since) : null
    tips.push(tip ? { label, via: 'focus', ...tip } : { label, via: 'focus', missing: true })
  }
  return tips
}
