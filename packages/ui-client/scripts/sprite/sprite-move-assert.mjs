/**
 * [INPUT]: 5183 的真实 UI、隔离主题与 Chromium
 * [OUTPUT]: M1–M12 新尺寸回归、P9/P10 外观断言、截图与开合帧序列
 * [POS]: 继承上一任务的浏览器合同，只按60×92包围盒调整横纵几何
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
// lumen-sprite-move 浏览器断言：真实 Chromium 打开 dev 页面（5183，隔离数据根），1440×900 / 1280×800 各跑一遍。
// M1–M12：9 个位置拖放（误差 ≤1px、不打开、光标、刷新后不变、盖在左右栏/顶栏/白板上）→ 每个位置打开（全在视口内、贴着头像那一侧）再收起（回到原位）；
// 宽度在 w 与 1024 之间来回（含一次变矮）始终在视口内、回来恢复；拖浮窗后收起头像在新锚点；打开/收起逐帧采样（≥12 帧、只变 transform/opacity、
// 包围盒单调、原点在头像中心 ±2px、内部布局首帧即终态、无 >50ms 长任务）；中途反向点击只一层、不跳帧；层级（设置弹窗、下拉菜单、外链确认框盖住头像；
// 头像盖住沉浸阅读）；停靠/取消停靠；减弱动效（只淡 120ms）；复核 R1：真实 pointercancel（CDP 触摸取消）后 Enter/Space 照常打开、鼠标拖完紧随的 click 被吞。另出截图、帧序列 GIF 与录像。
// 用法：node sprite-move-assert.mjs <evidence-dir>
import { auditNaming } from './naming.mjs'
import { chromium } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const [out] = process.argv.slice(2)
const port = process.env.PORT ?? '5183', base = `http://localhost:${port}/`
const topicTitle = '自注意力为什么能取代循环'
const SPRITE_W = 60, SPRITE_H = 92, EDGE = 8, HALF = SPRITE_W / 2, HALF_H = SPRITE_H / 2
const sizes = [[1440, 900], [1280, 800]]
const SKINS = { clear: { version: 1, mode: 'light', skinId: 'yan-clear' }, dark: { version: 1, mode: 'dark', skinId: 'yan-clear' } }
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: exe })
const results = []
let failed = 0
const check = (name, ok, detail) => { const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`; results.push(line); if (process.env.TRACE) console.error(line); if (!ok) failed++ }
check('N0 源码及构建产物命名', auditNaming().length === 0)
const info = text => results.push(`INFO ${text}`)
const near = (a, b, d = 1) => Math.abs(a - b) <= d
const round = v => Math.round(v * 100) / 100

// ---- 页面内工具：长任务观察、逐帧采样 ----
const initScript = skin => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.removeItem('lumen.studio.sprite'); localStorage.removeItem('lumen.studio.panes'); localStorage.removeItem('lumen:trustedLinkHosts')
    if (skin) localStorage.setItem('lumen:appearance.v2', JSON.stringify(skin))
    sessionStorage.setItem('seeded', '1')
  }
  window.__long = []
  new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__long.push({ start: entry.startTime, duration: entry.duration }) }).observe({ type: 'longtask', buffered: true })
  /** 每帧记一次：浮窗与头像的 transform/opacity/原点/包围盒/布局盒、除 transform/opacity 外的全部计算样式是否变化、浮窗内部布局签名、动画列表 */
  window.__sample = ms => new Promise(resolve => {
    const frames = [], t0 = performance.now()
    let baseline = null
    const snapshot = style => { const all = {}; for (let i = 0; i < style.length; i++) all[style[i]] = style.getPropertyValue(style[i]); return all }
    const anims = el => el.getAnimations().map(a => ({ d: a.effect.getTiming().duration, e: a.effect.getTiming().easing, t: a.currentTime, rate: a.playbackRate, state: a.playState }))
    const step = () => {
      const now = performance.now(), wins = document.querySelectorAll('.sprite-floating'), win = wins[0], orb = document.querySelector('.sprite-orb')
      const frame = { t: now - t0, abs: now, wins: wins.length, orbs: document.querySelectorAll('.sprite-orb').length }
      if (win) {
        const style = getComputedStyle(win), rect = win.getBoundingClientRect()
        if (!baseline) baseline = snapshot(style)
        const changed = []
        for (const key of Object.keys(baseline)) if (key !== 'transform' && key !== 'opacity' && style.getPropertyValue(key) !== baseline[key]) changed.push(key)
        frame.win = { phase: win.dataset.phase, transform: style.transform, opacity: Number(style.opacity), origin: style.transformOrigin, rect: { l: rect.left, t: rect.top, w: rect.width, h: rect.height },
          layout: [win.offsetLeft, win.offsetTop, win.offsetWidth, win.offsetHeight], inner: [...win.querySelectorAll('*')].slice(0, 600).map(el => `${el.offsetLeft},${el.offsetTop},${el.offsetWidth},${el.offsetHeight}`).join(';'),
          changed, inert: style.getPropertyValue('interactivity'), anims: anims(win) }
      }
      if (orb) { const style = getComputedStyle(orb); frame.orb = { phase: orb.dataset.phase, transform: style.transform, opacity: Number(style.opacity), x: parseFloat(orb.style.left), y: parseFloat(orb.style.top), anims: anims(orb) } }
      frames.push(frame)
      if (now - t0 < ms) requestAnimationFrame(step); else resolve({ t0, frames, long: window.__long.filter(task => task.start + task.duration >= t0 && task.start <= now) })
    }
    requestAnimationFrame(step)
  })
}

const orbState = page => page.evaluate(() => {
  const orb = document.querySelector('.sprite-orb'), rect = orb?.getBoundingClientRect()
  return { orb: orb ? { x: rect.left, y: rect.top, w: rect.width, phase: orb.dataset.phase, transform: orb.style.transform } : null,
    open: !!document.querySelector('.sprite-floating, .sprite-docked'), stored: localStorage.getItem('lumen.studio.sprite'), vw: innerWidth, vh: innerHeight }
})
const winBox = page => page.evaluate(() => { const win = document.querySelector('.sprite-floating'); if (!win) return null; const r = win.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, phase: win.dataset.phase, transform: win.style.transform } })
/** 头像中心点上叠着谁：最上层是不是头像、头像下面是哪块区域 */
const stackAt = (page, x, y) => page.evaluate(([x, y]) => {
  const list = document.elementsFromPoint(x, y), orbIndex = list.findIndex(el => el.closest('.sprite-orb'))
  const below = list.find(el => !el.closest('.sprite-orb'))
  const region = !below ? null : below.closest('.studio-head') ? '顶栏' : below.closest('.studio-topics') ? '左栏' : below.closest('.studio-materials') ? '右栏' : below.closest('.studio-reader') ? '阅读器' : below.closest('.studio-board-pane') ? '白板' : below.closest('.studio-center') ? '中栏' : below.className || below.tagName
  const top = list[0]
  return { orbIndex, region, top: top ? `${top.tagName.toLowerCase()}.${String(top.className).split(' ')[0]}` : null, topInOrb: !!top?.closest('.sprite-orb'),
    topDialog: !!top?.closest('[role="dialog"], [role="alertdialog"]'), topListbox: !!top?.closest('[role="listbox"], [role="menu"]'),
    orbZ: (() => { const orb = document.querySelector('.sprite-orb'); return orb ? getComputedStyle(orb).zIndex : null })(), topZ: (() => { let el = top; while (el && getComputedStyle(el).zIndex === 'auto') el = el.parentElement; return el ? `${getComputedStyle(el).zIndex}@${String(el.className).split(' ')[0] || el.tagName}` : null })() }
}, [x, y])

