/**
 * [INPUT]: MUSIC_SCORES, MUSIC_OBJECTS and MUSIC_CSS from objects/music/index.ts; the pitch map (pitchOf, inKey, VIOLIN_OPEN, CELLO_OPEN, ms) of music/pitch.ts; the yardstick of music/meter.ts;
 *          sound.ts (mixClick, alignBeats, playMusic, muteMusic) under a recording AudioContext stand-in; the baseline hashes in fixtures/music-baseline.json
 * [OUTPUT]: evidence that one score drives both readers: every click-rule delay in the generated CSS equals its part's cue time; every pitched cue is in D major and the open strings are
 *           G3 D4 A4 E5 / C2 G2 D3 A3; the eight SVGs and MUSIC_CSS are byte-identical to the pre-task baseline; every object defines open and close (harp and violin close silent) within
 *           its limit; each click measures in range (onset ≤ 10 ms, pitch ≤ 1%, peak −24…−14 dBFS, open RMS spread ≤ 6 dB, no clipping); the metronome's ticks land on the swing's extremes;
 *           the engine plays one buffer source per cue, fades a re-clicked object within 60 ms and every sound within 100 ms of the window hiding, and suspends the context when muted
 * [POS]: the mechanism tests of the click scores and the sound engine. The same samples play in the browser (sound.ts builds them in pure JS at 44.1 kHz); real-page timing, audio
 *        contexts and WebKit are covered by scripts/objects/music-audio.mts and scripts/sprite/ui-assert-objects.mts
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/* ------------------------------ a recording AudioContext ------------------------------ */
class Param {
  value: number
  events: [string, number, number][] = []
  constructor(value: number) { this.value = value }
  cancelScheduledValues(t: number) { this.events = this.events.filter(e => e[1] < t) }
  setValueAtTime(v: number, t: number) { this.events.push(['set', t, v]) }
  linearRampToValueAtTime(v: number, t: number) { this.events.push(['ramp', t, v]) }
  at(t: number) {
    let value = this.value, time = 0
    for (const [kind, when, v] of this.events) {
      if (when > t) return kind === 'ramp' ? value + (v - value) * (t - time) / (when - time) : value
      value = v; time = when
    }
    return value
  }
}
const made = { contexts: 0, last: null as FakeContext | null, sources: [] as { start: number; stop: number | null }[], buses: [] as Param[] }
class FakeContext {
  currentTime = 0
  sampleRate = 48000
  state = 'running'
  destination = {}
  constructor() { made.contexts++; made.last = this }
  resume() { this.state = 'running'; return Promise.resolve() }
  suspend() { this.state = 'suspended'; return Promise.resolve() }
  createGain() { const gain = new Param(1); made.buses.push(gain); return { gain, connect() {} } }
  createBuffer() { return { copyToChannel() {} } }
  createBufferSource() { const record = { start: -1, stop: null as number | null }; made.sources.push(record); return { buffer: null, connect() {}, start(t: number) { record.start = t }, stop(t: number) { record.stop = t } } }
}
const page = Object.assign(new EventTarget(), { hidden: false })
Object.assign(globalThis, { AudioContext: FakeContext, document: page })

const M = '../src/mastra/studio/objects/music/'
const { MUSIC_SCORES, MUSIC_OBJECTS, MUSIC_CSS } = await import(M + 'index.ts')
const { pitchOf, inKey, VIOLIN_OPEN, CELLO_OPEN, ms, hz } = await import(M + 'pitch.ts')
const { peakDb, rmsDb, onset, pitch } = await import(M + 'meter.ts')
const { mixClick, alignBeats, playMusic, muteMusic, RATE } = await import(M + 'sound.ts')
type Slot = keyof typeof MUSIC_SCORES
const SLOTS = Object.keys(MUSIC_SCORES) as Slot[]
const PREFIX: Record<Slot, [string, string]> = { reading: ['mu-piano', 'pn-'], board: ['mu-stand', 'ms-'], takeaways: ['mu-gramophone', 'gr-'], materials: ['mu-cello', 'cl-'], box: ['mu-box', 'mb-'], map: ['mu-harp', 'hp-'], ideas: ['mu-violin', 'vn-'], all: ['mu-metronome', 'mt-'] }

