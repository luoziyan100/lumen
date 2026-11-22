/**
 * [INPUT]: the studio page helpers of ui-assert-objects.mts (open, pick, view, check, sleep, the locale catalogs, the seeded topic titles); window.__audio from listenAudio and pixelDiff of
 *          ./music-checks.ts; MUSIC_SCORES of objects/music/index.ts and slotSamples of objects/music/sampler.ts (which recordings each object plays)
 * [OUTPUT]: soundChecks(ctx) (the live sound of the music kit in Chromium), headChecks(ctx) (the header speaker button: kit, sync with Settings, title, no overlap and a centred navigation)
 * [POS]: the music kit's R4 browser checks, called by ui-assert-objects.mts under KIT=music; kept apart so that script stays one flow under its size limit. Sound is read from what the page
 *        schedules (every recording source and its start, heard time and stop, every gain ramp to 0), never from a speaker; onset and pitch of the recordings are measured offline by
 *        scripts/objects/music-audio.mts. Checks: off → no recording requested and no AudioContext; on at start → nothing before the first pointerdown, then the recordings of the objects
 *        in view, each once; on in the session (the header button) → a hover within 500 ms sounds its first pass; a missing recording → no page error, one console line, that object
 *        silent and the others not; leaving fades every source within 80 ms; the harp's sound over three passes keeps within 20 ms of its animation, nothing starts in a rest and the
 *        picture holds still; reduced motion starts nothing
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { MUSIC_SCORES } from '../../src/mastra/studio/objects/music/index.ts'
import { slotSamples } from '../../src/mastra/studio/objects/music/sampler.ts'
import { sampleFor } from '../../src/mastra/studio/objects/music/samples.ts'
import { KITS, pixelDiff } from './music-checks.ts'

type Audio = { contexts: number; sources: { when: number; now: number; perf: number; stop: number }[]; ramps: { end: number; now: number }[] }
export interface Ctx {
  open: (browser, options: Record<string, unknown>) => Promise<{ context; page; errors: string[] }>
  pick: (page, title: string) => Promise<void>
  view: (page, S, name: string) => Promise<void>
  check: (name: string, ok: boolean, detail?: string) => void
  sleep: (ms: number) => Promise<void>
  catalogs: Record<'zh' | 'en', any>
  browser: unknown
  out: string
  BLANK: string
  READ: string
}

const audio = (page): Promise<Audio> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __audio: Audio }).__audio)))
const now = page => page.evaluate(() => (window as unknown as { __audio: { ac: AudioContext | null } }).__audio.ac?.currentTime ?? 0)
const TOPIC_KEY = 'lumen.studio.topic'
const name = (url: string) => url.match(/\/samples\/([\w-]+)\.m4a/)?.[1] ?? ''
const requests = page => {
  const seen: string[] = []
  page.on('request', request => { const n = name(request.url()); if (n) seen.push(n) })
  return seen
}
const sorted = (list: string[]) => [...list].sort().join(' ')
const visible = (...slots: string[]) => [...new Set(slots.flatMap(slot => slotSamples(slot as never)))]
/** The slots whose music object is on screen now */
const onScreen = page => page.evaluate(kit => Object.entries(kit).filter(([, svg]) => [...document.querySelectorAll(`svg.${svg}`)].some(node => {
  const r = node.getBoundingClientRect()
  return r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
})).map(([slot]) => slot), KITS.music)
/** Unlock the page with a pointerdown on an empty spot of the canvas between the panels */
const gesture = async page => { await page.mouse.move(4, 450); await page.mouse.down(); await page.mouse.up() }