async function dragOrb(page, tx, ty, steps = 14) {
  const before = (await orbState(page)).orb
  const cx = before.x + HALF, cy = before.y + HALF_H
  await page.mouse.move(cx, cy); await page.waitForTimeout(60)
  const hover = await page.evaluate(() => getComputedStyle(document.querySelector('.sprite-orb')).cursor)
  await page.mouse.down(); await page.mouse.move(tx, ty, { steps })
  const during = await page.evaluate(() => { const orb = document.querySelector('.sprite-orb'); return { cursor: getComputedStyle(orb).cursor, dragging: orb.classList.contains('is-dragging'), left: orb.style.left, top: orb.style.top } })
  await page.mouse.up(); await page.waitForTimeout(250)
  return { before, hover, during, after: await orbState(page) }
}
async function openSprite(page) {
  const { orb } = await orbState(page)
  await page.mouse.click(orb.x + HALF, orb.y + HALF_H)
  await page.waitForSelector('.sprite-floating[data-phase="open"]', { timeout: 5000 })
  await page.waitForTimeout(150)
  return orb
}
async function collapseSprite(page) {
  const button = page.locator('.sprite-floating button[aria-label="收回成球"]')
  await button.click()
  await page.waitForSelector('.sprite-orb[data-phase="closed"]', { timeout: 5000 })
  await page.waitForFunction(() => !document.querySelector('.sprite-floating'))
  await page.waitForTimeout(150)
}
/** 浮窗在视口内（四边 8px），并且贴着头像那一侧（象限决定；放不下时夹在 8px 且仍盖住头像） */
function attached(win, orb, vw, vh) {
  const right = orb.x + HALF > vw / 2, bottom = orb.y + HALF_H > vh / 2
  const inView = win.l >= EDGE - 0.5 && win.t >= EDGE - 0.5 && win.r <= vw - EDGE + 0.5 && win.b <= vh - EDGE + 0.5
  const hOk = right ? near(win.r, orb.x + SPRITE_W) : near(win.l, orb.x)
  const vOk = bottom ? near(win.b, orb.y + SPRITE_H) || (near(win.t, EDGE) && win.b >= orb.y + SPRITE_H - 0.5) : near(win.t, orb.y) || (near(win.b, vh - EDGE) && win.t <= orb.y + 0.5)
  return { ok: inView && hOk && vOk, inView, hOk, vOk, side: `${right ? '右' : '左'}${bottom ? '下' : '上'}` }
}
/** 与 sprite-place.orbPoint 同一换算：存的锚点 → 当前视口里的头像左上角 */
function expectedOrb(stored, vw, vh) {
  const a = JSON.parse(stored).anchor
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi))
  return { x: clamp(a.h === 'left' ? a.dx : vw - a.dx - SPRITE_W, EDGE, vw - EDGE - SPRITE_W), y: clamp(a.v === 'top' ? a.dy : vh - a.dy - SPRITE_H, EDGE, vh - EDGE - SPRITE_H) }
}

