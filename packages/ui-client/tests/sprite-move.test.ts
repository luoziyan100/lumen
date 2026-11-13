/**
 * [INPUT]: 真实 useSpriteMove（React 19 + jsdom）、假 Element.animate（按 node:test 假计时器推进，可 reverse）
 * [OUTPUT]: M2/M5/M6/M7/M8/M11/M12 的交互证据——≤4px 是点、打开；>4px 是拖、不打开、只写 transform 不重渲染、松手才写锚点；
 *           pointercancel 停在最后位置；拖浮窗标题栏带着锚点走；Alt+方向键 16px；展开中途收起是倒放同一组动画、不叠第二层；减弱动效只淡 120ms；没有 animate 时直接到终态
 * [POS]: 精灵交互层的单元验收；纯几何在 sprite-place.test.ts，真实动画帧与长任务在浏览器断言脚本
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test, { after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createElement, act, useCallback, useState, Fragment } from 'react'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
after(() => dom.window.close())
register('./helpers/tsx-loader.mjs', import.meta.url)
const { createRoot } = await import('react-dom/client')
const { useSpriteMove } = await import('../src/mastra/studio/useSpriteMove.ts')
const { DEFAULT_SHAPE, ORB, anchorAt, anchorOfWindow, orbPoint, windowAt } = await import('../src/mastra/studio/sprite-place.ts')
type Shape = typeof DEFAULT_SHAPE

// ---- 假 Web Animations：每 16ms 推进一帧，reverse 从当前进度倒放，到头触发 onfinish ----
const created: FakeAnimation[] = []
class FakeAnimation {
  playState = 'running'; currentTime = 0; rate = 1; onfinish: (() => void) | null = null
  readonly keyframes: Keyframe[]; readonly duration: number; readonly target: Element
  constructor(target: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    this.target = target; this.keyframes = keyframes; this.duration = Number(options.duration)
    created.push(this); this.tick()
  }
  tick() {
    setTimeout(() => {
      if (this.playState !== 'running') return
      this.currentTime = Math.max(0, Math.min(this.duration, this.currentTime + 16 * this.rate))
      if ((this.rate > 0 && this.currentTime >= this.duration) || (this.rate < 0 && this.currentTime <= 0)) { this.playState = 'finished'; this.onfinish?.() }
      else this.tick()
    }, 16)
  }
  reverse() { this.rate = -this.rate }
  cancel() { this.playState = 'idle' }
}
function withAnimate(enabled: boolean) {
  const proto = dom.window.HTMLElement.prototype as unknown as { animate?: unknown }
  if (enabled) proto.animate = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) { return new FakeAnimation(this, keyframes, options) }
  else delete proto.animate
}

let renders = 0, shape: Shape = DEFAULT_SHAPE
function Harness({ initial, reduced }: { initial: Shape; reduced: boolean }) {
  const [state, setState] = useState(initial)
  const commit = useCallback((patch: Partial<Shape>) => setState(previous => ({ ...previous, ...patch })), [])
  const move = useSpriteMove(state, commit, reduced)
  renders++; shape = state
  return createElement(Fragment, null,
    move.phase !== 'open' && createElement('button', { ref: move.orbRef, className: 'orb', 'data-phase': move.phase, ...move.orbHandlers }),
    move.phase !== 'closed' && createElement('section', { ref: move.winRef, className: 'win', 'data-phase': move.phase },
      createElement('header', { className: 'head', ...move.headHandlers }, createElement('button', { className: 'close', onClick: () => move.setOpen(false) }))))
}

async function mount(initial: Shape = DEFAULT_SHAPE, reduced = false) {
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  await act(async () => root.render(createElement(Harness, { initial, reduced })))
  const $ = (selector: string) => element.querySelector<HTMLElement>(selector)
  return { $, count: (selector: string) => element.querySelectorAll(selector).length, unmount: async () => { await act(async () => root.unmount()); element.remove() } }
}
const fire = (target: Element, type: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  act(async () => { target.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra })) })
/** 一帧一帧推进：node 的假计时器 tick 不会执行在 tick 期间新排的定时器 */
const advance = (ms: number) => act(async () => { for (let t = 0; t < ms; t += 16) mock.timers.tick(16) })
const VW = 1024, VH = 768   // jsdom 的视口