export async function soundChecks(c: Ctx) {
  const { open, pick, check, sleep, BLANK } = c, browser = c.browser
  const piano = '.reading-typewriter', cello = '.materials-cabinet'

  {
    const { context, page, errors } = await open(browser, { locale: 'zh', w: 1440, h: 900, sounds: false })
    const asked = requests(page)
    await pick(page, BLANK); await page.waitForSelector(`${piano} svg.mu-piano`)
    for (const host of [piano, cello]) { await page.hover(host); await sleep(700); await page.click(host); await sleep(500); await page.click(host) }
    const heard = await audio(page)
    check('声音关：悬停与点击钢琴、大提琴，0 个录音请求、0 个 AudioContext', asked.length === 0 && heard.contexts === 0, JSON.stringify({ asked: asked.length, contexts: heard.contexts }))
    check('声音关：无控制台错误', errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  }

  {
    const { context, page, errors } = await open(browser, { locale: 'zh', w: 1440, h: 900, sounds: true })
    const asked = requests(page)
    await page.evaluate(([key, id]) => localStorage.setItem(key, id), [TOPIC_KEY, 'blank']); await page.reload()
    await page.waitForSelector(`${piano} svg.mu-piano`)
    await page.hover(piano); await sleep(1200)
    const before = await audio(page)
    check('重启后开关为开：第一次 pointerdown 之前悬停钢琴，0 个 AudioContext、0 个录音请求', before.contexts === 0 && asked.length === 0, JSON.stringify({ contexts: before.contexts, asked: asked.length }))
    await gesture(page); await sleep(1500)
    const slots = await onScreen(page), after = await audio(page), wanted = visible(...slots)
    check('第一次 pointerdown 解锁：建 1 个 AudioContext', after.contexts === 1, String(after.contexts))
    check(`解锁后只加载屏上物件（${slots.join('、')}）的录音，各一次`, slots.length > 0 && sorted(asked) === sorted(wanted), `${asked.length} / ${wanted.length}: ${sorted(asked.filter(n => !wanted.includes(n)))}`)
    check('解锁前的悬停不补放', after.sources.length === 0, String(after.sources.length))
    const earlier = [...asked], harp = visible('map')
    await c.view(page, c.catalogs.zh.studio, 'map'); await page.waitForSelector('.studio-later-object svg.mu-harp'); await sleep(1500)
    check('切到概念图：竖琴的录音此前未请求，可见后才加载，每个只请求一次', harp.every(n => !earlier.includes(n) && asked.includes(n)) && new Set(asked).size === asked.length, `${earlier.length} → ${asked.length}, harp ${harp.length}`)
    check('重启后为开：无控制台错误', errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  }

  {
    const { context, page, errors } = await open(browser, { locale: 'zh', w: 1440, h: 900, sounds: false })
    await pick(page, BLANK); await page.waitForSelector(`${piano} svg.mu-piano`)
    await page.click('.studio-center-head .head-sound')
    const since = Date.now()
    await page.hover(piano)
    const late = Date.now() - since
    await sleep(1200)
    const heard = await audio(page)
    check('会话中打开（头部喇叭）后 500ms 内悬停钢琴，第一遍就有声', late <= 500 && heard.sources.length >= 1, JSON.stringify({ late, started: heard.sources.length }))
    const leave = await now(page)
    await page.mouse.move(4, 450); await sleep(400)
    const faded = await audio(page), worst = Math.max(0, ...faded.sources.map(s => s.stop - leave))
    check('鼠标离开：每个已开始与已排定的声音 80ms 内淡出（停止 ≤ 离开 + 80ms 淡出 + 10ms 尾 + 20ms 读数余量）', faded.sources.length > 0 && worst <= .11 && faded.ramps.some(r => r.now >= leave - .01 && r.end - leave <= .1), `${(worst * 1000).toFixed(0)} ms over ${faded.sources.length}`)
    check('会话中打开：无控制台错误', errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  }

  {
    const { context, page, errors } = await open(browser, { locale: 'zh', w: 1440, h: 900, sounds: true })
    const lost = sampleFor(MUSIC_SCORES.reading.loops.find(loop => loop.when.hover)!.cues[0]!).name
    await page.route(url => url.pathname.endsWith(`/samples/${lost}.m4a`), route => route.fulfill({ status: 404, body: '' }))
    const lines: string[] = []
    page.on('console', message => { if (message.text().startsWith('[music]')) lines.push(message.text()) })
    await pick(page, BLANK); await page.waitForSelector(`${piano} svg.mu-piano`)
    await gesture(page); await sleep(1500)
    const base = (await audio(page)).sources.length
    await page.hover(piano); await sleep(1500)
    const pianoStarts = (await audio(page)).sources.length - base
    await page.mouse.move(4, 450); await sleep(300)
    const mid = (await audio(page)).sources.length
    await page.hover(cello); await sleep(1500)
    const celloStarts = (await audio(page)).sources.length - mid
    const own = errors.filter(error => !error.includes(`/samples/${lost}.m4a`))
    check(`录音 404（${lost}）：无页面错误、恰好 1 行 [music] 控制台提示（浏览器自己的 404 资源行除外）`, own.length === 0 && lines.length === 1, `${lines.length}: ${lines[0] ?? ''} ${own[0] ?? ''}`)
    check('录音 404：用它的钢琴悬停不出声，其他物件（大提琴）照常', pianoStarts === 0 && celloStarts > 0, JSON.stringify({ pianoStarts, celloStarts }))
    await context.close()
  }

  {
    const { context, page, errors } = await open(browser, { locale: 'zh', w: 1440, h: 900, sounds: true })
    const S = c.catalogs.zh.studio
    await pick(page, BLANK); await gesture(page)
    await c.view(page, S, 'map'); await page.waitForSelector('.studio-later-object svg.mu-harp'); await sleep(1500)
    const loop = MUSIC_SCORES.map.loops[0]!, { lead, run, total } = loop.cycle
    const base = (await audio(page)).sources.length
    await page.hover('.studio-later-object')
    await sleep((total * 2 + run / 2 + 1) * 1000)
    const clock = await page.evaluate(([animation, target]) => {
      const a = document.querySelector('.studio-later-object')!.getAnimations({ subtree: true }).find(a => (a as CSSAnimation).animationName === animation && ((a.effect as KeyframeEffect).target as Element).classList.contains(target))
      return a ? { start: Number(a.startTime), delay: Number(a.effect!.getTiming().delay), time: Number(a.currentTime) } : null
    }, [loop.clock.animation, loop.clock.target])
    const starts = (await audio(page)).sources.slice(base).filter(s => !clock || s.perf < clock.start + clock.delay + 3 * total * 1000)
    const expected = clock ? [0, 1, 2].flatMap(k => loop.cues.map(cue => clock.start + clock.delay + (k * total + lead + cue.at) * 1000)) : []
    const offsets = starts.map(s => Math.min(...expected.map(e => Math.abs(s.perf - e))))
    check('竖琴三遍：每个音与动画同拍 ≤20ms，起音个数 = 3 × 每遍 cue 数', !!clock && starts.length === expected.length && Math.max(...offsets) <= 20, `${starts.length}/${expected.length}, worst ${Math.max(0, ...offsets).toFixed(1)} ms`)
    const inRest = clock ? starts.filter(s => { const t = ((s.perf - clock.start - clock.delay) / 1000) % total; return t > lead + run + .02 }) : starts
    check('竖琴歇着时不起新声', inRest.length === 0, String(inRest.length))
    const phase = await page.evaluate(([animation, delay]) => { const a = document.querySelector('.studio-later-object')!.getAnimations({ subtree: true }).find(a => (a as CSSAnimation).animationName === animation)!; return (Number(a.currentTime) - Number(delay)) / 1000 }, [loop.clock.animation, clock?.delay ?? 0]) % total, restAt = lead + run + .6
    await sleep(((restAt - phase + total) % total) * 1000)
    const a = await page.locator('.studio-later-object').screenshot(); await sleep(1500)
    const b = await page.locator('.studio-later-object').screenshot()
    const diff = await pixelDiff(page, a, b)
    check('竖琴歇着时画面静止（歇中相隔 1.5s 两张截图逐像素一致）', diff.size && diff.pixels === 0, JSON.stringify(diff))
    check('竖琴三遍：无控制台错误', errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  }

  {
    const { context, page, errors } = await open(browser, { locale: 'zh', w: 1440, h: 900, sounds: true, reduced: true })
    await pick(page, BLANK); await page.waitForSelector(`${piano} svg.mu-piano`)
    await gesture(page); await sleep(800)
    for (const host of [piano, cello, '.topics-box']) { await page.hover(host); await sleep(900); await page.click(host); await sleep(600); await page.click(host) }
    const heard = await audio(page)
    check('减弱动效：悬停与点击都不起任何声音节点', heard.sources.length === 0, String(heard.sources.length))
    check('减弱动效（声音开）：无控制台错误', errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  }
}

/** Every edge control and the navigation: pairwise apart, the navigation centred on its header within 1 px */
const layout = page => page.evaluate(() => {
  const head = document.querySelector('.studio-board-pane .studio-center-head') ?? document.querySelector('.studio-center-head')
  if (!head) return { error: 'no head' }
  const box = (node: Element | null) => { const r = node?.getBoundingClientRect(); return r && r.width > 0 ? r : null }
  const parts = { nav: box(head.querySelector('.studio-views:not(.studio-views-ghost)')), sound: box(head.querySelector('.head-sound')), right: box(head.querySelector('.pane-toggle[data-pane=right]')), left: box(head.querySelector('.pane-toggle[data-pane=left]')) }
  const shown = Object.entries(parts).filter(([, r]) => r) as [string, DOMRect][]
  const apart = (a: DOMRect, b: DOMRect) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
  const overlaps = shown.flatMap(([n, a], i) => shown.slice(i + 1).filter(([, b]) => !apart(a, b)).map(([m]) => `${n}×${m}`))
  const h = head.getBoundingClientRect(), off = parts.nav ? Math.abs((parts.nav.left + parts.nav.right) / 2 - (h.left + h.right) / 2) : -1
  const last = Math.max(parts.sound?.right ?? -Infinity, parts.right?.right ?? -Infinity), edge = Number.isFinite(last) ? Math.round(h.right - last) : null
  const lead = parts.left ? Math.round(parts.left.left - h.left) : null, order = !parts.right || !parts.sound || parts.sound.right <= parts.right.left
  return { overlaps, off: Math.round(off * 10) / 10, shown: shown.map(([n]) => n).join('+'), edge, lead, order, compact: !!head.querySelector('.studio-views.is-compact') }
})

export async function headChecks(c: Ctx) {
  const { open, pick, check, sleep, READ } = c, browser = c.browser
  {
    const { context, page } = await open(browser, { locale: 'zh', w: 1440, h: 900, kit: 'instruments' })
    await pick(page, READ)
    check('仪器套组：头部没有喇叭', await page.locator('.head-sound').count() === 0)
    await context.close()
  }
  for (const dark of [false, true]) for (const locale of ['zh', 'en'] as const) for (const [w, h] of [[1440, 900], [1280, 800]]) {
    const { context, page, errors } = await open(browser, { locale, w, h, dark, sounds: false })
    const catalog = c.catalogs[locale], S = catalog.studio, tag = `喇叭 ${locale} ${w}×${h} ${dark ? 'dark' : 'light'}`
    await pick(page, READ); await page.waitForSelector('.head-sound')
    const button = page.locator('.studio-center-head .head-sound')
    const state = async () => ({ pressed: await button.getAttribute('aria-pressed'), title: await button.getAttribute('title') })
    await page.mouse.move(4, 450); await sleep(200)
    const off = await state()
    await button.click(); await page.mouse.move(4, 450); await sleep(300)
    const on = await state()
    check(`${tag}：aria-pressed 与 title 随开关（关「${S.sounds.on}」/开「${S.sounds.off}」）`, off.pressed === 'false' && off.title === S.sounds.on && on.pressed === 'true' && on.title === S.sounds.off, JSON.stringify({ off, on }))
    if (!dark && w === 1440) {
      const A = catalog.appearance
      await page.locator('.studio-topics .studio-item', { hasText: S.settings }).click()
      await page.locator('.settings-nav-item', { hasText: catalog.settings.tabs.preference }).click()
      const box = page.locator('label', { hasText: A.instrumentSounds }).locator('input')
      const synced = await box.isChecked()
      await box.click(); await sleep(150)
      await page.locator('.settings-close').click(); await page.waitForSelector('.settings-modal', { state: 'detached' })
      check(`${tag}：头部与设置同一个偏好（头部开 → 设置已勾；设置关 → 头部 aria-pressed=false）`, synced && (await button.getAttribute('aria-pressed')) === 'false', String(synced))
      await button.hover()
      const tip = await page.waitForFunction(text => [...document.querySelectorAll('.kumo-tooltip-popup')].some(node => node.textContent === text && node.getBoundingClientRect().width > 0), S.sounds.on, { timeout: 1500 }).then(() => true, () => false)
      check(`${tag}：悬停喇叭由 Tips 显示「${S.sounds.on}」`, tip)
      await page.mouse.move(4, 450)
    }
    let edge0: number | null = null
    for (const split of [false, true]) {
      if (split) { await page.locator('.material-open').first().click(); await page.waitForSelector('.studio-reader'); await sleep(500) }
      for (const collapsed of [false, true]) {
        if (collapsed) for (const side of ['left', 'right']) await page.locator(`.pane-toggle[data-pane=${side}][aria-expanded=true]`).first().click()
        await sleep(400)
        const at = await layout(page), label = `${split ? '分屏' : '不分屏'}·${collapsed ? '两栏收起' : '两栏展开'}`
        edge0 ??= at.edge
        const flush = at.edge !== null && Math.abs(at.edge - edge0!) <= 1 && at.order && (at.lead === null || Math.abs(at.lead - at.edge) <= 1)
        check(`${tag} ${label}：喇叭、两侧展开钮与导航互不相交，导航居中 ≤1px；尾组（喇叭在前）贴右缘，与左侧展开钮对称`, !('error' in at) && at.overlaps.length === 0 && at.off >= 0 && at.off <= 1 && flush, JSON.stringify(at))
        if (collapsed) for (const side of ['left', 'right']) await page.locator(`.pane-toggle[data-pane=${side}][aria-expanded=false]`).first().click()
      }
    }
    await page.locator(`.studio-reader button[aria-label="${S.reader.close}"]`).click().catch(() => {})
    if (w === 1440) await page.screenshot({ path: `${c.out}/head-sound-${locale}-${dark ? 'dark' : 'light'}.png`, clip: { x: 0, y: 0, width: w, height: 120 } })
    check(`${tag}：无控制台错误`, errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  }
}
