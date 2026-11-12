/**
 * [INPUT]: 真实 PdfViewer 与 pdf.js 4.10.38（Node 下走同进程 worker）、按规范拼出的单页 PDF、jsdom 与可触发的 ResizeObserver
 * [OUTPUT]: R-e 证据——不传 fit 时初始仍是 130%；传 fit 时按第 1 页宽度适配容器内宽（显示宽度封顶 960，1400 宽容器只到 156%），容器宽度变化重新适配；手动缩放后不再自动适配，「适配宽度」回到适配；没渲染的页也跟着缩放
 * [POS]: PdfViewer 的组件级验收；jsdom 没有 canvas，只验缩放与页尺寸，像素由浏览器断言脚本核对
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { createElement, act } from 'react'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'getComputedStyle', 'navigator']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
// ---- 可触发的 ResizeObserver 与可设定的容器宽度（jsdom 不排版） ----
const observers = new Set<() => void>()
let width = 600
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class { callback: () => void; constructor(callback: () => void) { this.callback = callback } observe() { observers.add(this.callback) } unobserve() {} disconnect() { observers.delete(this.callback) } },
  IntersectionObserver: class { observe() {} disconnect() {} },
})
Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.classList.contains('pdf-scroll') ? width : 0 } })
// jsdom 没有 canvas：getContext 返回 null，PdfPage 只定尺寸不画像素
Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null })
after(() => dom.window.close())

// pdf.js 的 worker 入口：`?url` 指向真实 worker 文件，Node 下由 pdf.js 同进程加载
const worker = pathToFileURL(createRequire(import.meta.url).resolve('pdfjs-dist/build/pdf.worker.min.mjs')).href
register('./helpers/tsx-loader.mjs', import.meta.url)
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(specifier, context, next) { if (specifier.endsWith('?url')) return { url: 'data:text/javascript,export default ${JSON.stringify(worker)}', shortCircuit: true }; return next(specifier, context) }`), import.meta.url)
const { createRoot } = await import('react-dom/client')
const { PdfViewer, fitScale } = await import('../src/components/PdfViewer.tsx')

/** 按 PDF 1.4 结构拼两页 Letter（612×792）文档，xref 偏移按字节计算 */
function letterPdf(pages = 2): Blob {
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i} 0 R`).join(' ')
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`,
    ...Array.from({ length: pages }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>')]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((object, i) => { const at = body.length; body += `${i + 1} 0 obj\n${object}\nendobj\n`; return at })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(at => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Blob([body], { type: 'application/pdf' })
}

async function until(check: () => boolean, message: string, ms = 10000) {
  const limit = Date.now() + ms
  while (!check()) {
    if (Date.now() > limit) throw new Error(message)
    await act(async () => { await delay(20) })
  }
}

async function mount(fit: boolean) {
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  await act(async () => root.render(createElement(PdfViewer, { blob: letterPdf(), fit })))
  await until(() => !!element.querySelector('.pdf-pages'), 'PDF 没有载入')
  const zoom = () => element.querySelector('.pdf-zoom-val')!.textContent
  const pages = () => [...element.querySelectorAll<HTMLElement>('.pdf-page')].map(page => Math.round(parseFloat(page.style.width)))
  const button = (label: string) => [...element.querySelectorAll<HTMLButtonElement>('button')].find(item => item.getAttribute('aria-label') === label || item.textContent === label)
  return { element, zoom, pages, button, unmount: async () => { await act(async () => root.unmount()); element.remove() } }
}
async function resize(next: number) { width = next; await act(async () => { for (const callback of observers) callback() }) }

test('fitScale：内宽 ÷ 页宽向下取整到 1%，可以低于手动下限 60%', () => {
  assert.equal(fitScale(612, 612), 1)
  assert.equal(fitScale(342, 612), 0.55)
  assert.equal(fitScale(100, 612), 0.3)
  // 960px 封顶：再宽的容器也只放到 960 / 612 ≈ 156%
  assert.equal(fitScale(1400, 612), 1.56)
  assert.equal(fitScale(5000, 612), 1.56)
})

test('不传 fit：初始仍是 130%，没有「适配宽度」按钮，宽度变化不改缩放', { timeout: 30000 }, async () => {
  width = 600
  const view = await mount(false)
  try {
    assert.equal(view.zoom(), '130%')
    assert.equal(view.button('适配宽度'), undefined)
    await resize(300)
    await act(async () => { await delay(100) })
    assert.equal(view.zoom(), '130%')
  } finally { await view.unmount() }
})

test('传 fit：按宽适配并随宽度重新适配；手动缩放后停止，「适配宽度」回到适配；没渲染的页也跟着缩放', { timeout: 30000 }, async () => {
  width = 600
  const view = await mount(true)
  try {
    // jsdom 的计算样式没有内边距：内宽即容器宽
    await until(() => view.zoom() === '98%', `没有按 600px 适配：${view.zoom()}`)
    assert.deepEqual(view.pages(), [600, 600], '两页（含懒渲染的第 2 页）都按适配缩放')
    assert.ok(view.button('适配宽度')!.disabled, '适配中按钮不可再点')
    await resize(366)
    await until(() => view.zoom() === '59%', `宽度变化没有重新适配：${view.zoom()}`)
    assert.ok(view.pages().every(w => w <= 366), `页宽超出容器：${view.pages()}`)

    await act(async () => view.button('放大')!.click())
    assert.equal(view.zoom(), '79%')
    await resize(800)
    await act(async () => { await delay(100) })
    assert.equal(view.zoom(), '79%', '手动缩放后不再自动适配')
    assert.ok(!view.button('适配宽度')!.disabled)

    await act(async () => view.button('适配宽度')!.click())
    await until(() => view.zoom() === '130%', `「适配宽度」没有回到适配：${view.zoom()}`)

    // ---- 很宽的容器（铺满 + 两侧收起）：页面显示宽度封顶 960，不撑满 ----
    await resize(1400)
    await until(() => view.zoom() === '156%', `宽容器下没有封顶：${view.zoom()}`)
    assert.ok(view.pages().every(w => w <= 960), `页宽超过 960：${view.pages()}`)
  } finally { await view.unmount() }
})
