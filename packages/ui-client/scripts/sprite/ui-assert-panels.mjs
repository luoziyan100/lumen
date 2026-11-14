/**
 * [INPUT]: 5183 的真实面板与隔离 PDF 材料
 * [OUTPUT]: 上一任务全部面板回归，只将形象尺寸断言推广为60×92
 * [POS]: 现有面板合同的回归入口，不修改面板布局要求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
// sprite-move 回归：上一轮 lumen-sprite-ui 的 ui-assert-panels.js 全部断言（源自 lumen-studio-panels 的独立脚本 + S2 精灵圆 52px + 1706.03762 原文），
// 改为独立运行、dev 端口 5183。唯一改写：G8 原为「精灵球在白板区内、不压右栏、不压缩放条」，按 M1（整窗自由放置）改为「默认位置不压右栏和缩放条」，
// 不再要求在白板区内；脚本开头清掉 lumen.studio.sprite、全程不拖头像，所以每个状态量的都是默认位置。
// lumen-studio-chrome 改写一条：U1「每项一行」原来量整个按钮内容的行顶，C2 给每项加了 16px 图标后图标与文字行顶不同会被误数成两行；
// 改为只量文字 span 的行数（紧凑态没有文字就量按钮），scrollWidth 不溢出的条件不变。
// 用法：node ui-assert-panels.mjs <evidence-dir> [topicTitle]
import { chromium } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const [out, topicTitle = '自注意力为什么能取代循环'] = process.argv.slice(2)
const emptyTitle = ''
process.env.UI2 = '1'
const port = process.env.PORT ?? '5183'
const sizes = [[1440, 900], [1280, 800]]
const browser = await chromium.launch({ executablePath: exe })
const results = []
let failed = 0
const check = (name, ok, detail) => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++ }
const settle = page => page.waitForTimeout(450)

async function measure(page) {
  return page.evaluate(() => {
    const r = el => el.getBoundingClientRect()
    const textLeft = el => { if (el.classList.contains("ws-tag")) return r(el).left; const range = document.createRange(); range.selectNodeContents(el); const rects = [...range.getClientRects()].filter(x => x.width > 0); return rects.length ? Math.min(...rects.map(x => x.left)) : r(el).left }
    const panels = [...document.querySelectorAll('.studio-panel')].filter(p => r(p).width > 0)
    const heads = [...document.querySelectorAll('.studio-head')].filter(h => r(h).width > 0 && !h.closest('[inert]')).map(h => ({ who: h.parentElement.className.split(' ').slice(0, 3).join('.'), bottom: Math.round(r(h).bottom * 10) / 10 }))
    const edges = []
    for (const panel of panels) {
      const inner = r(panel).left + parseFloat(getComputedStyle(panel).borderLeftWidth)
      const panes = panel.classList.contains('studio-center') ? [...panel.querySelectorAll(':scope > .studio-pane')] : [panel]
      for (const pane of panes) {
        const base = pane === panel ? inner : r(pane).left + parseFloat(getComputedStyle(pane).borderLeftWidth)
        const targets = [...pane.querySelectorAll('.studio-head:not(.studio-center-head) > :first-child:not(.sprite-title), .sprite-title > span:first-of-type, .studio-scroll > .studio-note, .topics-list .studio-item, .studio-label, .studio-foot > :first-child, .material-open, .sprite-session')].filter(t => r(t).width > 0 && t.textContent.trim())
        for (const t of targets) edges.push({ who: `${pane.className.split(' ')[1] ?? pane.className} ${t.className.split(' ')[0]} 「${t.textContent.trim().slice(0, 12)}」`, offset: Math.round((textLeft(t) - base) * 10) / 10 })
      }
    }
    const overflow = []
    for (const block of document.querySelectorAll('.board-block')) for (const el of [block, ...block.querySelectorAll('*')]) {
      if (el.closest('.katex-mathml')) continue
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && getComputedStyle(el).overflowX !== 'visible') overflow.push(`${block.getAttribute('aria-label')?.slice(0, 20)} › ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${el.scrollWidth}>${el.clientWidth}`)
    }
    const viewport = document.querySelector('.board-viewport')
    const vleft = viewport ? r(viewport).left : 0
    const clipped = [...document.querySelectorAll('.board-block')].filter(b => r(b).left < vleft - 0.5).map(b => b.getAttribute('aria-label'))
    const offRight = viewport ? [...document.querySelectorAll('.board-block')].filter(b => r(b).right > r(viewport).right + 0.5).map(b => b.getAttribute('aria-label')) : []
    const orb = document.querySelector('.sprite-orb'), right = document.querySelector('.studio-materials')
    const hit = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)
    const orbHitsRight = orb && right ? hit(r(orb), r(right)) : false
    const orbInBoard = orb && viewport ? (() => { const a = r(orb), b = r(viewport); return a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom })() : false
    const zoom = document.querySelector('.board-zoom'), orbOverZoom = orb && zoom ? hit(r(orb), r(zoom)) : false
    const fonts = new Set([...document.querySelectorAll('.studio *')].filter(el => r(el).width > 0 && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !el.closest('.md-body, .studio-reader .mw-reader, .sprite, .mermaid-svg, .katex, .ws-tag')).map(el => getComputedStyle(el).fontSize))
    const label = document.querySelector('.board-frame-label'), sheets = document.querySelector('.board-sheets')
    const labelClipped = label && viewport ? r(label).right > r(viewport).right + 0.5 || r(label).left < r(viewport).left : false
    const labelHitsSheets = label && sheets ? hit(r(label), r(sheets)) : false
    const seg = document.querySelector('.studio-center .studio-seg'), segPane = seg?.closest('.studio-pane')
    const segOffset = seg && segPane ? Math.round(Math.abs((r(seg).left + r(seg).right) / 2 - (r(segPane).left + r(segPane).right) / 2) * 10) / 10 : null
    const centerHead = document.querySelector('.studio-center .studio-head')?.textContent ?? ''
    const boardText = document.querySelector('.studio-board')?.textContent ?? ''
    const mats = document.querySelector('.studio-materials')
    const matGroups = mats ? mats.querySelectorAll('.studio-label, .materials-group, h4').length : 0
    const matCounts = mats ? [...mats.querySelectorAll('*')].filter(el => el.children.length === 0 && /^\s*\d+\s*$/.test(el.textContent)).length : 0
    const segWrapped = seg ? [...seg.querySelectorAll('button')].filter(b => { const range = document.createRange(); range.selectNodeContents(b.querySelector(':scope > span') ?? b); return new Set([...range.getClientRects()].map(x => Math.round(x.top))).size > 1 || b.scrollWidth > b.clientWidth + 1 }).map(b => b.textContent) : []
    return { segWrapped, segOffset, centerHead, boardText, matGroups, matCounts, labelClipped, labelHitsSheets, heads, edges, overflow, clipped, offRight, orb: !!orb, orbSize: orb ? r(orb).width : null, orbHeight: orb ? r(orb).height : null, orbHitsRight, orbInBoard, orbOverZoom, blocks: document.querySelectorAll('.board-block').length, scale: document.querySelector('.board-zoom-value')?.textContent, fonts: [...fonts].sort() }
  })
}

function assertLayout(tag, m, { board = true } = {}) {
  if (process.env.UI2) {
    check(`${tag} U1 分段控件居中（距所在段中线 ${m.segOffset}px）`, m.segOffset !== null && m.segOffset <= 2, '')
    check(`${tag} U1 分段控件每项一行、不被挤压`, !m.segWrapped.length, m.segWrapped.join(' '))
    check(`${tag} U1 中栏头部没有主题名`, !m.centerHead.includes(topicTitle) && !(emptyTitle && m.centerHead.includes(emptyTitle)), m.centerHead)
    check(`${tag} U2 画布里没有「已用」`, !m.boardText.includes('已用'), '')
    check(`${tag} U3 素材栏没有分组标题与计数`, m.matGroups === 0 && m.matCounts === 0, `groups=${m.matGroups} counts=${m.matCounts}`)
  }
  const ys = [...new Set(m.heads.map(h => h.bottom))]
  check(`${tag} G2 头部底边同线`, ys.length === 1 || Math.max(...ys) - Math.min(...ys) <= 1, m.heads.map(h => `${h.who}=${h.bottom}`).join(', '))
  const bad = m.edges.filter(e => Math.abs(e.offset - 14) > 1)
  check(`${tag} G3 文字左缘 14px（${m.edges.length} 处）`, !bad.length, bad.map(e => `${e.who}=${e.offset}`).join('; '))
  check(`${tag} G4 字号只有四级`, m.fonts.every(f => ['14px', '13.5px', '11px', '12px'].includes(f)), m.fonts.join(' '))
  check(`${tag} P9 全身精灵保持60×92px`, m.orbSize === 60 && m.orbHeight === 92, String(m.orbSize))
  if (board) {
    check(`${tag} B1 默认 100%`, m.scale === '100%', m.scale)
    check(`${tag} B1 没有区块被视口左缘切掉（${m.blocks} 块）`, m.blocks > 0 && !m.clipped.length, m.clipped.join('; '))
    check(`${tag} B3 区块里没有横向滚动`, !m.overflow.length, m.overflow.join('; '))
    // G8（按 M1 改写）：头像可以放在整窗任何位置，只要求默认位置不压右栏和缩放条
    check(`${tag} G8′ 默认位置不压右栏、不压缩放条`, m.orb && !m.orbHitsRight && !m.orbOverZoom, `orb=${m.orb} hitsRight=${m.orbHitsRight} overZoom=${m.orbOverZoom} inBoard=${m.orbInBoard}`)
    check(`${tag} B4 边框标签不出视口、不压张标签浮层`, !m.labelClipped && !m.labelHitsSheets, `clipped=${m.labelClipped} hits=${m.labelHitsSheets}`)
    results.push(`INFO ${tag} 视口右侧以外的区块（可平移看到）：${m.offRight.length}`)
  }
}

/** K/R/I/W 新断言用的量取 */
async function geometry(page) {
  return page.evaluate(() => {
    const r = el => el ? el.getBoundingClientRect() : null
    const box = el => { const b = r(el); return b ? { l: Math.round(b.left * 10) / 10, r: Math.round(b.right * 10) / 10, w: Math.round(b.width * 10) / 10, t: b.top, b: b.bottom } : null }
    const visible = el => { if (!el) return false; const b = r(el); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert]') }
    const reopen = side => [...document.querySelectorAll(`.studio-center .pane-toggle[data-pane="${side}"]`)].find(visible) ?? null
    const focusable = el => { if (!el) return false; el.focus(); const ok = document.activeElement === el; el.blur(); return ok }
    const tabs = [...document.querySelectorAll('.board-tabs button')]
    const sheets = document.querySelector('.board-sheets')
    const hit = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)
    const viewport = document.querySelector('.board-viewport')
    const titlesUnder = sheets && viewport ? [...document.querySelectorAll('.block-title')].filter(t => { const a = r(t); return a.bottom > r(viewport).top && a.top < r(viewport).bottom && hit(a, r(sheets)) }).map(t => t.textContent.slice(0, 16)) : []
    const tabLines = tabs.map(b => { const range = document.createRange(); range.selectNodeContents(b); return { text: b.textContent, lines: new Set([...range.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size, w: Math.round(r(b).width), title: b.title, full: b.title.length > 0 } })
    const scroll = document.querySelector('.studio-reader .pdf-scroll')
    const reader = document.querySelector('.studio-reader')
    const head = reader?.querySelector('.studio-head')
    const order = head ? [...head.querySelectorAll(':scope > *, :scope > .reader-actions > *')].filter(el => !el.classList.contains('reader-actions')).map(el => el.classList.contains('reader-icon') ? 'icon' : el.classList.contains('reader-title') ? 'title' : el.getAttribute('aria-label') ?? el.className) : []
    const title = head?.querySelector('.reader-title')
    return {
      vw: innerWidth,
      topics: box(document.querySelector('.studio-topics')), materials: box(document.querySelector('.studio-materials')),
      center: box(document.querySelector('.studio-center')), board: box(document.querySelector('.studio-board-pane')), reader: box(reader),
      boardShown: !!document.querySelector('.studio-board-pane') && getComputedStyle(document.querySelector('.studio-board-pane')).display !== 'none',
      boardMounted: !!document.querySelector('.studio-board'),
      camera: document.querySelector('.board-world')?.style.transform ?? null,
      reopenLeft: !!reopen('left'), reopenRight: !!reopen('right'), focusLeft: focusable(reopen('left')), focusRight: focusable(reopen('right')),
      reopenLeftAttrs: reopen('left') ? { expanded: reopen('left').getAttribute('aria-expanded'), title: reopen('left').title, label: reopen('left').getAttribute('aria-label') } : null,
      reopenRightAttrs: reopen('right') ? { expanded: reopen('right').getAttribute('aria-expanded'), title: reopen('right').title, label: reopen('right').getAttribute('aria-label') } : null,
      seg: !!document.querySelector('.studio-center .studio-seg') && visible(document.querySelector('.studio-center .studio-seg')),
      wsTags: document.querySelectorAll('.ws-tag').length,
      tabs: tabLines, sheetsH: sheets ? Math.round(r(sheets).height) : null, titlesUnder,
      pdf: scroll ? (() => {
        const page = r(scroll.querySelector('.pdf-page')), s = r(scroll), style = getComputedStyle(scroll)
        const inner = scroll.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        const center = s.left + scroll.clientLeft + parseFloat(style.paddingLeft) + inner / 2
        return { sw: scroll.scrollWidth, cw: scroll.clientWidth, inner: Math.round(inner), pageW: Math.round(page.width), offCenter: Math.round(Math.abs((page.left + page.right) / 2 - center) * 10) / 10, zoom: document.querySelector('.studio-reader .pdf-zoom-val')?.textContent, fitting: document.querySelector('.studio-reader .pdf-fit-btn')?.disabled ?? null }
      })() : null,
      order, titleTruncated: title ? title.scrollWidth > title.clientWidth : null, titleFull: title?.title ?? null,
      panes: localStorage.getItem('lumen.studio.panes'),
    }
  })
}

function assertCommon(tag, g) {
  check(`${tag} I1 页面上没有 .ws-tag`, g.wsTags === 0, `${g.wsTags}`)
  if (g.boardShown && g.tabs.length) {
    check(`${tag} W1 张标签单行、≤160px、title 全名（${g.tabs.length} 张）`, g.tabs.every(t => t.lines === 1 && t.w <= 160 && t.full), JSON.stringify(g.tabs))
    check(`${tag} W1/W2 浮层单行高 30`, g.sheetsH === 30, `${g.sheetsH}`)
    check(`${tag} W2 浮层不压区块标题`, !g.titlesUnder.length, g.titlesUnder.join('; '))
  }
}
const near = (a, b, d = 1) => Math.abs(a - b) <= d

async function pdfReady(page) { await page.waitForSelector('.studio-reader .pdf-page', { timeout: 15000 }); await page.waitForTimeout(1500) }

for (const [w, h] of sizes) {
  const tag = `${w}×${h}`
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.removeItem('lumen.studio.sprite'); localStorage.removeItem('lumen.studio.panes'); sessionStorage.setItem('seeded', '1') } })
  await page.goto(`http://localhost:${port}/`)
  await page.waitForSelector('.studio-topics .topic')
  // 这个主题有三张白板，最新一张是空的：切到第一张（有区块）再量
  const openBoard = async () => { await page.waitForSelector('.board-tabs button'); await page.locator('.board-tabs button').first().click(); await page.waitForSelector('.board-block'); await page.waitForTimeout(2500) }
  await page.locator('.studio-topics .topic', { hasText: topicTitle }).click()
  await openBoard()
  const shot = name => page.screenshot({ path: `${out}/${w}-${name}.png` })

  // ---- 默认 ----
  let m = await measure(page), g = await geometry(page)
  assertLayout(`${tag} 默认`, m); assertCommon(`${tag} 默认`, g)
  check(`${tag} 默认 三栏都在、无展开按钮`, g.topics.w > 0 && g.materials.w > 0 && !g.reopenLeft && !g.reopenRight, '')
  const collapseBtn = await page.evaluate(() => { const b = document.querySelector('.studio-topics .pane-toggle'); return b && { expanded: b.getAttribute('aria-expanded'), title: b.title, label: b.getAttribute('aria-label') } })
  check(`${tag} K4 主题栏收起按钮 aria/title`, collapseBtn?.expanded === 'true' && collapseBtn.title === '收起主题栏 ⌘B' && collapseBtn.label === '收起主题栏', JSON.stringify(collapseBtn))
  await shot('default')

  // ---- 左收起（⌘B） ----
  await page.keyboard.press('Meta+b'); await settle(page)
  m = await measure(page); g = await geometry(page)
  assertLayout(`${tag} 左收起`, m); assertCommon(`${tag} 左收起`, g)
  check(`${tag} K1 左栏宽 0`, g.topics.w === 0, JSON.stringify(g.topics))
  check(`${tag} K1 展开按钮可见、可键盘聚焦，aria-expanded=false，title 带 ⌘B`, g.reopenLeft && g.focusLeft && g.reopenLeftAttrs.expanded === 'false' && g.reopenLeftAttrs.title === '展开主题栏 ⌘B', JSON.stringify(g.reopenLeftAttrs))
  check(`${tag} K5 中栏左缘仍是 8px`, near(g.center.l, 8), `${g.center.l}`)
  check(`${tag} K3 localStorage 记住左收起`, JSON.parse(g.panes).left === true, g.panes)
  await shot('left-collapsed')

  // ---- 刷新后仍收起（K3） ----
  await page.reload(); await openBoard()
  g = await geometry(page)
  check(`${tag} K3 刷新后左栏仍收起`, g.topics.w === 0 && g.reopenLeft, '')

  // ---- 右也收起（⌘⌥B）：两侧收起 ----
  await page.keyboard.press('Meta+Alt+b'); await settle(page)
  m = await measure(page); g = await geometry(page)
  assertLayout(`${tag} 两侧收起`, m); assertCommon(`${tag} 两侧收起`, g)
  check(`${tag} K2 右栏宽 0，展开按钮可见可聚焦，title 带 ⌘⌥B`, g.materials.w === 0 && g.reopenRight && g.focusRight && g.reopenRightAttrs.title === '展开素材栏 ⌘⌥B' && g.reopenRightAttrs.expanded === 'false', JSON.stringify(g.reopenRightAttrs))
  check(`${tag} K5 两侧收起后外边距仍 8px`, near(g.center.l, 8) && near(g.center.r, w - 8), `${g.center.l}–${g.center.r}`)
  await shot('both-collapsed')

  // ---- 只收右：点展开按钮恢复左栏 ----
  await page.locator('.studio-center .pane-toggle[data-pane="left"]').click(); await settle(page)
  // 先看焦点：geometry() 会逐个试聚焦展开按钮
  const focusAfter = await page.evaluate(() => document.activeElement?.closest('.studio-topics') && document.activeElement.getAttribute('aria-label'))
  m = await measure(page); g = await geometry(page)
  assertLayout(`${tag} 右收起`, m); assertCommon(`${tag} 右收起`, g)
  check(`${tag} K2 只收右：左栏回来、右栏 0、中栏右缘 8px`, g.topics.w > 0 && g.materials.w === 0 && near(g.center.r, w - 8), `${g.center.r}`)
  check(`${tag} K4 点展开后焦点落到栏内收起按钮`, focusAfter === '收起主题栏', `${focusAfter}`)
  await shot('right-collapsed')
  await page.locator('.studio-center .pane-toggle[data-pane="right"]').click(); await settle(page)

  // ---- 分屏：从素材打开，PDF 按宽适配 ----
  if (await page.locator('.studio-reader').count()) await page.locator('.studio-reader button[aria-label="关闭阅读器"]').click()
  await page.locator('.material-open').filter({ hasText: '1706.03762' }).click(); await pdfReady(page)
  m = await measure(page); g = await geometry(page)
  assertLayout(`${tag} 分屏`, m); assertCommon(`${tag} 分屏`, g)
  check(`${tag} R-b 头部顺序`, JSON.stringify(g.order) === JSON.stringify(['icon', 'title', '铺满中栏', '用系统打开', '下载', '关闭阅读器']) || JSON.stringify(g.order) === JSON.stringify(['icon', 'title', '铺满中栏', '用系统打开', '保存到本机', '关闭阅读器']), JSON.stringify(g.order))
  check(`${tag} R-b 标题有 title 全名`, !!g.titleFull, `${g.titleFull} truncated=${g.titleTruncated}`)
  check(`${tag} R-d 白板段 ≥360，阅读器 ≥420 或已先压阅读器`, g.board.w >= 360 - 0.5 && (g.reader.w >= 420 - 0.5 || near(g.board.w, 360)), `board=${g.board.w} reader=${g.reader.w}`)
  check(`${tag} R-e PDF 适配宽度、无横向滚动`, g.pdf && g.pdf.fitting === true && g.pdf.sw <= g.pdf.cw + 1, JSON.stringify(g.pdf))
  check(`${tag} R-e/R1 分屏行为不变：内宽 < 960 时页面贴满内宽（差 < 1%）`, g.pdf.inner < 960 && g.pdf.pageW <= g.pdf.inner && g.pdf.pageW >= g.pdf.inner * 0.99 - 7, JSON.stringify(g.pdf))
  await shot('split')

  // ---- 拖到阅读器最小：白板尽量宽，阅读器停在 420（放不下时白板保 360） ----
  const sep = await page.locator('.studio-splitter').boundingBox()
  await page.mouse.move(sep.x + 4, sep.y + 200); await page.mouse.down(); await page.mouse.move(w - 20, sep.y + 200, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(800)
  m = await measure(page); g = await geometry(page)
  assertLayout(`${tag} 拖到阅读器最小`, m); assertCommon(`${tag} 拖到阅读器最小`, g)
  const inner = g.center.w - 2
  check(`${tag} R-d 拖到最右：白板 = max(360, 内宽−420)，阅读器得其余`, near(g.board.w, Math.max(360, inner - 420), 1) && near(g.reader.w, inner - Math.max(360, inner - 420), 1), `board=${g.board.w} reader=${g.reader.w} inner=${inner}`)
  check(`${tag} R-e 拖动后重新适配、无横向滚动`, g.pdf.fitting === true && g.pdf.sw <= g.pdf.cw + 1, JSON.stringify(g.pdf))
  check(`${tag} R-d localStorage 记住比例（= 白板段 / 内宽）`, near(JSON.parse(g.panes).ratio * inner, g.board.w, 1), g.panes)
  await shot('split-reader-min')
  // 拖到最左：白板停在 360
  const sep2 = await page.locator('.studio-splitter').boundingBox()
  await page.mouse.move(sep2.x + 4, sep2.y + 200); await page.mouse.down(); await page.mouse.move(20, sep2.y + 200, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(600)
  g = await geometry(page)
  check(`${tag} R-d 拖到最左：白板停在 360`, near(g.board.w, 360, 1), `board=${g.board.w}`)
  await page.locator('.studio-splitter').dblclick(); await page.waitForTimeout(600)
  g = await geometry(page)
  check(`${tag} R-d 双击回到各一半`, JSON.parse(g.panes).ratio === 0.5, g.panes)

  // ---- 手动缩放后不再自动适配；「适配宽度」回到适配 ----
  await page.locator('.studio-reader .pdf-zoom-btn[aria-label="放大"]').click(); await page.waitForTimeout(600)
  const zoomed = (await geometry(page)).pdf
  await page.keyboard.press('Meta+b'); await page.waitForTimeout(900)
  const kept = (await geometry(page)).pdf
  check(`${tag} R-e 手动缩放后宽度变化不再改缩放`, zoomed.fitting === false && kept.zoom === zoomed.zoom, `${zoomed.zoom} → ${kept.zoom}`)
  await page.keyboard.press('Meta+b'); await settle(page)
  await page.locator('.studio-reader .pdf-fit-btn').click(); await page.waitForTimeout(800)
  g = await geometry(page)
  check(`${tag} R-e 「适配宽度」回到适配`, g.pdf.fitting === true && g.pdf.sw <= g.pdf.cw + 1 && g.pdf.zoom !== zoomed.zoom, JSON.stringify(g.pdf))

  // ---- 铺满：白板隐藏但保持挂载与相机；中栏头部只剩阅读器头；Esc 回分屏 ----
  await page.locator('.board-zoom button[aria-label="缩小"]').click(); await page.waitForTimeout(300)
  const cameraBefore = (await geometry(page)).camera
  await page.locator('.studio-reader button[aria-label="铺满中栏"]').click(); await page.waitForTimeout(900)
  m = await measure(page); g = await geometry(page)
  assertLayout(`${tag} 铺满`, m, { board: false }); assertCommon(`${tag} 铺满`, g)
  check(`${tag} R-a 铺满：白板隐藏、仍挂载，阅读器占满中栏，无分段控件`, !g.boardShown && g.boardMounted && near(g.reader.w, g.center.w - 2, 1) && !g.seg, `reader=${g.reader.w} center=${g.center.w} seg=${g.seg}`)
  check(`${tag} R-e 铺满后重新适配、无横向滚动`, g.pdf.fitting === true && g.pdf.sw <= g.pdf.cw + 1, JSON.stringify(g.pdf))
  check(`${tag} R1 铺满：页宽 ≤ min(内宽, 960) 且居中`, g.pdf.pageW <= Math.min(g.pdf.inner, 960) && g.pdf.offCenter <= 1, JSON.stringify(g.pdf))
  check(`${tag} R-b 铺满后按钮换成还原`, g.order.includes('还原分屏 Esc'), JSON.stringify(g.order))
  await shot('full')

  // ---- 铺满 + 两侧收起（沉浸） ----
  await page.keyboard.press('Meta+b'); await page.keyboard.press('Meta+Alt+b'); await page.waitForTimeout(900)
  m = await measure(page); g = await geometry(page)
  assertLayout(`${tag} 铺满+两侧收起`, m, { board: false }); assertCommon(`${tag} 铺满+两侧收起`, g)
  check(`${tag} R-c/K5 沉浸：阅读器 = 视口 − 16，展开按钮在阅读器头两端可聚焦`, near(g.center.l, 8) && near(g.center.r, w - 8) && g.reopenLeft && g.reopenRight && g.focusLeft && g.focusRight, `${g.center.l}–${g.center.r}`)
  check(`${tag} R-e 沉浸后重新适配、无横向滚动`, g.pdf.fitting === true && g.pdf.sw <= g.pdf.cw + 1, JSON.stringify(g.pdf))
  check(`${tag} R1 沉浸：页宽封顶 960（内宽 > 960）且居中`, g.pdf.inner > 960 && g.pdf.pageW <= 960 && g.pdf.pageW >= 950 && g.pdf.offCenter <= 1, JSON.stringify(g.pdf))
  await shot('full-immersive')
  await page.keyboard.press('Escape'); await page.waitForTimeout(900)
  g = await geometry(page)
  check(`${tag} R-c Esc 回到分屏，白板相机不变`, g.boardShown && !!g.reader && g.camera === cameraBefore, `camera ${cameraBefore} → ${g.camera}`)
  await page.keyboard.press('Meta+b'); await page.keyboard.press('Meta+Alt+b'); await settle(page)
  await page.locator('.studio-reader button[aria-label="关闭阅读器"]').click()

  check(`${tag} 页面无脚本错误`, !errors.length, errors.join('; '))
  await context.close()
}
await browser.close()
console.log(results.join('\n'))
console.log(failed ? `\n${failed} 项未过` : '\n全部通过')
process.exitCode = failed ? 1 : 0
