/**
 * [INPUT]: the product kit and objects (src/mastra/studio/objects/: BASE, boxSvg/BOX_CSS, easelSvg/EASEL_CSS) and the zh object labels
 * [OUTPUT]: writes scripts/objects/easel.html: the easel next to the takeaway box at the same scale (both viewBoxes 320 wide in 320px hosts), click to open, buttons for
 *           rest / hover / open and two pinned mid-states; ?set=--iso-brush:50,--iso-tilt:7 pins variables and turns transitions off for screenshots
 * [POS]: O5's review page, not shipped (scripts/ is outside the bundle); regenerate after changing easel.ts: node --experimental-strip-types scripts/objects/easel-page.mts
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { writeFileSync } from 'node:fs'
import { BASE } from '../../src/mastra/studio/objects/iso.ts'
import { boxSvg, BOX_CSS } from '../../src/mastra/studio/objects/box.ts'
import { easelSvg, EASEL_CSS } from '../../src/mastra/studio/objects/easel.ts'
import { zh } from '../../src/i18n/locales/zh.ts'

const labels = zh.studio.objects
const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Easel · Lumen objects</title>
<style>
body { margin: 0; padding: 24px; background: #f3efe7; font: 13px -apple-system, "PingFang SC", sans-serif; color: #2b2d31; }
body.dark { background: #1d1c1a; color: #e8e4dc; }
.row { display: flex; gap: 32px; align-items: flex-end; }
.cell { width: 320px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.name { color: #8a8d95; }
.bench { margin-top: 18px; display: flex; gap: 6px; flex-wrap: wrap; }
.bench button { font: inherit; border: 1px solid rgba(60,48,30,.16); background: transparent; border-radius: 8px; padding: 3px 10px; cursor: pointer; color: inherit; }
${BASE}
${BOX_CSS}
${EASEL_CSS}
</style></head>
<body>
<div class="row">
  <div class="cell"><div class="iso-host" id="box" style="width:320px">${boxSvg({ labels: labels.box, words: { stamp: labels.box.stamp('11-17'), lines: ['预测往下走，误差往上报，', '大脑多半时间在猜。'] } })}</div><div class="name">沉淀盒 · 320</div></div>
  <div class="cell"><div class="iso-host" id="easel" style="width:320px">${easelSvg()}</div><div class="name">画架 · 320</div></div>
</div>
<div class="bench">
  <button data-set="">rest</button><button data-set="--iso-tilt:7">hover</button><button data-open>open (click)</button>
  <button data-set="--iso-tilt:7,--iso-brush:20,--iso-wet:1">mid lift</button><button data-set="--iso-tilt:7,--iso-brush:52,--iso-wet:1">mid stroke</button>
  <button data-dark>dark</button>
</div>
<script>
const hosts = document.querySelectorAll('.iso-host')
hosts.forEach(h => h.addEventListener('click', () => h.toggleAttribute('data-open')))
function pin(spec) {
  const svg = document.querySelector('#easel .iso')
  svg.style.cssText = ''
  if (!spec) return
  svg.style.transition = 'none'
  for (const kv of spec.split(',').filter(Boolean)) { const [k, v] = kv.split(':'); svg.style.setProperty(k, v) }
}
document.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => { document.querySelector('#easel').removeAttribute('data-open'); pin(b.dataset.set) }))
document.querySelector('[data-open]').addEventListener('click', () => { pin(''); document.querySelector('#easel').toggleAttribute('data-open') })
document.querySelector('[data-dark]').addEventListener('click', () => document.body.classList.toggle('dark'))
const q = new URLSearchParams(location.search)
if (q.get('set')) pin(q.get('set'))
if (q.has('open')) document.querySelector('#easel').setAttribute('data-open', '')
if (q.has('dark')) document.body.classList.add('dark')
</script>
</body></html>
`
writeFileSync(new URL('./easel.html', import.meta.url), page)
console.log('wrote', new URL('./easel.html', import.meta.url).pathname)