/** The click rules ([data-open], not hover) of one object: the part each selects and the delay (ms) it sets */
function clickDelays(slot: Slot) {
  const [scope, prefix] = PREFIX[slot], found: { part: string; delay: number }[] = []
  for (const [, selector, body] of MUSIC_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selector.includes('[data-open]') || selector.includes(':hover') || !selector.includes(`.${scope} `)) continue
    const part = selector.match(new RegExp(`\\.${prefix}([\\w-]+)\\s*$`))?.[1]
    if (!part) continue
    const times = (text: string) => [...text.matchAll(/(-?[\d.]+)(ms|s)\b/g)].map(m => Number(m[1]) * (m[2] === 's' ? 1000 : 1))
    const own = body.match(/(?:animation|transition)-delay:\s*([^;]+)/)?.[1], short = body.match(/(?:animation|transition):\s*([^;]+)/)?.[1]
    const delay = own !== undefined ? times(own)[0]! : short ? times(short)[1] ?? 0 : null
    if (delay !== null) found.push({ part, delay: Math.round(delay) })
  }
  return found
}

test('one score: every click-rule delay in the generated CSS equals its part cue time', () => {
  const matched: Record<string, number> = {}
  for (const slot of SLOTS) {
    const cues = MUSIC_SCORES[slot].open
    for (const { part, delay } of clickDelays(slot)) {
      const cue = cues.find(c => c.part === part)
      if (!cue) continue
      assert.equal(delay, ms(cue.at), `${slot} .${part}: CSS ${delay} ms, score ${ms(cue.at)} ms`)
      matched[slot] = (matched[slot] ?? 0) + 1
    }
  }
  assert.deepEqual(matched, { takeaways: 2, materials: 1, box: 8, map: 40, ideas: 4 })
})

test('pitch: every pitched cue comes from the map and lies in D major; open strings G3 D4 A4 E5 and C2 G2 D3 A3', () => {
  assert.deepEqual(VIOLIN_OPEN, [55, 62, 69, 76])
  assert.deepEqual(CELLO_OPEN, [36, 43, 50, 57])
  let pitched = 0
  for (const slot of SLOTS) for (const cue of [...MUSIC_SCORES[slot].open, ...MUSIC_SCORES[slot].close]) {
    const midi = pitchOf(cue.sound)
    if (midi === null) continue
    pitched++
    assert.ok(inKey(midi), `${slot} ${cue.part}: MIDI ${midi} in D major`)
  }
  assert.ok(pitched >= 64)
  assert.deepEqual(MUSIC_SCORES.ideas.open.map((c: any) => pitchOf(c.sound)), VIOLIN_OPEN)
  assert.deepEqual(MUSIC_SCORES.materials.open.map((c: any) => pitchOf(c.sound)), [CELLO_OPEN[2]])
})

test('picture unchanged: the eight SVGs and MUSIC_CSS match the pre-task baseline byte for byte', () => {
  const base = JSON.parse(readFileSync(new URL('./fixtures/music-baseline.json', import.meta.url), 'utf8'))
  const sha = (text: string) => createHash('sha256').update(text).digest('hex')
  for (const o of MUSIC_OBJECTS) assert.equal(sha(o.svg({ words: o.slot === 'box' ? base.words : null })), base.svg[o.slot], `${o.slot} SVG`)
  assert.equal(sha(MUSIC_CSS), base.css, 'MUSIC_CSS')
})

test('lengths: open and close defined for all eight, harp and violin close silent, every sound within its limit', () => {
  const limits = { reading: 1.8, board: 1.8, takeaways: 1.8, materials: 2.2, box: 5.2, map: 1.8, ideas: 1.8, all: 4 }
  for (const slot of SLOTS) {
    const score = MUSIC_SCORES[slot]
    assert.equal(score.limit, limits[slot])
    assert.ok(score.open.length > 0, `${slot} opens with sound`)
    assert.equal(score.close.length === 0, slot === 'map' || slot === 'ideas', `${slot} close`)
    for (const open of [true, false]) assert.ok(mixClick(slot, open).length / RATE <= score.limit + 1e-3, `${slot} ${open ? 'open' : 'close'} length`)
  }
})