/** 逐帧采样一段开合：trigger 在采样开始后执行；返回帧与长任务 */
async function sampleRun(page, trigger, ms = 700) {
  await page.evaluate(ms => { window.__run = window.__sample(ms) }, ms)
  await page.waitForTimeout(40)
  await trigger()
  return page.evaluate(() => window.__run)
}
const scaleOf = frame => frame.win.rect.w / frame.win.layout[2]
function assertMotion(tag, run, dir, orbBox, { reduced = false } = {}) {
  const phase = dir === 'open' ? 'opening' : 'closing'
  const anim = run.frames.filter(f => f.win?.phase === phase)
  const settled = run.frames.find(f => f.win?.phase === 'open') ?? null
  const span = anim.length ? round(anim.at(-1).t - anim[0].t) : 0
  const want = reduced ? 120 : dir === 'open' ? 260 : 200
  const timing = anim.find(f => f.win.anims.length)?.win.anims[0]
  check(`${tag} 动画参数：${want}ms ${reduced ? 'linear' : dir === 'open' ? 'cubic-bezier(0.2, 0.8, 0.2, 1)' : '缓入'}`, timing && timing.d === want && (reduced ? timing.e === 'linear' : dir === 'open' ? timing.e === 'cubic-bezier(0.2, 0.8, 0.2, 1)' : timing.e === 'cubic-bezier(0.4, 0, 1, 1)'), JSON.stringify(timing))
  if (!reduced) check(`${tag} 采样 ≥12 帧`, anim.length >= 12, `${anim.length} 帧，跨 ${span}ms`)
  else info(`${tag} 采样 ${anim.length} 帧，跨 ${span}ms`)
  // interactivity 是 HTML inert 属性的计算值（收起中浮窗 inert，点击才能穿到底下的头像上倒放）：只在换阶段时变一次、整段恒定，不参与布局与绘制
  const changed = [...new Set(anim.flatMap(f => f.win.changed))].filter(key => key !== 'interactivity')
  const inertValues = new Set(anim.map(f => f.win.inert))
  check(`${tag} 浮窗只有 transform/opacity 在变（inert 的 interactivity 整段恒定：${[...inertValues]}）`, anim.length > 0 && !changed.length && inertValues.size === 1, changed.join(' '))
  const finalLayout = (dir === 'open' ? settled : anim[0])?.win
  check(`${tag} 布局盒逐帧不变（不改 left/top/宽高）`, !!finalLayout && anim.every(f => f.win.layout.join() === finalLayout.layout.join()), finalLayout?.layout.join())
  check(`${tag} 内部布局（消息列表等 ${finalLayout?.inner.split(';').length} 个节点）首帧即终态、中途不重排`, !!finalLayout && anim.every(f => f.win.inner === finalLayout.inner), '')
  const orbTransforms = [...new Set(anim.map(f => f.orb?.transform).filter(Boolean))]
  if (reduced) {
    check(`${tag} 减弱动效：浮窗与头像都不缩放`, anim.every(f => f.win.transform === 'none') && orbTransforms.every(t => t === 'none'), `${[...new Set(anim.map(f => f.win.transform))]} / ${orbTransforms}`)
  } else {
    const scales = anim.map(scaleOf), widths = anim.map(f => f.win.rect.w), heights = anim.map(f => f.win.rect.h)
    const mono = list => list.every((v, i) => i === 0 || (dir === 'open' ? v >= list[i - 1] - 0.01 : v <= list[i - 1] + 0.01))
    check(`${tag} 包围盒单调${dir === 'open' ? '变大' : '变小'}（宽、高）`, mono(widths) && mono(heights), `scale ${round(scales[0])}→${round(scales.at(-1))}`)
    const centre = { x: orbBox.x + HALF, y: orbBox.y + HALF_H }
    const origins = anim.map(f => { const [ox, oy] = f.win.origin.split(' ').map(parseFloat); return { x: f.win.layout[0] + ox, y: f.win.layout[1] + oy } })
    const worst = Math.max(...origins.map(o => Math.max(Math.abs(o.x - centre.x), Math.abs(o.y - centre.y))))
    // 从包围盒反推实际缩放中心：rect.l = o + s·(L − o)
    const implied = anim.filter(f => scaleOf(f) < 0.9).map(f => { const s = scaleOf(f); return { x: (f.win.rect.l - s * f.win.layout[0]) / (1 - s), y: (f.win.rect.t - s * f.win.layout[1]) / (1 - s) } })
    const worstImplied = implied.length ? Math.max(...implied.map(o => Math.max(Math.abs(o.x - centre.x), Math.abs(o.y - centre.y)))) : null
    check(`${tag} transform-origin 在头像中心 ±2px（含按包围盒反推的缩放中心）`, worst <= 2 && (worstImplied === null || worstImplied <= 2), `设定偏差 ${round(worst)}px，反推偏差 ${worstImplied === null ? '无' : round(worstImplied)}px（${implied.length} 帧）`)
  }
  const orbOps = anim.map(f => f.orb?.opacity).filter(v => v !== undefined)
  check(`${tag} 头像同时${dir === 'open' ? '淡出' : '淡入'}`, orbOps.length >= 2 && orbOps.every((v, i) => i === 0 || (dir === 'open' ? v <= orbOps[i - 1] + 1e-3 : v >= orbOps[i - 1] - 1e-3)) && (dir === 'open' ? orbOps.at(-1) < orbOps[0] : orbOps.at(-1) > orbOps[0]), `${round(orbOps[0])}→${round(orbOps.at(-1))}`)
  check(`${tag} 全程只有一层浮窗`, run.frames.every(f => f.wins <= 1 && (!f.win || f.win.anims.length <= 1)), '')
  check(`${tag} 动画期间没有 >50ms 的长任务`, !run.long.filter(t => t.duration > 50).length, JSON.stringify(run.long.map(t => ({ at: round(t.start - run.t0), ms: round(t.duration) }))))
  return { frames: anim.length, span }
}

/** 录像：CDP screencast 逐帧收 JPEG，按真实时间戳用系统 ffmpeg 拼成 mp4（Playwright 自带录像要另装它的 ffmpeg，不用） */
async function startRecording(page) {
  const cdp = await page.context().newCDPSession(page), frames = []
  cdp.on('Page.screencastFrame', ({ data, sessionId, metadata }) => { frames.push({ data, t: metadata.timestamp }); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}) })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 })
  return async file => {
    await cdp.send('Page.stopScreencast')
    const dir = `${out}/.rec-${Date.now()}`
    mkdirSync(dir, { recursive: true })
    const list = frames.map((frame, i) => { writeFileSync(`${dir}/${String(i).padStart(5, '0')}.jpg`, Buffer.from(frame.data, 'base64')); return `file '${String(i).padStart(5, '0')}.jpg'\nduration ${Math.max(0.001, (frames[i + 1]?.t ?? frame.t + 0.04) - frame.t).toFixed(4)}` })
    writeFileSync(`${dir}/list.txt`, list.join('\n') + `\nfile '${String(frames.length - 1).padStart(5, '0')}.jpg'\n`)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', 'fps=60,scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', `${out}/${file}`])
    rmSync(dir, { recursive: true, force: true })
    const span = frames.length ? frames.at(-1).t - frames[0].t : 0
    return { frames: frames.length, seconds: Math.round(span * 10) / 10 }
  }
}

/** 帧序列：暂停精灵自身的两段动画，按时间逐帧截图，拼成 GIF */
async function frameSequence(page, dir, file, trigger) {
  const dirPath = `${out}/frames-${file}`
  rmSync(dirPath, { recursive: true, force: true }); mkdirSync(dirPath, { recursive: true })
  await trigger()
  // 展开的挂载走 transition：等浮窗自己的动画出现再暂停
  await page.waitForFunction(() => document.getAnimations().some(a => a.effect?.target?.matches?.('.sprite-floating')))
  const total = await page.evaluate(() => {
    const own = document.getAnimations().filter(a => a.effect?.target?.matches?.('.sprite-floating, .sprite-orb'))
    for (const a of own) a.pause()
    window.__own = own
    return own[0]?.effect.getTiming().duration ?? 0
  })
  const box = await page.evaluate(() => { const parts = ['.sprite-floating', '.sprite-orb'].map(s => document.querySelector(s)).filter(Boolean).map(el => { const l = el.offsetLeft, t = el.offsetTop; return { l, t, r: l + el.offsetWidth, b: t + el.offsetHeight } }); return { l: Math.min(...parts.map(p => p.l)), t: Math.min(...parts.map(p => p.t)), r: Math.max(...parts.map(p => p.r)), b: Math.max(...parts.map(p => p.b)) } })
  const clip = { x: Math.max(0, box.l - 16), y: Math.max(0, box.t - 16), width: box.r - box.l + 32, height: box.b - box.t + 32 }
  const step = 16, count = Math.floor(total / step) + 1
  for (let i = 0; i < count; i++) {
    await page.evaluate(t => { for (const a of window.__own) a.currentTime = t }, Math.min(total, i * step))
    await page.screenshot({ path: `${dirPath}/f${String(i).padStart(2, '0')}.png`, clip })
  }
  await page.evaluate(() => { for (const a of window.__own) a.play() })
  await page.waitForSelector(dir === 'open' ? '.sprite-floating[data-phase="open"]' : '.sprite-orb[data-phase="closed"]')
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '12', '-i', `${dirPath}/f%02d.png`, '-vf', 'scale=iw/2:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse', `${out}/${file}.gif`])
  return count
}

