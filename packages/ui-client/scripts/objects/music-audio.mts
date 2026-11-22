/**
 * [INPUT]: scripts/objects/music.html (run music-page.mts first; it carries the product's sound.ts as window.__music); playwright-core from /tmp/lumen-s0-pw with Chromium 1228 and
 *          Playwright's WebKit build; the yardstick of objects/music/meter.ts and the pitch map of objects/music/pitch.ts; ffmpeg on PATH for the videos
 * [OUTPUT]: in <evidence-dir>: <slot>-<part>.wav for every sound of every object (open, close, hoverIn, loop0…: one pass), rendered by an OfflineAudioContext through the product's
 *           Player at 44.1 kHz, 16-bit mono; measure.json and table.md (per part: length, peak, gated RMS; per cue: time, part, pitch, measured onset and pitch; per loop: run and rest).
 *           With VIDEO=1, state runs as video plus their own audio (<name>.wav and <name>.mp4, 1440×900, the object centred, 30 fps): <slot>-hover (12 s), <slot>-open (hover, click at
 *           1.2 s; 15 s after the click for box, gramophone and cello), reading-typing (20 s). Frames step every animation paused at k/30 s after its state began, and the audio is the
 *           engine's own plan of the same state run (planMotion → renderPlan), so picture and sound share one clock.
 *           Checks: onset within 10 ms of each cue, pitch within 1%, peak −24…−14 dBFS and no sample at ±1 for every part, open RMS spread ≤ 6 dB, one-shots within the score's limit,
 *           loop passes within their run, rests ≥ max(run, 4 s), harp and violin closing silent; exit 1 on a failed check
 * [POS]: the listening gate's evidence and the offline half of the browser measurements, not shipped. Each cue's onset and pitch are measured on a render of that cue alone at its
 *        scheduled time (the glissando's strings are 18 ms apart, too close to separate in the mix); loudness and clipping are measured on the whole part.
 *        Usage: node --experimental-strip-types scripts/objects/music-audio.mts <evidence-dir> (ONLY=chromium|webkit, SLOT=<slot>, VIDEO=1, SCENE=hover|open|typing)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { chromium, webkit } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { MUSIC_SCORES, type MusicSlot } from '../../src/mastra/studio/objects/music/index.ts'
import { onset, peakDb, pitch, rmsDb } from '../../src/mastra/studio/objects/music/meter.ts'
import { hz, pitchOf, type Motion } from '../../src/mastra/studio/objects/music/pitch.ts'
import { partCues, partsOf } from '../../src/mastra/studio/objects/music/sound.ts'

const out = process.argv[2]
if (!out) throw new Error('evidence dir required')
mkdirSync(out, { recursive: true })
const PAGE = new URL('./music.html', import.meta.url).href
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const RATE = 44100, FPS = 30
const SLOTS = (Object.keys(MUSIC_SCORES) as MusicSlot[]).filter(slot => !process.env.SLOT || process.env.SLOT === slot)
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const noteName = (midi: number) => NAMES[midi % 12]! + (Math.floor(midi / 12) - 1)
let failed = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++ }

function wav(samples: Float32Array) {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2))
  const head = Buffer.alloc(44)
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22)
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

/** An offline render in the page through the product's Player: one part (`only` keeps one cue), or a planned state run; trailing silence trimmed unless `length` is given */
async function render(page, job: { slot: MusicSlot; part?: string; only?: number; steps?: { at: number; motion: Motion }[]; end?: number }) {
  const b64: string = await page.evaluate(async ([job, rate]) => {
    const M = (window as any).__music, seconds = job.steps ? job.end + .3 : M.partLength(job.slot, job.part) + .2
    const ac = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate)
    if (job.steps) M.renderPlan(ac, job.slot, M.planMotion(job.slot, job.steps, job.end))
    else if (job.part.startsWith('loop')) new M.Player(ac).pass(job.slot, Number(job.part.slice(4)), 0, job.only)
    else new M.Player(ac).shot(job.slot, job.part, 0, job.only)
    const data = (await ac.startRendering()).getChannelData(0)
    let end = data.length
    if (!job.steps) while (end > 1 && data[end - 1] === 0) end--
    const bytes = new Uint8Array(data.buffer, 0, end * 4)
    let text = ''
    for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768))
    return btoa(text)
  }, [job, RATE])
  const bytes = Buffer.from(b64, 'base64')
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4).slice()
}

