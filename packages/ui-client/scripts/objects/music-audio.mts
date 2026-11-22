/**
 * [INPUT]: scripts/objects/music.html (run music-page.mts first; it carries the product's sound.ts and sampler.ts as window.__music), served by serveMusic of ./music-serve.mts;
 *          playwright-core from /tmp/lumen-s0-pw with Chromium 1228 and Playwright's WebKit build; the yardstick of objects/music/meter.ts, the pitch map of objects/music/pitch.ts and
 *          the sample manifest of objects/music/samples.ts; ffmpeg on PATH for the videos
 * [OUTPUT]: in <evidence-dir>: <slot>-<part>.wav for every sound of every object (open, close, hoverIn, loop0…: one pass), rendered by an OfflineAudioContext through the product's
 *           Player and Sampler at 44.1 kHz, 16-bit mono; measure.json and table.md (per part: length, peak, gated RMS; per cue: time, part, pitch, recording and shift, measured onset
 *           and pitch; per loop: lead, run and rest). With VIDEO=1, state runs as video plus their own audio (<name>.wav and <name>.mp4, 1440×900, the object centred, 15 fps):
 *           <slot>-hover, <slot>-open (hover, click at 1.2 s) and reading-typing, each long enough for one pass, its whole rest and 1 s of the next (hover at least 12 s; open at least
 *           15 s after the click for box, gramophone and cello). Frames step every animation paused at k/15 s after its state began, and the audio is the engine's own plan of the same
 *           state run (planMotion → renderPlan), so picture and sound share one clock.
 *           Checks: every recording decodes; onset within 10 ms of each cue; pitch within 2% (recordings carry their own intonation); peak −24…−14 dBFS and no sample at ±1 for every
 *           part; open RMS spread ≤ 6 dB; one-shots within the score's limit; loop passes within their run; rests ≥ max(run, 4 s); harp and violin closing silent; exit 1 on a failure
 * [POS]: the listening gate's evidence and the offline half of the browser measurements, not shipped. Each cue's onset and pitch are measured on a render of that cue alone at its
 *        scheduled time (a loop's cues follow its cycle's lead), the pitch over 0.74 s for a low or long note (vibrato and 5 Hz FFT bins would blur a shorter window); loudness and
 *        clipping are measured on the whole part.
 *        Usage: node --experimental-strip-types scripts/objects/music-audio.mts <evidence-dir> (ONLY=chromium|webkit, SLOT=<slot>, VIDEO=1, SCENE=hover|open|typing)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { chromium, webkit } from '/tmp/lumen-s0-pw/node_modules/playwright-core/index.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { MUSIC_SCORES, partCues, partsOf, type MusicSlot } from '../../src/mastra/studio/objects/music/index.ts'
import { onset, peakDb, pitch, rmsDb } from '../../src/mastra/studio/objects/music/meter.ts'
import { hz, pitchOf, type Motion } from '../../src/mastra/studio/objects/music/pitch.ts'
import { SAMPLES, sampleFor } from '../../src/mastra/studio/objects/music/samples.ts'
import { loopFor } from '../../src/mastra/studio/objects/music/sound.ts'
import { serveMusic } from './music-serve.mts'

const out = process.argv[2]
if (!out) throw new Error('evidence dir required')
mkdirSync(out, { recursive: true })
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const RATE = 44100, FPS = 15
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

/** An offline render in the page through the product's Player and Sampler: one part (`only` keeps one cue), or a planned state run; trailing silence trimmed for parts */
async function render(page, job: { slot: MusicSlot; part?: string; only?: number; steps?: { at: number; motion: Motion }[]; end?: number }) {
  const b64: string = await page.evaluate(async ([job, rate]) => {
    const M = (window as any).__music, probe = new OfflineAudioContext(1, rate, rate), sizer = new M.Sampler(probe)
    const lead = job.part?.startsWith('loop') ? M.MUSIC_SCORES[job.slot].loops[Number(job.part.slice(4))].cycle.lead : 0
    const seconds = job.steps ? job.end + .3 : lead + sizer.length(job.slot, job.part) + .2
    const ac = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate), engine = new M.Sampler(ac)
    await engine.prepare(job.slot)
    if (job.steps) M.renderPlan(ac, engine, job.slot, M.planMotion(job.slot, job.steps, job.end))
    else if (job.part.startsWith('loop')) new M.Player(ac, engine).pass(job.slot, Number(job.part.slice(4)), 0, job.only)
    else new M.Player(ac, engine).shot(job.slot, job.part, 0, job.only)
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

/** Every recording decodes in this browser: name → decoded length (s), or the error */
const decodeAll = (page) => page.evaluate(async (names: string[]) => {
  const ac = new OfflineAudioContext(1, 44100, 44100), result: Record<string, number | string> = {}
  for (const name of names) {
    try {
      const response = await fetch(new URL(`../../src/mastra/studio/objects/music/samples/${name}.m4a`, location.href).href)
      const data = await response.arrayBuffer()
      result[name] = (await ac.decodeAudioData(data)).duration
    } catch (error) { result[name] = String(error) }
  }
  return result
}, Object.keys(SAMPLES))

/* ------------------------------ state runs as frame-locked video ------------------------------ */
const HOVER: Motion = { hover: true, open: false, typing: false }
/** One pass, its whole rest and 1 s of the next for the loop a state runs (4 s when it runs none) */
const span = (slot: MusicSlot, motion: Motion) => {
  const { index } = loopFor(slot, motion), loop = MUSIC_SCORES[slot].loops[index]
  return loop ? loop.clock.delay + loop.cycle.total + loop.cycle.lead + 1 : 4
}
function scenes(slot: MusicSlot) {
  const stay = slot === 'box' || slot === 'takeaways' || slot === 'materials', open = { ...HOVER, open: true }, typing = { hover: false, open: false, typing: true }
  const list = [
    { name: `${slot}-hover`, steps: [{ at: 0, motion: HOVER }], end: Math.max(12, span(slot, HOVER)) },
    { name: `${slot}-open`, steps: [{ at: 0, motion: HOVER }, { at: 1.2, motion: open }], end: 1.2 + Math.max(stay ? 15 : 0, span(slot, open)) },
  ]
  if (slot === 'reading') list.push({ name: 'reading-typing', steps: [{ at: 0, motion: typing }], end: Math.max(20, span(slot, typing)) })
  return list.filter(s => !process.env.SCENE || s.name.endsWith(process.env.SCENE))
}

async function film(page, base: string, slot: MusicSlot, scene: ReturnType<typeof scenes>[number]) {
  const frames = `${out}/frames-${scene.name}`
  rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true })
  await page.goto(`${base}?only=${slot}&center`)
  await page.mouse.move(5, 5)
  await page.waitForTimeout(400)
  await page.evaluate(() => { (window as any).__born = new Map() })
  const adopt = (at: number) => page.evaluate(async at => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    for (const a of document.getAnimations()) if (!(window as any).__born.has(a)) { a.pause(); (window as any).__born.set(a, at) }
  }, at)
  const apply = (motion: Motion) => page.evaluate(([slot, motion]) => {
    const host = document.getElementById(slot)!
    host.toggleAttribute('data-hover', motion.hover)
    host.toggleAttribute('data-open', motion.open)
    host.classList.toggle('is-typing', motion.typing)
  }, [slot, motion])
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
const server = await serveMusic(), PAGE = `${server.url}/scripts/objects/music.html`
const measures: Record<string, unknown>[] = []
for (const [name, type, options] of [['chromium', chromium, { executablePath: CHROME, args: ['--disable-gpu'] }], ['webkit', webkit, {}]] as const) {
  if (process.env.ONLY && process.env.ONLY !== name) continue
  const browser = await type.launch(options)
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(PAGE)
  const decoded = await decodeAll(page), broken = Object.entries(decoded).filter(([, v]) => typeof v !== 'number')
  check(`${name}: all ${Object.keys(decoded).length} recordings decode`, broken.length === 0, broken.map(([k, v]) => `${k}: ${v}`).join(' | '))
  const opens: number[] = []
  for (const slot of SLOTS) {
    const score = MUSIC_SCORES[slot]
    check(`${name} ${slot}: closing ${slot === 'map' || slot === 'ideas' ? 'silent' : 'sounds'}`, (score.close.length === 0) === (slot === 'map' || slot === 'ideas'))
    for (const part of partsOf(slot)) {
      const cues = partCues(slot, part), tag = `${name} ${slot} ${part}`
      if (!cues.length) continue
      const loop = part.startsWith('loop') ? score.loops[Number(part.slice(4))]! : null, lead = loop?.cycle.lead ?? 0
      const mix = await render(page, { slot, part })
      if (name === 'chromium') writeFileSync(`${out}/${slot}-${part}.wav`, wav(mix))
      let top = 0
      for (const v of mix) top = Math.max(top, Math.abs(v))
      const peak = peakDb(mix), rms = rmsDb(mix, RATE), length = mix.length / RATE - lead
      if (part === 'open' || (part === 'loop0' && !score.open.length)) opens.push(rms)
      const rows = []
      for (let i = 0; i < cues.length; i++) {
        const cue = cues[i]!, alone = await render(page, { slot, part, only: i }), heard = onset(alone, RATE, .05) - lead, midi = pitchOf(cue.sound), pick = sampleFor(cue)
        const measured = midi === null ? null : pitch(alone, RATE, hz(midi), lead + cue.at + .03, hz(midi) < 300 || cue.dur >= .7 ? 32768 : 8192)
        rows.push({ at: cue.at, part: cue.part, sound: cue.sound.kind === 'noise' ? cue.sound.noise : cue.sound.kind, note: midi === null ? null : noteName(midi), target: midi === null ? null : +hz(midi).toFixed(2),
          sample: pick.name, shift: +pick.shift.toFixed(2), onset: +heard.toFixed(4), hz: measured === null ? null : +measured.toFixed(2) })
      }
      const worstOnset = Math.max(...rows.map(r => Math.abs(r.onset - r.at))), worstPitch = Math.max(0, ...rows.filter(r => r.hz !== null).map(r => Math.abs(r.hz! / r.target! - 1)))
      check(`${tag}: onsets within 10 ms`, worstOnset <= .01, `${(worstOnset * 1000).toFixed(1)} ms`)
      check(`${tag}: pitch within 2%`, worstPitch <= .02, `${(worstPitch * 100).toFixed(2)}%`)
      check(`${tag}: peak in −24…−14 dBFS, no clipping`, peak >= -24 && peak <= -14 && top < 1, `${peak.toFixed(1)} dBFS`)
      if (loop) {
        check(`${tag}: a pass sounds within its run`, length <= loop.cycle.run + .001, `${length.toFixed(2)} s of ${loop.cycle.run} s`)
        check(`${tag}: rest ≥ max(run, 4 s)`, loop.cycle.rest >= Math.max(loop.cycle.run, 4), `${loop.cycle.rest} s`)
      } else check(`${tag}: within ${score.limit} s`, length <= score.limit + .001, `${length.toFixed(2)} s`)
      measures.push({ browser: name, slot, part, length: +length.toFixed(3), peak: +peak.toFixed(2), rms: +rms.toFixed(2), lead: loop?.cycle.lead, run: loop?.cycle.run, rest: loop?.cycle.rest, total: loop?.cycle.total, when: loop?.when, cues: rows })
    }
  }
  if (opens.length > 1) check(`${name}: open RMS spread ≤ 6 dB`, Math.max(...opens) - Math.min(...opens) <= 6, `${(Math.max(...opens) - Math.min(...opens)).toFixed(1)} dB`)
  if (name === 'chromium' && process.env.VIDEO) for (const slot of SLOTS) for (const scene of scenes(slot)) {
    try { await film(page, PAGE, slot, scene); check(`video ${scene.name}`, true) } catch (error) { check(`video ${scene.name}`, false, String(error)) }
  }
  check(`${name}: no script errors`, errors.length === 0, errors.join(' | '))
  await browser.close()
}
await server.close()

if (measures.length) {
  writeFileSync(`${out}/measure.json`, JSON.stringify(measures, null, 1))
  const cueText = (c: any) => `${c.at.toFixed(3)} ${c.part} ${c.note ?? c.sound} ← ${c.sample}${c.shift ? ` (${c.shift > 0 ? '+' : ''}${c.shift})` : ''}${c.hz ? ` · ${c.hz} Hz` : ''}`
  const fmt = (m: any) => `| ${m.slot} | ${m.part}${m.when ? ` (${Object.entries(m.when).map(([k, v]) => v ? k : `!${k}`).join('+')})` : ''} | ${m.length.toFixed(2)} | ${m.run ?? ''} | ${m.rest ?? ''} | ${m.peak.toFixed(1)} | ${m.rms.toFixed(1)} | ${m.cues.map(cueText).join('<br>')} |`
  writeFileSync(`${out}/table.md`, ['| slot | sound (state) | length s | run s | rest s | peak dBFS | RMS dBFS | cues: time s · part · pitch ← recording (shift, semitones) · measured |', '|---|---|---|---|---|---|---|---|', ...measures.filter((m: any) => m.browser === (process.env.ONLY ?? 'chromium')).map(fmt)].join('\n') + '\n')
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