/** 选中主题、切到第一张（有区块的）白板，等头像或停靠栏出现 */
async function readyOn(page, { orb = true } = {}) {
  await page.waitForSelector('.studio-topics .topic')
  if (!(await page.locator('.board-tabs button').count())) await page.locator('.studio-topics .topic', { hasText: topicTitle }).click()
  await page.waitForSelector('.board-tabs button'); await page.locator('.board-tabs button').first().click(); await page.waitForSelector('.board-block')
  await page.waitForSelector(orb ? '.sprite-orb' : '.sprite-docked'); await page.waitForTimeout(1500)
}

for (const [w, h] of sizes) {
  const tag = `${w}×${h}`
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
  await context.addInitScript(initScript, SKINS.clear)
  const page = await context.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  const shot = name => page.screenshot({ path: `${out}/${w}-${name}.png` })
  const ready = options => readyOn(page, options)
  await page.goto(base); await ready()

  // ---- 默认位置：与上一版一致（离右 311、离底 69），不压右栏和缩放条 ----
  let state = await orbState(page)
  check(`${tag} M4 默认位置：右下、离右 311、离底 69`, near(state.orb.x, w - 311 - SPRITE_W, 0.5) && near(state.orb.y, h - 69 - SPRITE_H, 0.5), `${state.orb.x},${state.orb.y}`)
  check(`${tag} M1 头像不再挂在白板宿主里`, await page.evaluate(() => !document.querySelector('.studio-orb-host, .studio-orb-full') && getComputedStyle(document.querySelector('.sprite-orb')).position === 'fixed' && document.querySelector('.sprite-orb').parentElement.closest('.studio-board-pane') === null), '')
  check(`${tag} M9 层级用 token：头像 z-index = --st-z-sprite`, await page.evaluate(() => { const orb = document.querySelector('.sprite-orb'); return getComputedStyle(orb).zIndex === getComputedStyle(orb).getPropertyValue('--st-z-sprite').trim() }), await page.evaluate(() => getComputedStyle(document.querySelector('.sprite-orb')).zIndex))


  const figureStyle = await page.evaluate(() => {
    const orb = document.querySelector('.sprite-orb'), style = getComputedStyle(orb)
    return { w: orb.offsetWidth, h: orb.offsetHeight, border: style.borderWidth, radius: style.borderRadius, background: style.backgroundColor, shadow: style.boxShadow }
  })
  check(`${tag} P9 全身60×92，没有圆框圆底`, figureStyle.w === 60 && figureStyle.h === 92 && figureStyle.border === '0px' && figureStyle.radius === '0px' && figureStyle.background === 'rgba(0, 0, 0, 0)' && figureStyle.shadow === 'none', JSON.stringify(figureStyle))
  const bodyMotion = await page.evaluate(() => {
    const rules = [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules] } catch { return [] } })
    return rules.filter(rule => rule.type === CSSRule.KEYFRAMES_RULE && /^sprite-(float|ground|think|wait|body-pulse|speak)$/.test(rule.name)).map(rule => ({ name: rule.name, properties: [...new Set([...rule.cssRules].flatMap(frame => [...frame.style]))] }))
  })
  check(`${tag} P10 四态关键帧只动transform/opacity`, bodyMotion.length === 6 && bodyMotion.every(rule => rule.properties.every(key => ['transform', 'opacity'].includes(key))), JSON.stringify(bodyMotion))

  // ---- 9 个位置：拖放 → 刷新 → 打开 → 收起 ----
  const spots = [['左上', 38, 54], ['上中', w / 2, 54], ['右上', w - 38, 54], ['左中', 38, h / 2], ['正中', w / 2, h / 2], ['右中', w - 38, h / 2], ['左下', 38, h - 54], ['下中', w / 2, h - 54], ['右下', w - 38, h - 54]]
  const regions = {}
  for (const [name, tx, ty] of spots) {
    const t = `${tag} ${name}(${tx},${ty})`
    const drag = await dragOrb(page, tx, ty)
    const orb = drag.after.orb
    check(`${t} M2/M3 松手位置与指针误差 ≤1px，没有打开`, orb && near(orb.x + HALF, tx) && near(orb.y + HALF_H, ty) && !drag.after.open && orb.phase === 'closed', `orb 中心 ${orb && `${orb.x + HALF},${orb.y + HALF_H}`} open=${drag.after.open}`)
    check(`${t} M2/M8 光标悬停 pointer、拖动 grabbing；拖动中不改 left/top`, drag.hover === 'pointer' && drag.during.cursor === 'grabbing' && drag.during.dragging && drag.during.left === `${drag.before.x}px` && drag.during.top === `${drag.before.y}px` && orb.transform === '', JSON.stringify(drag.during))
    const stack = await stackAt(page, tx, ty)
    regions[name] = stack.region
    check(`${t} M9 头像盖在${stack.region}上面`, stack.topInOrb, `top=${stack.top}`)
    if (name === '左中') await shot('orb-over-left')
    if (name === '右中') await shot('orb-over-right')
    if (name === '上中') await shot('orb-over-top')
    await page.reload(); await ready()
    const again = (await orbState(page)).orb
    check(`${t} M4 刷新后位置不变`, again && again.x === orb.x && again.y === orb.y, `${again?.x},${again?.y}`)
    const at = await openSprite(page)
    const win = await winBox(page), fit = attached(win, at, w, h)
    check(`${t} M5 浮窗全在视口内、贴着头像${fit.side}角`, fit.ok, JSON.stringify({ win, fit }))
    await collapseSprite(page)
    const back = (await orbState(page)).orb
    check(`${t} M5 收起后头像回到原位`, back.x === at.x && back.y === at.y, `${back.x},${back.y}`)
  }
  check(`${tag} 9 个位置覆盖左栏、右栏、顶栏与白板`, ['左栏', '右栏', '顶栏', '白板'].every(r => Object.values(regions).includes(r)), JSON.stringify(regions))

  // ---- 窗口在 w 与 1024 之间来回（含一次变矮）：始终在视口内，回来恢复 ----
  for (const [name, tx, ty] of [['右中', w - 120, h / 2], ['左上', 140, 120], ['右下', w - 38, h - 54], ['正中', w / 2, h / 2]]) {
    await dragOrb(page, tx, ty)
    const start = await orbState(page)
    const trail = []
    let inside = true, follows = true
    for (const [vw, vh] of [[1200, h], [1100, h], [1024, h], [1024, 600], [1024, h], [1100, h], [1200, h], [w, h]]) {
      await page.setViewportSize({ width: vw, height: vh }); await page.waitForTimeout(200)
      const now = await orbState(page), want = expectedOrb(start.stored, vw, vh)
      inside &&= now.orb.x >= EDGE && now.orb.y >= EDGE && now.orb.x + SPRITE_W <= vw - EDGE && now.orb.y + SPRITE_H <= vh - EDGE
      follows &&= near(now.orb.x, want.x, 0.5) && near(now.orb.y, want.y, 0.5) && now.stored === start.stored
      trail.push(`${vw}×${vh}:${now.orb.x},${now.orb.y}`)
    }
    const end = (await orbState(page)).orb
    check(`${tag} M4 缩放 ${name}：始终在视口内（8px），按锚点那一侧跟随，存储不变`, inside && follows, trail.join(' '))
    check(`${tag} M4 缩放 ${name}：回到 ${w}×${h} 恢复原位`, end.x === start.orb.x && end.y === start.orb.y, `${start.orb.x},${start.orb.y} → ${end.x},${end.y}`)
  }

  // ---- 拖浮窗标题栏：锚点跟着走，收起后头像在新锚点，再展开得到同一个浮窗 ----
  await page.evaluate(() => localStorage.removeItem('lumen.studio.sprite')); await page.reload(); await ready()
  await openSprite(page)
  const from = await winBox(page), face = await page.locator('.sprite-floating .sprite-face-head').boundingBox()
  // 往左上拖：横向不会碰边，纵向故意拖过顶边，浮窗应夹在 8px
  const dx = -Math.round(w * 0.4), dy = -Math.round(h * 0.3)
  const wantL = Math.max(EDGE, Math.min(from.l + dx, w - EDGE - from.w)), wantT = Math.max(EDGE, Math.min(from.t + dy, h - EDGE - from.h))
  await page.mouse.move(face.x + face.width / 2, face.y + face.height / 2); await page.mouse.down()
  await page.mouse.move(face.x + face.width / 2 + dx, face.y + face.height / 2 + dy, { steps: 12 })
  const midDrag = await page.evaluate(() => { const win = document.querySelector('.sprite-floating'); return { left: win.style.left, top: win.style.top, transform: win.style.transform } })
  await page.mouse.up(); await page.waitForTimeout(250)
  const moved = await winBox(page)
  check(`${tag} M5/M8 拖浮窗：拖动中只写 transform，松手后浮窗停在拖到的地方`, midDrag.transform.startsWith('translate(') && midDrag.left === `${from.l}px` && near(moved.l, wantL) && near(moved.t, wantT) && moved.transform === '' && moved.phase === 'open', `${JSON.stringify(midDrag)} ${from.l},${from.t} → ${moved.l},${moved.t}（期望 ${wantL},${wantT}）`)
  await shot('window-dragged')
  await collapseSprite(page)
  const anchorOrb = (await orbState(page)).orb
  const right = moved.l + moved.w / 2 > w / 2, bottom = moved.t + moved.h / 2 > h / 2
  check(`${tag} M5 收起后头像在浮窗的锚点角（${right ? '右' : '左'}${bottom ? '下' : '上'}）`, near(anchorOrb.x, right ? moved.r - SPRITE_W : moved.l) && near(anchorOrb.y, bottom ? moved.b - SPRITE_H : moved.t), `orb ${anchorOrb.x},${anchorOrb.y} win ${moved.l},${moved.t},${moved.r},${moved.b}`)
  await shot('window-dragged-collapsed')
  await openSprite(page)
  const reopened = await winBox(page)
  check(`${tag} M5 从新锚点再展开：同一个浮窗位置与大小`, near(reopened.l, moved.l) && near(reopened.t, moved.t) && near(reopened.w, moved.w) && near(reopened.h, moved.h), `${reopened.l},${reopened.t} ${reopened.w}×${reopened.h}`)
  await collapseSprite(page)
  await page.reload(); await ready()
  const persisted = (await orbState(page)).orb
  check(`${tag} M5 新锚点刷新后仍在`, persisted.x === anchorOrb.x && persisted.y === anchorOrb.y, `${persisted.x},${persisted.y}`)

  // ---- 打开/收起逐帧：清透与暗色各一遍 ----
  const motion = {}
  for (const skin of ['clear', 'dark']) {
    await page.evaluate(([key, value]) => { localStorage.setItem(key, value); localStorage.removeItem('lumen.studio.sprite') }, ['lumen:appearance.v2', JSON.stringify(SKINS[skin])])
    await page.reload(); await ready()
    const appearance = await page.evaluate(() => ({ skin: document.documentElement.dataset.skin, scheme: document.documentElement.style.colorScheme }))
    info(`${tag} ${skin}：${JSON.stringify(appearance)}`)
    const orbBox = (await orbState(page)).orb
    const open = await sampleRun(page, () => page.mouse.click(orbBox.x + HALF, orbBox.y + HALF_H))
    motion[`${skin}-open`] = assertMotion(`${tag} ${skin} M6 打开`, open, 'open', orbBox)
    await page.waitForTimeout(300)
    const button = await page.locator('.sprite-floating button[aria-label="收回成球"]').boundingBox()
    const close = await sampleRun(page, () => page.mouse.click(button.x + button.width / 2, button.y + button.height / 2))
    motion[`${skin}-close`] = assertMotion(`${tag} ${skin} M7 收起`, close, 'close', orbBox)
    const after = await orbState(page)
    check(`${tag} ${skin} M7 收起后头像在原位、不透明、无残留 transform`, after.orb.x === orbBox.x && after.orb.y === orbBox.y && await page.evaluate(() => { const o = document.querySelector('.sprite-orb'), s = getComputedStyle(o); return s.opacity === '1' && s.transform === 'none' && !document.querySelector('.sprite-floating') }), '')
    // 帧序列与 GIF
    await page.waitForTimeout(300)
    const openFrames = await frameSequence(page, 'open', `${w}-${skin}-open`, () => page.mouse.click(orbBox.x + HALF, orbBox.y + HALF_H))
    await page.waitForTimeout(300)
    const btn = await page.locator('.sprite-floating button[aria-label="收回成球"]').boundingBox()
    const closeFrames = await frameSequence(page, 'close', `${w}-${skin}-close`, () => page.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2))
    check(`${tag} ${skin} 帧序列：打开 ${openFrames} 帧、收起 ${closeFrames} 帧（每 16ms 一帧，${w}-${skin}-open.gif / -close.gif）`, openFrames >= 12 && closeFrames >= 12, '')
  }
  info(`${tag} 实测动画：${JSON.stringify(motion)}`)
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), ['lumen:appearance.v2', JSON.stringify(SKINS.clear)])
  await page.reload(); await ready()

  // ---- 中途反向：打开到一半点收起，收起到一半再点头像；始终一层、不跳帧 ----
  {
    // 头像放右上角：浮窗从这里往左下长，收起键贴近缩放原点、动画中几乎不动，真实鼠标才点得准（默认右下时收起键离原点约 500px，110ms 时仍在快速移动）
    await dragOrb(page, w - 38, 54)
    const orbBox = (await orbState(page)).orb
    const clean = await sampleRun(page, () => page.mouse.click(orbBox.x + HALF, orbBox.y + HALF_H))
    const cleanFrames = clean.frames.filter(f => f.win?.phase === 'opening').map(scaleOf)
    const maxStep = Math.max(...cleanFrames.map((s, i) => i ? Math.abs(s - cleanFrames[i - 1]) : 0))
    await page.waitForTimeout(300); await collapseSprite(page); await page.waitForTimeout(200)
    const run = await sampleRun(page, async () => {
      await page.mouse.click(orbBox.x + HALF, orbBox.y + HALF_H)
      await page.waitForTimeout(110)
      const button = await page.locator('.sprite-floating button[aria-label="收回成球"]').boundingBox()
      await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2)
      await page.waitForTimeout(70)
      await page.mouse.click(orbBox.x + HALF, orbBox.y + HALF_H)
    }, 1100)
    const live = run.frames.filter(f => f.win && f.win.phase !== 'open')
    const phases = live.map(f => f.win.phase).filter((p, i, list) => p !== list[i - 1])
    const scales = live.map(scaleOf)
    const steps = scales.map((s, i) => i ? Math.abs(s - scales[i - 1]) : 0)
    check(`${tag} M7 中途反向：开→收→开，各一次倒放`, JSON.stringify(phases) === JSON.stringify(['opening', 'closing', 'opening']), JSON.stringify(phases))
    check(`${tag} M7 中途反向：始终只有一层浮窗、一段动画`, run.frames.every(f => f.wins <= 1 && (!f.win || f.win.anims.length <= 1)), `最多 ${Math.max(...run.frames.map(f => f.wins))} 层`)
    // 反向那一帧与下一帧：变化不超过正常打开的最大单帧变化，且没有跳到起点或终点
    const turns = live.map((f, i) => i && f.win.phase !== live[i - 1].win.phase ? i : 0).filter(Boolean)
    const turnSteps = turns.flatMap(i => [steps[i], steps[i + 1] ?? 0])
    check(`${tag} M7 中途反向：不跳帧（反向处单帧缩放变化 ≤ 正常打开的最大单帧变化）`, turns.length === 2 && turnSteps.every(s => s <= maxStep + 0.01) && !turns.some(i => scales[i] >= 0.999 || scales[i] <= 0.201), `反向处 ${turnSteps.map(round).join(' ')}，正常最大 ${round(maxStep)}；逐帧 ${scales.map(round).join(' ')}`)
    check(`${tag} M7 中途反向后停在打开`, run.frames.at(-1).win?.phase === 'open' && (await orbState(page)).open, '')
    check(`${tag} M7 中途反向期间没有 >50ms 的长任务`, !run.long.filter(t => t.duration > 50).length, JSON.stringify(run.long))
    await collapseSprite(page)
  }

  // ---- 层级：设置弹窗、下拉菜单、外链确认框盖住头像 ----
  const openSettings = async () => { await page.locator('.studio-topics .studio-item', { hasText: '设置' }).click(); await page.waitForSelector('[role="dialog"]'); await page.waitForTimeout(400) }
  const closeAll = async () => { for (let i = 0; i < 3 && await page.locator('[role="dialog"]').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300) } }
  await openSettings()
  const dialogBox = await page.locator('[role="dialog"]').first().boundingBox()
  await closeAll()
  await dragOrb(page, Math.round(dialogBox.x + dialogBox.width / 2), Math.round(dialogBox.y + dialogBox.height / 2))
  let orbNow = (await orbState(page)).orb
  await openSettings()
  let stack = await stackAt(page, orbNow.x + HALF, orbNow.y + HALF_H)
  check(`${tag} M9 设置弹窗盖住头像`, !stack.topInOrb && stack.topDialog, JSON.stringify(stack))
  await shot('layer-settings')
  // 下拉菜单：设置里「添加模型」→「接口协议」下拉
  await page.locator('[role="dialog"] button', { hasText: '添加模型' }).click(); await page.waitForTimeout(300)
  await page.locator('[role="dialog"] [role="combobox"]').first().click(); await page.waitForSelector('[role="listbox"]'); await page.waitForTimeout(300)
  const listBox = await page.locator('[role="listbox"]').boundingBox()
  await closeAll()
  await dragOrb(page, Math.round(listBox.x + listBox.width / 2), Math.round(listBox.y + listBox.height / 2))
  orbNow = (await orbState(page)).orb
  await openSettings()
  await page.locator('[role="dialog"] button', { hasText: '添加模型' }).click(); await page.waitForTimeout(300)
  await page.locator('[role="dialog"] [role="combobox"]').first().click(); await page.waitForSelector('[role="listbox"]'); await page.waitForTimeout(300)
  stack = await stackAt(page, orbNow.x + HALF, orbNow.y + HALF_H)
  check(`${tag} M9 下拉菜单盖住头像`, !stack.topInOrb && stack.topListbox && stack.orbIndex > 0, JSON.stringify(stack))
  await shot('layer-menu')
  await closeAll()
  // 外链确认框：对话 b 里 arxiv 链接是真实消息，点开后确认框盖住浮窗；收起精灵后同样盖住头像
  await dragOrb(page, Math.round(w / 2), Math.round(h / 2))
  await openSprite(page)
  await page.locator('.sprite-title').click(); await page.locator('.sprite-session', { hasText: '换了一段新对话' }).click()
  const link = page.locator('.sprite-floating a[href*="arxiv.org/abs/2104.09864"]').first()
  await link.waitFor({ timeout: 15000 }); await link.scrollIntoViewIfNeeded(); await page.waitForTimeout(300)
  await link.click(); await page.waitForSelector('.ext-link-modal'); await page.waitForTimeout(400)
  const winNow = await winBox(page)
  stack = await stackAt(page, winNow.l + winNow.w / 2, winNow.t + 30)
  check(`${tag} M9 外链确认框盖住浮窗（与头像同一层级 token）`, !stack.top?.includes('sprite') && await page.evaluate(([x, y]) => !document.elementFromPoint(x, y)?.closest('.sprite-floating'), [winNow.l + winNow.w / 2, winNow.t + 30]), JSON.stringify(stack))
  await shot('layer-confirm-window')
  // 确认框是模态的，只能用 DOM click 收起精灵（真实鼠标会被模态挡住），再看确认框与头像的叠放
  await page.evaluate(() => document.querySelector('.sprite-floating button[aria-label="收回成球"]').click())
  await page.waitForSelector('.sprite-orb[data-phase="closed"]'); await page.waitForTimeout(300)
  orbNow = (await orbState(page)).orb
  stack = await stackAt(page, orbNow.x + HALF, orbNow.y + HALF_H)
  check(`${tag} M9 外链确认框盖住头像`, await page.locator('.ext-link-modal').count() === 1 && !stack.topInOrb && stack.topDialog, JSON.stringify(stack))
  await shot('layer-confirm')
  await page.locator('.ext-link-modal button', { hasText: '取消' }).click().catch(() => page.keyboard.press('Escape'))
  await page.waitForTimeout(300)
  check(`${tag} 外链确认框已取消、未打开外部链接`, !(await page.locator('.ext-link-modal').count()) && context.pages().length === 1, `pages=${context.pages().length}`)

  // ---- 沉浸阅读：头像盖在阅读器上 ----
  await page.locator('.material-open').filter({ hasText: '1706.03762' }).click()
  await page.waitForSelector('.studio-reader .pdf-page', { timeout: 15000 }); await page.waitForTimeout(1200)
  await page.locator('.studio-reader button[aria-label="铺满中栏"]').click(); await page.waitForTimeout(500)
  await page.keyboard.press('Meta+b'); await page.keyboard.press('Meta+Alt+b'); await page.waitForTimeout(900)
  await dragOrb(page, Math.round(w * 0.62), Math.round(h * 0.45))
  orbNow = (await orbState(page)).orb
  stack = await stackAt(page, orbNow.x + HALF, orbNow.y + HALF_H)
  check(`${tag} M9 沉浸阅读：头像盖在阅读器上`, stack.topInOrb && stack.region === '阅读器', JSON.stringify(stack))
  await shot('orb-over-immersive')
  await openSprite(page)
  const immersiveWin = await winBox(page)
  check(`${tag} M5/M9 沉浸阅读里打开：浮窗在视口内、盖在阅读器上`, attached(immersiveWin, orbNow, w, h).ok && await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.sprite-floating'), [immersiveWin.l + immersiveWin.w / 2, immersiveWin.t + immersiveWin.h / 2]), JSON.stringify(immersiveWin))
  await shot('immersive-open')
  await collapseSprite(page)
  await page.keyboard.press('Escape'); await page.waitForTimeout(600)
  await page.keyboard.press('Meta+b'); await page.keyboard.press('Meta+Alt+b'); await page.waitForTimeout(500)
  await page.locator('.studio-reader button[aria-label="关闭阅读器"]').click(); await page.waitForTimeout(400)

  // ---- 停靠 / 取消停靠 ----
  await dragOrb(page, 200, Math.round(h * 0.7))
  const anchorBefore = (await orbState(page)).orb
  await openSprite(page)
  await page.locator('.sprite-floating button[aria-label="停靠到右侧"]').click(); await page.waitForTimeout(500)
  let dock = await page.evaluate(() => ({ docked: !!document.querySelector('.sprite-docked'), floating: !!document.querySelector('.sprite-floating'), orbs: document.querySelectorAll('.sprite-orb').length, rightEdge: document.querySelector('.sprite-docked')?.getBoundingClientRect().right }))
  check(`${tag} M10 停靠：占右侧一栏、不显示头像、没有浮窗`, dock.docked && !dock.floating && dock.orbs === 0 && near(dock.rightEdge, w - 8), JSON.stringify(dock))
  await shot('docked')
  await page.reload(); await ready({ orb: false })
  dock = await page.evaluate(() => ({ docked: !!document.querySelector('.sprite-docked'), orbs: document.querySelectorAll('.sprite-orb').length }))
  check(`${tag} M10 停靠刷新后仍停靠、仍无头像`, dock.docked && dock.orbs === 0, JSON.stringify(dock))
  await page.locator('.sprite-docked button[aria-label="恢复浮动"]').click(); await page.waitForTimeout(500)
  const undocked = await winBox(page), stored = (await orbState(page)).stored, want = expectedOrb(stored, w, h)
  check(`${tag} M10 取消停靠：浮窗出现在锚点旁（贴着锚点头像那一角）`, !!undocked && undocked.phase === 'open' && attached(undocked, want, w, h).ok && near(want.x, anchorBefore.x) && near(want.y, anchorBefore.y), JSON.stringify({ undocked, want }))
  await shot('undocked')
  await collapseSprite(page)
  const afterDock = (await orbState(page)).orb
  check(`${tag} M10 取消停靠后收起：头像在原锚点`, afterDock.x === anchorBefore.x && afterDock.y === anchorBefore.y, `${afterDock.x},${afterDock.y}`)

  // ---- 键盘：Enter/Space 打开，Alt+方向键 16px 并保存 ----
  await page.locator('.sprite-orb').focus()
  const k0 = (await orbState(page)).orb
  await page.keyboard.press('Alt+ArrowRight'); await page.keyboard.press('Alt+ArrowUp'); await page.waitForTimeout(150)
  const k1 = await orbState(page)
  check(`${tag} M12 Alt+方向键各 16px 并写入存储`, k1.orb.x === k0.x + 16 && k1.orb.y === k0.y - 16 && near(expectedOrb(k1.stored, w, h).x, k1.orb.x, 0) && !k1.open, `${k0.x},${k0.y} → ${k1.orb.x},${k1.orb.y}`)
  await page.keyboard.press('Enter'); await page.waitForSelector('.sprite-floating[data-phase="open"]')
  check(`${tag} M12 Enter 打开`, true, '')
  await collapseSprite(page)
  await page.locator('.sprite-orb').focus(); await page.keyboard.press('Space'); await page.waitForSelector('.sprite-floating[data-phase="open"]')
  check(`${tag} M12 Space 打开`, true, '')
  await collapseSprite(page)

  check(`${tag} 页面无脚本错误`, !errors.length, errors.join('; '))
  await context.close()

  // ---- 减弱动效：只淡 120ms，拖动照常 ----
  const reduced = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  await reduced.addInitScript(initScript, SKINS.clear)
  const rpage = await reduced.newPage()
  const rerrors = []; rpage.on('pageerror', e => rerrors.push(e.message))
  await rpage.goto(base)
  await readyOn(rpage)
  const rdrag = await dragOrb(rpage, 400, 300)
  check(`${tag} M11 减弱动效：拖动照常（误差 ≤1px、不打开）`, near(rdrag.after.orb.x + HALF, 400) && near(rdrag.after.orb.y + HALF_H, 300) && !rdrag.after.open, '')
  const rorb = rdrag.after.orb
  const ropen = await sampleRun(rpage, () => rpage.mouse.click(rorb.x + HALF, rorb.y + HALF_H), 500)
  assertMotion(`${tag} reduced M11 打开`, ropen, 'open', rorb, { reduced: true })
  await rpage.waitForTimeout(200)
  const rbtn = await rpage.locator('.sprite-floating button[aria-label="收回成球"]').boundingBox()
  const rclose = await sampleRun(rpage, () => rpage.mouse.click(rbtn.x + rbtn.width / 2, rbtn.y + rbtn.height / 2), 500)
  assertMotion(`${tag} reduced M11 收起`, rclose, 'close', rorb, { reduced: true })
  check(`${tag} 减弱动效页面无脚本错误`, !rerrors.length, rerrors.join('; '))
  await reduced.close()

  // ---- 复核 R1：拖动以真实 pointercancel 结束后 Enter 照常打开；鼠标拖完紧随的 click 被吞、随后 Enter 照常打开 ----
  const touch = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true })
  await touch.addInitScript(initScript, SKINS.clear)
  const tpage = await touch.newPage()
  const terrors = []; tpage.on('pageerror', e => terrors.push(e.message))
  await tpage.goto(base); await readyOn(tpage)
  {
    const cdp = await touch.newCDPSession(tpage)
    const seen = []
    await tpage.evaluate(() => { window.__ptr = []; const orb = document.querySelector('.sprite-orb'); for (const type of ['pointerdown', 'pointercancel', 'pointerup', 'click']) orb.addEventListener(type, e => window.__ptr.push(`${type}:${e.pointerType ?? ''}:${e.isTrusted}`)) })
    const o = (await orbState(tpage)).orb, sx = o.x + HALF, sy = o.y + HALF_H, tx = Math.round(w * 0.3), ty = Math.round(h * 0.4)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] })
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + (tx - sx) * i / 10, y: sy + (ty - sy) * i / 10 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    await tpage.waitForTimeout(300)
    const after = await orbState(tpage), events = await tpage.evaluate(() => window.__ptr)
    check(`${tag} R1 真实 pointercancel：停在最后位置（误差 ≤1px）、没有打开`, events.includes('pointercancel:touch:true') && !events.some(e => e.startsWith('click')) && near(after.orb.x + HALF, tx) && near(after.orb.y + HALF_H, ty) && !after.open, `${events.join(' ')} → ${after.orb.x + HALF},${after.orb.y + HALF_H}`)
    await tpage.locator('.sprite-orb').focus(); await tpage.keyboard.press('Enter')
    const opened = await tpage.waitForSelector('.sprite-floating[data-phase="open"]', { timeout: 3000 }).then(() => true, () => false)
    check(`${tag} R1 pointercancel 之后 Enter 照常打开（没被吞）`, opened, '')
    if (opened) await collapseSprite(tpage)
    await tpage.locator('.sprite-orb').focus(); await tpage.keyboard.press('Space')
    check(`${tag} R1 再按 Space 也照常打开`, await tpage.waitForSelector('.sprite-floating[data-phase="open"]', { timeout: 3000 }).then(() => true, () => false), '')
    await collapseSprite(tpage)
    // 鼠标拖：紧随的 click 被吞（真实鼠标），随后 Enter 照常打开
    await tpage.evaluate(() => { window.__ptr = []; const orb = document.querySelector('.sprite-orb'); for (const type of ['pointerup', 'click']) orb.addEventListener(type, e => window.__ptr.push(`${type}:${e.pointerType ?? ''}`)) })
    const drag = await dragOrb(tpage, Math.round(w * 0.6), Math.round(h * 0.5))
    const mouseEvents = await tpage.evaluate(() => window.__ptr)
    check(`${tag} R1 鼠标拖完：浏览器派发了紧随的 click，且被吞、没有打开`, mouseEvents.some(e => e.startsWith('click')) && !drag.after.open, mouseEvents.join(' '))
    await tpage.locator('.sprite-orb').focus(); await tpage.keyboard.press('Enter')
    check(`${tag} R1 鼠标拖完后 Enter 照常打开`, await tpage.waitForSelector('.sprite-floating[data-phase="open"]', { timeout: 3000 }).then(() => true, () => false), '')
    await collapseSprite(tpage)
  }
  check(`${tag} R1 页面无脚本错误`, !terrors.length, terrors.join('; '))
  await touch.close()

  // ---- 录像：拖动、打开、收起（CDP screencast，实时） ----
  const rec = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await rec.addInitScript(initScript, SKINS.clear)
  const vpage = await rec.newPage()
  await vpage.goto(base)
  await readyOn(vpage)
  const stopRecording = await startRecording(vpage)
  for (const [tx, ty] of [[140, 120], [w / 2, 60], [w - 120, h / 2], [w / 2, h / 2]]) { await dragOrb(vpage, tx, ty, 40); await vpage.waitForTimeout(400) }
  for (let i = 0; i < 2; i++) {
    const o = (await orbState(vpage)).orb
    await vpage.mouse.click(o.x + HALF, o.y + HALF_H); await vpage.waitForTimeout(900)
    const b = await vpage.locator('.sprite-floating button[aria-label="收回成球"]').boundingBox()
    await vpage.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await vpage.waitForTimeout(900)
  }
  await vpage.evaluate(value => localStorage.setItem('lumen:appearance.v2', value), JSON.stringify(SKINS.dark)); await vpage.reload()
  await readyOn(vpage)
  {
    const o = (await orbState(vpage)).orb
    await vpage.mouse.click(o.x + HALF, o.y + HALF_H); await vpage.waitForTimeout(900)
    const b = await vpage.locator('.sprite-floating button[aria-label="收回成球"]').boundingBox()
    await vpage.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await vpage.waitForTimeout(900)
  }
  const recorded = await stopRecording(`${w}-drag-open-close.mp4`)
  await rec.close()
  info(`${tag} 录像 ${w}-drag-open-close.mp4（${recorded.frames} 帧 / ${recorded.seconds}s）：4 次拖动、清透打开/收起 ×2、暗色打开/收起`)
}
await browser.close()
console.log(results.join('\n'))
console.log(failed ? `\n${failed} 项未过` : '\n全部通过')
process.exitCode = failed ? 1 : 0