test.beforeEach(() => { created.length = 0; mock.timers.enable({ apis: ['setTimeout'] }) })
test.afterEach(() => { mock.timers.reset(); withAnimate(false) })

test('≤4px 是点：打开；>4px 是拖：不打开，拖动中只写 transform、不重渲染，松手才写锚点', async () => {
  withAnimate(true)
  const view = await mount()
  const orb = view.$('.orb')!, start = orbPoint(DEFAULT_SHAPE.anchor, VW, VH)
  // ---- 拖：按下 → 移动 200 次 → 松手 ----
  await fire(orb, 'pointerdown', start.x + 26, start.y + 26)
  const before = renders
  for (let i = 1; i <= 200; i++) await fire(orb, 'pointermove', start.x + 26 - i, start.y + 26 - i)
  assert.equal(renders, before, '拖动中不重渲染')
  assert.equal(orb.style.transform, 'translate(-200px, -200px)')
  assert.ok(orb.classList.contains('is-dragging'))
  await fire(orb, 'pointerup', start.x + 26 - 200, start.y + 26 - 200)
  await fire(orb, 'click', start.x + 26 - 200, start.y + 26 - 200)
  assert.equal(view.count('.win'), 0, '拖完不打开')
  assert.deepEqual(orbPoint(shape.anchor, VW, VH), { x: start.x - 200, y: start.y - 200 })
  assert.equal(orb.style.transform, '', '松手后由锚点定位，临时 transform 清掉')
  assert.ok(!orb.classList.contains('is-dragging'))
  // ---- 点：移动 3px 仍算点 ----
  await fire(orb, 'pointerdown', 300, 300); await fire(orb, 'pointermove', 303, 300); await fire(orb, 'pointerup', 303, 300); await fire(orb, 'click', 303, 300)
  assert.equal(view.$('.win')?.dataset.phase, 'opening')
  assert.equal(created.length, 2, '浮窗与头像各一段动画')
  await advance(400)
  assert.deepEqual([view.$('.win')?.dataset.phase, view.count('.orb')], ['open', 0])
  assert.equal(shape.open, true)
  await view.unmount()
})

test('pointercancel 停在最后的位置；拖动夹在视口 8px 之内', async () => {
  const view = await mount()
  const orb = view.$('.orb')!, start = orbPoint(DEFAULT_SHAPE.anchor, VW, VH)
  await fire(orb, 'pointerdown', start.x, start.y)
  await fire(orb, 'pointermove', start.x - 120, start.y - 40)
  await fire(orb, 'pointercancel', start.x - 120, start.y - 40)
  assert.deepEqual(orbPoint(shape.anchor, VW, VH), { x: start.x - 120, y: start.y - 40 })
  await fire(orb, 'pointerdown', 100, 100); await fire(orb, 'pointermove', 5000, -5000); await fire(orb, 'pointerup', 5000, -5000)
  assert.deepEqual(orbPoint(shape.anchor, VW, VH), { x: VW - 8 - ORB, y: 8 })
  await view.unmount()
})

