/**
 * [INPUT]: the product kit and objects (src/mastra/studio/objects/: BASE, the takeaway box and the easel for scale, and the four view objects) and the zh box labels
 * [OUTPUT]: writes scripts/objects/views.html: the box and the easel, then the press, cork board, lamp and type case, each in a 320px host with its name and shape count;
 *           click a host to open it. Query: ?only=press shows one object beside the box and the easel; ?set=--iso-lift:.5,--iso-spin:1 pins variables on every
 *           object and turns transitions off; ?open opens every new object; ?hover pins each new object's hover values; ?dark switches to the dark canvas
 * [POS]: V1–V4's design page, not shipped (scripts/ is outside the bundle); views-shots.mts drives it. Regenerate after changing an object:
 *        node --experimental-strip-types scripts/objects/views-page.mts
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { writeFileSync } from 'node:fs'
import { BASE } from '../../src/mastra/studio/objects/iso.ts'
import { boxSvg, BOX_CSS } from '../../src/mastra/studio/objects/box.ts'
import { easelSvg, EASEL_CSS } from '../../src/mastra/studio/objects/easel.ts'
import { VIEW_OBJECTS } from './view-objects.ts'
import { zh } from '../../src/i18n/locales/zh.ts'

const labels = zh.studio.objects
const cell = (id: string, name: string, markup: string) => `<div class="cell" data-id="${id}"><div class="iso-host" id="${id}">${markup}</div><div class="name">${name}</div></div>`
const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>View objects · Lumen</title>
<style>
body { margin: 0; padding: 24px; background: #f3efe7; font: 13px -apple-system, "PingFang SC", sans-serif; color: #2b2d31; }
body.dark { background: #1d1c1a; color: #e8e4dc; }
.row { display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap; width: 1100px; }
.cell { width: 320px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.cell .iso-host { width: 320px; }
.name { color: #8a8d95; }
.hide { display: none; }
${BASE}
${BOX_CSS}
${EASEL_CSS}
${VIEW_OBJECTS.map(o => o.css).join('\n')}
</style></head>
<body>
<div class="row">
  ${cell('box', '沉淀盒 · 320', boxSvg({ labels: labels.box, words: { stamp: labels.box.stamp('11-17'), lines: ['预测往下走，误差往上报，', '大脑多半时间在猜。'] } }))}
  ${cell('easel', '画架 · 320', easelSvg())}
  ${VIEW_OBJECTS.map(o => cell(o.id, `${o.name} · 320`, o.markup)).join('\n  ')}
</div>
<script>
const HOVER = ${JSON.stringify(Object.fromEntries(VIEW_OBJECTS.map(o => [o.id, o.hover])))}
const NEW = Object.keys(HOVER)
document.querySelectorAll('.iso-host').forEach(h => h.addEventListener('click', () => h.toggleAttribute('data-open')))
document.querySelectorAll('.cell').forEach(c => { const svg = c.querySelector('svg'); c.querySelector('.name').textContent += ' · ' + svg.querySelectorAll('path,rect,circle,ellipse,line,polygon,polyline,text').length })
const pin = (svg, spec) => { svg.style.transition = 'none'; for (const kv of spec.split(',').filter(Boolean)) { const [k, v] = kv.split(':'); svg.style.setProperty(k, v) } }
const q = new URLSearchParams(location.search)
if (q.get('only')) document.querySelectorAll('.cell').forEach(c => { if (NEW.includes(c.dataset.id) && c.dataset.id !== q.get('only')) c.classList.add('hide') })
for (const id of NEW) {
  const svg = document.querySelector('#' + id + ' svg')
  if (q.has('hover')) pin(svg, HOVER[id])
  if (q.get('set')) pin(svg, q.get('set'))
  if (q.has('open')) document.querySelector('#' + id).setAttribute('data-open', '')
}
if (q.has('dark')) document.body.classList.add('dark')
</script>
</body></html>
`
writeFileSync(new URL('./views.html', import.meta.url), page)
console.log('wrote', new URL('./views.html', import.meta.url).pathname)
