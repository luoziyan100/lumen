/**
 * [INPUT]: the music set (src/mastra/studio/objects/music/: MUSIC_OBJECTS, MUSIC_CSS, count) and the zh box labels for the music box card
 * [OUTPUT]: writes scripts/objects/music.html: the eight music objects, each in a host at its product width with its slot, primitive count and line-weight tiers; click a host to open it.
 *           A "声音" switch (top right, off by default) sounds every motion (hover, click, typing, the loops) through the product's sound.ts, bundled into the page by esbuild: each host
 *           reports { hover, open, typing } to motionMusic as IsoObject does in the app. window.__music exposes that module (and MUSIC_SCORES) for the audio evidence and checks.
 *           Query: ?only=<slot> shows one object; ?center centres the row in the window; ?open opens every object; ?typing sets is-typing on every host; ?dark switches tokens and canvas to the dark skin;
 *           ?w=<px> overrides the host width; ?sound starts with the switch on
 * [POS]: the music set's design page (contract step 2), not shipped (scripts/ is outside the bundle); music-shots.mts drives it. Regenerate after changing an object:
 *        node --experimental-strip-types scripts/objects/music-page.mts
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { writeFileSync } from 'node:fs'
import { buildSync } from 'esbuild'
import { MUSIC_OBJECTS, MUSIC_CSS } from '../../src/mastra/studio/objects/music/index.ts'
import { count } from '../../src/mastra/studio/objects/music/line.ts'
import { zh } from '../../src/i18n/locales/zh.ts'

const labels = zh.studio.objects
const words = { stamp: labels.box.stamp('11-17'), lines: ['预测往下走，误差往上报，', '大脑多半时间在猜。'] }
const tiers = (markup: string) => [...new Set([...markup.matchAll(/class="[^"]*\b(w[0-3])\b/g)].map(m => m[1]))].sort().join(' ')
const cells = MUSIC_OBJECTS.map(o => {
  const markup = o.svg({ words })
  return `<div class="cell" data-id="${o.slot}" style="width:${o.width}px"><div class="iso-host" id="${o.slot}" style="width:${o.width}px">${markup}</div>` +
    `<div class="name">${o.slot} · ${o.label} · ${count(markup)} · ${tiers(markup)}</div></div>`
}).join('\n')

const sound = buildSync({
  stdin: { contents: "import * as sound from './sound.ts'; import { MUSIC_SCORES } from './index.ts'; window.__music = { ...sound, MUSIC_SCORES }", resolveDir: new URL('../../src/mastra/studio/objects/music/', import.meta.url).pathname, loader: 'ts' },
  bundle: true, format: 'iife', write: false, platform: 'browser', target: 'es2022',
}).outputFiles[0]!.text

const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Music objects · Lumen</title>
<style>
body { margin: 0; padding: 24px; background: #F3EFE7; font: 13px -apple-system, "PingFang SC", sans-serif; --text: #292720; --surface-base: #F8F5EE; color: var(--text); }
body.dark { background: #0f1115; --text: #E8EAEE; --surface-base: #14161C; }
.row { display: flex; gap: 28px; align-items: flex-end; flex-wrap: wrap; width: 1340px; }
.cell { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.iso-host { position: relative; cursor: pointer; user-select: none; }
.name { color: #8a8d95; font: 11px ui-monospace, Menlo, monospace; }
.hide { display: none; }
body.center { height: 100vh; box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
body.center .row { width: auto; justify-content: center; }
.sound { position: fixed; top: 12px; right: 16px; display: flex; gap: 6px; align-items: center; color: #8a8d95; font: 12px -apple-system, "PingFang SC", sans-serif; user-select: none; }
${MUSIC_CSS}
</style></head>
<body>
<label class="sound"><input type="checkbox" id="sound"> 声音</label>
<div class="row">
${cells}
</div>
<script>${sound.replace(/<\/script/g, '<\\/script')}</script>
<script>
const toggle = document.getElementById('sound')
const report = h => { if (toggle.checked) __music.motionMusic(h.id, { hover: h.matches(':hover'), open: h.hasAttribute('data-open'), typing: h.classList.contains('is-typing') }, h) }
toggle.addEventListener('change', () => { if (toggle.checked) { __music.warmMusic(); __music.unlockMusic(); document.querySelectorAll('.iso-host').forEach(report) } else __music.muteMusic() })
document.querySelectorAll('.iso-host').forEach(h => {
  h.addEventListener('mousedown', e => e.preventDefault())
  h.addEventListener('pointerenter', () => setTimeout(() => report(h)))
  h.addEventListener('pointerleave', () => setTimeout(() => report(h)))
  h.addEventListener('click', () => { h.toggleAttribute('data-open'); report(h) })
})
const q = new URLSearchParams(location.search)
if (q.has('sound')) { toggle.checked = true; __music.warmMusic(); __music.armMusic() }
if (q.has('center')) document.body.classList.add('center')
if (q.get('only')) document.querySelectorAll('.cell').forEach(c => { if (c.dataset.id !== q.get('only')) c.classList.add('hide') })
if (q.get('w')) document.querySelectorAll('.cell, .iso-host').forEach(n => { n.style.width = q.get('w') + 'px' })
if (q.has('open')) document.querySelectorAll('.iso-host').forEach(h => h.setAttribute('data-open', ''))
if (q.has('typing')) document.querySelectorAll('.iso-host').forEach(h => h.classList.add('is-typing'))
if (q.has('dark')) document.body.classList.add('dark')
</script>
</body></html>
`
writeFileSync(new URL('./music.html', import.meta.url), page)
console.log('wrote', new URL('./music.html', import.meta.url).pathname)