test('拖浮窗标题栏：只写 transform，松手后锚点跟着走，收起后头像在新锚点', async () => {
  const initial = { ...DEFAULT_SHAPE, open: true, anchor: anchorAt({ x: 900, y: 650 }, VW, VH) }
  const view = await mount(initial)
  const head = view.$('.head')!, frame = windowAt(orbPoint(initial.anchor, VW, VH), initial, VW, VH)
  await fire(head, 'pointerdown', 500, 300)
  const before = renders
  await fire(head, 'pointermove', 300, 200)
  assert.equal(renders, before)
  assert.equal(view.$('.win')!.style.transform, 'translate(-200px, -100px)')
  await fire(head, 'pointerup', 300, 200)
  const expected = anchorOfWindow({ ...frame, x: frame.x - 200, y: frame.y - 100 }, VW, VH)
  assert.deepEqual(shape.anchor, expected)
  const moved = windowAt(orbPoint(shape.anchor, VW, VH), shape, VW, VH)
  assert.deepEqual([moved.x, moved.y], [frame.x - 200, frame.y - 100], '新锚点算出的浮窗就在拖到的地方')
  // 标题栏上的按钮不开始拖
  await fire(view.$('.close')!, 'pointerdown', 10, 10); await fire(head, 'pointermove', 400, 400); await fire(head, 'pointerup', 400, 400)
  assert.deepEqual(shape.anchor, expected)
  await act(async () => view.$('.close')!.click())   // 没有 animate：直接收起
  assert.equal(view.count('.win'), 0)
  assert.equal(view.count('.orb'), 1)
  await view.unmount()
})

test('Alt+方向键每次 16px 并保存；不带 Alt 不动', async () => {
  const view = await mount({ ...DEFAULT_SHAPE, anchor: anchorAt({ x: 200, y: 200 }, VW, VH) })
  const orb = view.$('.orb')!
  const key = (init: KeyboardEventInit) => act(async () => { orb.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })) })
  await key({ key: 'ArrowRight', altKey: true }); await key({ key: 'ArrowDown', altKey: true })
  assert.deepEqual(orbPoint(shape.anchor, VW, VH), { x: 216, y: 216 })
  await key({ key: 'ArrowRight' })
  assert.deepEqual(orbPoint(shape.anchor, VW, VH), { x: 216, y: 216 })
  await view.unmount()
})

test('展开中途收起：倒放同一组动画，不另起一层；再点头像又倒回展开', async () => {
  withAnimate(true)
  const view = await mount()
  await act(async () => view.$('.orb')!.click())
  await advance(112)
  const [win, orb] = created
  assert.ok(win && orb && win.currentTime > 0 && win.currentTime < 260)
  await act(async () => view.$('.close')!.click())
  assert.equal(created.length, 2, '没有新动画')
  assert.deepEqual([win.rate, orb.rate], [-1, -1])
  assert.equal(view.count('.win'), 1, '只有一层浮窗')
  assert.equal(view.$('.win')!.dataset.phase, 'closing')
  await advance(48)
  await act(async () => view.$('.orb')!.click())   // 收起中再点头像：又倒回去
  assert.deepEqual([win.rate, created.length, view.count('.win')], [1, 2, 1])
  await advance(400)
  assert.equal(view.$('.win')!.dataset.phase, 'open')
  assert.equal(shape.open, true)
  // 正常收起：200ms 缓入，结束后浮窗卸载、头像回来
  await act(async () => view.$('.close')!.click())
  const closing = created[2]!
  assert.deepEqual([closing.duration, closing.keyframes[0]], [200, { transform: 'scale(1)', opacity: 1 }])
  await advance(300)
  assert.deepEqual([view.count('.win'), view.count('.orb'), shape.open], [0, 1, false])
  await view.unmount()
})

test('减弱动效：两向都只淡 120ms，不缩放', async () => {
  withAnimate(true)
  const view = await mount(DEFAULT_SHAPE, true)
  await act(async () => view.$('.orb')!.click())
  assert.deepEqual(created.map(anim => anim.duration), [120, 120])
  for (const anim of created) for (const frame of anim.keyframes) assert.deepEqual(Object.keys(frame), ['opacity'])
  await advance(200)
  assert.equal(view.$('.win')!.dataset.phase, 'open')
  await view.unmount()
})

test('卸载时取消进行中的动画', async () => {
  withAnimate(true)
  const view = await mount()
  await act(async () => view.$('.orb')!.click())
  await advance(32)
  await view.unmount()
  assert.ok(created.every(anim => anim.playState === 'idle'))
})