test('levels and timing: onsets within 10 ms, pitch within 1%, peaks −24…−14 dBFS without clipping, open RMS within 6 dB', () => {
  const opens: number[] = []
  for (const slot of SLOTS) for (const open of [true, false]) {
    const cues = MUSIC_SCORES[slot][open ? 'open' : 'close']
    if (!cues.length) continue
    const mix = mixClick(slot, open), peak = peakDb(mix)
    assert.ok(peak >= -24 && peak <= -14, `${slot} ${open}: peak ${peak.toFixed(1)}`)
    if (open) opens.push(rmsDb(mix, RATE))
    cues.forEach((cue: any, i: number) => {
      const alone = mixClick(slot, open, i)
      assert.ok(Math.abs(onset(alone, RATE, .05) - cue.at) <= .01, `${slot} ${cue.part} onset`)
      const midi = pitchOf(cue.sound)
      if (midi !== null) assert.ok(Math.abs(pitch(alone, RATE, hz(midi), cue.at + .02, 8192) / hz(midi) - 1) <= .01, `${slot} ${cue.part} pitch`)
    })
  }
  assert.ok(Math.max(...opens) - Math.min(...opens) <= 6, `RMS spread ${(Math.max(...opens) - Math.min(...opens)).toFixed(1)} dB`)
})

test('beats: with the rod swinging, ticks (and the bell on the first) land on the swing extremes; without it the score stands', () => {
  const score = MUSIC_SCORES.all
  assert.equal(alignBeats(score, true, null), score.open)
  for (const [open, elapsed] of [[true, 3.37], [true, .05], [false, 2.2]] as const) {
    const host = { getAnimations: () => [{ animationName: 'mt-swing', currentTime: elapsed * 1000 }] } as unknown as Element
    const period = score.beat!.period[open ? 'open' : 'close'], cues = alignBeats(score, open, host)
    const ticks = cues.filter((c: any) => c.sound.noise === 'tick'), planned = score[open ? 'open' : 'close'].filter((c: any) => c.sound.noise === 'tick')
    ticks.forEach((tick: any, i: number) => {
      const phase = (((elapsed + tick.at) / period) % 1 + 1) % 1
      assert.ok(Math.min(Math.abs(phase - .25), Math.abs(phase - .75)) < 1e-9, `tick ${i} on an extreme (phase ${phase})`)
      assert.ok(tick.at >= 0 && Math.abs(tick.at - planned[i].at) <= period / 4 + 1e-9, `tick ${i} near its cue`)
    })
    if (open) assert.equal(cues.find((c: any) => c.sound.kind === 'bell').at, ticks[0].at)
  }
})

test('engine: one source per cue; a re-click fades within 60 ms; hiding fades within 100 ms; muting suspends', async () => {
  playMusic('map', true)
  assert.equal(made.contexts, 1)
  assert.equal(made.sources.length, 40)
  assert.deepEqual(made.sources.map(s => +s.start.toFixed(3)), MUSIC_SCORES.map.open.map((c: any) => +c.at.toFixed(3)))
  const harp = made.buses.at(-1)!
  playMusic('reading', true)
  assert.equal(made.sources.length, 46, 'another object adds its own sources')
  const piano = made.buses.at(-1)!
  assert.ok(harp.at(1) > 0, 'objects never cut each other')
  playMusic('map', false)
  assert.equal(made.sources.length, 46, 'the harp closes silent')
  assert.ok(harp.at(.06) <= harp.value * 1e-3, 'the re-clicked harp fades below −60 dB within 60 ms')
  page.hidden = true
  page.dispatchEvent(new Event('visibilitychange'))
  assert.ok(piano.at(.1) <= piano.value * 1e-3, 'a hidden window fades within 100 ms')
  page.hidden = false
  playMusic('box', true)
  assert.equal(made.contexts, 1, 'the context is reused')
  muteMusic()
  await new Promise(resolve => setTimeout(resolve, 120))
  assert.equal(made.last!.state, 'suspended', 'muted: the context is suspended')
  playMusic('ideas', true)
  assert.equal(made.last!.state, 'running', 'the next sounded click resumes it')
  assert.equal(made.contexts, 1)
})