/* ------------------------------ state runs as frame-locked video ------------------------------ */
const HOVER: Motion = { hover: true, open: false, typing: false }
function scenes(slot: MusicSlot) {
  const stay = slot === 'box' || slot === 'takeaways' || slot === 'materials'
  const list = [
    { name: `${slot}-hover`, steps: [{ at: 0, motion: HOVER }], end: 12 },
    { name: `${slot}-open`, steps: [{ at: 0, motion: HOVER }, { at: 1.2, motion: { ...HOVER, open: true } }], end: 1.2 + (stay ? 15 : 5) },
  ]
  if (slot === 'reading') list.push({ name: 'reading-typing', steps: [{ at: 0, motion: { hover: false, open: false, typing: true } }], end: 20 })
  return list.filter(s => !process.env.SCENE || s.name.endsWith(process.env.SCENE))
}

async function film(page, slot: MusicSlot, scene: ReturnType<typeof scenes>[number]) {
  const frames = `${out}/frames-${scene.name}`
  rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true })
  await page.goto(`${PAGE}?only=${slot}&center`)
  await page.mouse.move(5, 5)
  await page.waitForTimeout(400)
  const box = await page.locator(`#${slot}`).boundingBox()
  await page.evaluate(() => { (window as any).__born = new Map() })
  const adopt = (at: number) => page.evaluate(async at => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    for (const a of document.getAnimations()) if (!(window as any).__born.has(a)) { a.pause(); (window as any).__born.set(a, at) }
  }, at)
  const apply = async (motion: Motion) => {
    if (motion.hover) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); else await page.mouse.move(5, 5)
    await page.evaluate(([slot, motion]) => {
      const host = document.getElementById(slot)!
      host.toggleAttribute('data-open', motion.open)
      host.classList.toggle('is-typing', motion.typing)
    }, [slot, motion])
  }
  const steps = [...scene.steps], count = Math.ceil((scene.end + .3) * FPS)
  for (let k = 0; k < count; k++) {
    const t = k / FPS
    while (steps.length && steps[0]!.at <= t + 1e-9) { const step = steps.shift()!; await apply(step.motion); await adopt(step.at) }
    await page.evaluate(t => { for (const [a, born] of (window as any).__born) { try { a.currentTime = Math.max(0, (t - born) * 1000) } catch { (window as any).__born.delete(a) } } }, t)
    await page.screenshot({ path: `${frames}/${String(k).padStart(4, '0')}.png` })
  }
  const samples = await render(page, { slot, steps: scene.steps, end: scene.end })
  writeFileSync(`${out}/${scene.name}.wav`, wav(samples))
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}/%04d.png`, '-i', `${out}/${scene.name}.wav`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', `${out}/${scene.name}.mp4`])
  rmSync(frames, { recursive: true, force: true })
  return samples
}

/* ------------------------------ run ------------------------------ */
const measures: Record<string, unknown>[] = []
for (const [name, type, options] of [['chromium', chromium, { executablePath: CHROME, args: ['--disable-gpu'] }], ['webkit', webkit, {}]] as const) {
  if (process.env.ONLY && process.env.ONLY !== name) continue
  const browser = await type.launch(options)
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(PAGE)
  const opens: number[] = []
  for (const slot of SLOTS) {
    const score = MUSIC_SCORES[slot]
    check(`${name} ${slot}: closing ${slot === 'map' || slot === 'ideas' ? 'silent' : 'sounds'}`, (score.close.length === 0) === (slot === 'map' || slot === 'ideas'))
    for (const part of partsOf(slot)) {
      const cues = partCues(slot, part), tag = `${name} ${slot} ${part}`
      if (!cues.length) continue
      const mix = await render(page, { slot, part })
      if (name === 'chromium') writeFileSync(`${out}/${slot}-${part}.wav`, wav(mix))
      let top = 0
      for (const v of mix) top = Math.max(top, Math.abs(v))
      const peak = peakDb(mix), rms = rmsDb(mix, RATE), length = mix.length / RATE, loop = part.startsWith('loop') ? score.loops[Number(part.slice(4))]! : null
      if (part === 'open' || (part === 'loop0' && !score.open.length)) opens.push(rms)
      const rows = []
      for (let i = 0; i < cues.length; i++) {
        const cue = cues[i]!, alone = await render(page, { slot, part, only: i }), heard = onset(alone, RATE, .05), midi = pitchOf(cue.sound)
        const measured = midi === null ? null : pitch(alone, RATE, hz(midi), cue.at + .02, 8192)
        rows.push({ at: cue.at, part: cue.part, sound: cue.sound.kind === 'noise' ? cue.sound.noise : cue.sound.kind, note: midi === null ? null : noteName(midi), target: midi === null ? null : +hz(midi).toFixed(2), onset: +heard.toFixed(4), hz: measured === null ? null : +measured.toFixed(2) })
      }
      const worstOnset = Math.max(...rows.map(r => Math.abs(r.onset - r.at))), worstPitch = Math.max(0, ...rows.filter(r => r.hz !== null).map(r => Math.abs(r.hz! / r.target! - 1)))
      check(`${tag}: onsets within 10 ms`, worstOnset <= .01, `${(worstOnset * 1000).toFixed(1)} ms`)
      check(`${tag}: pitch within 1%`, worstPitch <= .01, `${(worstPitch * 100).toFixed(2)}%`)
      check(`${tag}: peak in −24…−14 dBFS, no clipping`, peak >= -24 && peak <= -14 && top < 1, `${peak.toFixed(1)} dBFS`)
      if (loop) {
        check(`${tag}: a pass sounds within its run`, length <= loop.cycle.run + .001, `${length.toFixed(2)} s of ${loop.cycle.run} s`)
        check(`${tag}: rest ≥ max(run, 4 s)`, loop.cycle.rest >= Math.max(loop.cycle.run, 4), `${loop.cycle.rest} s`)
      } else check(`${tag}: within ${score.limit} s`, length <= score.limit + .001, `${length.toFixed(2)} s`)
      measures.push({ browser: name, slot, part, length: +length.toFixed(3), peak: +peak.toFixed(2), rms: +rms.toFixed(2), run: loop?.cycle.run, rest: loop?.cycle.rest, total: loop?.cycle.total, when: loop?.when, cues: rows })
    }
  }
  if (opens.length > 1) check(`${name}: open RMS spread ≤ 6 dB`, Math.max(...opens) - Math.min(...opens) <= 6, `${(Math.max(...opens) - Math.min(...opens)).toFixed(1)} dB`)
  if (name === 'chromium' && process.env.VIDEO) for (const slot of SLOTS) for (const scene of scenes(slot)) {
    try { await film(page, slot, scene); check(`video ${scene.name}`, true) } catch (error) { check(`video ${scene.name}`, false, String(error)) }
  }
  check(`${name}: no script errors`, errors.length === 0, errors.join(' | '))
  await browser.close()
}

if (measures.length) {
  writeFileSync(`${out}/measure.json`, JSON.stringify(measures, null, 1))
  const cueText = (c: any) => `${c.at.toFixed(3)} ${c.part} ${c.note ?? c.sound}${c.hz ? ` (${c.hz} Hz)` : ''}`
  const fmt = (m: any) => `| ${m.slot} | ${m.part}${m.when ? ` (${Object.entries(m.when).map(([k, v]) => v ? k : `!${k}`).join('+')})` : ''} | ${m.length.toFixed(2)} | ${m.run ?? ''} | ${m.rest ?? ''} | ${m.peak.toFixed(1)} | ${m.rms.toFixed(1)} | ${m.cues.map(cueText).join('<br>')} |`
  writeFileSync(`${out}/table.md`, ['| slot | sound (state) | length s | run s | rest s | peak dBFS | RMS dBFS | cues: time s · part · pitch (measured) |', '|---|---|---|---|---|---|---|---|', ...measures.filter((m: any) => m.browser === (process.env.ONLY ?? 'chromium')).map(fmt)].join('\n') + '\n')
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
