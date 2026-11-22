/**
 * [INPUT]: MUSIC_SCORES, MUSIC_OBJECTS, MUSIC_CSS, partsOf and partCues from objects/music/index.ts; the pitch map of music/pitch.ts; LEAD of music/cycle.ts; SAMPLES, MAX_SHIFT and
 *          sampleFor of music/samples.ts; attackOffset of music/sampler.ts; Player, shotFor, loopFor, planMotion, motionMusic, unlockMusic and muteMusic of music/sound.ts under a recording
 *          AudioContext stand-in and a fake Engine; samples/ and samples/SOURCES.md; the baseline in fixtures/music-baseline.json
 * [OUTPUT]: evidence that one score drives both readers: every loop's clock rule carries its cycle and delay, and every part's loop delay equals its first cue; every loop rests at least
 *           max(run, 4 s) with its motion and its cues inside the pass; the eight SVGs and every rule without an animation (the click's one-shots and the static styles) match the
 *           pre-task baseline; pitched cues follow the one map (D major, except the drawn piano keys and the open strings); every cue finds a registered CC0 recording within ±3 semitones,
 *           SOURCES.md and samples/ match one to one, the set stays under 2 MB; the attack offset finds padded silence within 1 ms; and the scheduling, through a fake engine (no sound),
 *           plays a cue per start at its time, fades and ducks, skips parts that are not ready, gives one object the turn at a time and resumes the other at its next pass, stays silent
 *           under reduced motion, fades on a hidden window and suspends when muted
 * [POS]: the mechanism tests of the scores, the sample manifest and the scheduling. Decoding, real timing, onsets and pitch of the recordings are measured in the browser by
 *        scripts/objects/music-audio.mts (Chromium and WebKit) and scripts/sprite/ui-assert-objects.mts
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'

/* ------------------------------ a recording AudioContext, a page and a fake engine ------------------------------ */
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
const made = { contexts: 0, last: null as FakeContext | null }
class FakeContext {
  currentTime = 0
  sampleRate = 48000
  state = 'running'
  destination = {}
  constructor() { made.contexts++; made.last = this }
  resume() { this.state = 'running'; return Promise.resolve() }
  suspend() { this.state = 'suspended'; return Promise.resolve() }
  createGain() { return { gain: new Param(1), connect() {} } }
}
interface Start { slot: string; part: string; index: number; when: number; out: { gain: Param } }
class FakeEngine {
  starts: Start[] = []
  prepared: string[] = []
  missing = new Set<string>()
  prepare(slot: string) { this.prepared.push(slot); return Promise.resolve() }
  ready(slot: string, part: string) { return !this.missing.has(`${slot}:${part}`) }
  level() { return .5 }
  length(slot: string, part: string) { return Math.max(0, ...partCues(slot, part).map((c: any) => c.at + c.dur)) }
  start(slot: string, part: string, index: number, when: number, out: any) { this.starts.push({ slot, part, index, when, out }); return [] }
}
let reduce = false
let skew = 0
const realNow = performance.now.bind(performance)
performance.now = () => realNow() + skew
const page = Object.assign(new EventTarget(), { hidden: false, timeline: { get currentTime() { return performance.now() } } })
Object.assign(globalThis, {
  AudioContext: FakeContext, document: page, requestAnimationFrame: (run: () => void) => setTimeout(run, 4),
  matchMedia: () => ({ matches: reduce }),
})
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const M = '../src/mastra/studio/objects/music/'
const { MUSIC_SCORES, MUSIC_OBJECTS, MUSIC_CSS, partsOf, partCues } = await import(M + 'index.ts')
const { pitchOf, inKey, VIOLIN_OPEN, CELLO_OPEN } = await import(M + 'pitch.ts')
const { LEAD } = await import(M + 'cycle.ts')
const { SAMPLES, MAX_SHIFT, sampleFor } = await import(M + 'samples.ts')
const { attackOffset } = await import(M + 'sampler.ts')
const { Player, shotFor, loopFor, planMotion, motionMusic, unlockMusic, muteMusic } = await import(M + 'sound.ts')
type Slot = keyof typeof MUSIC_SCORES
const SLOTS = Object.keys(MUSIC_SCORES) as Slot[]
const SCOPE: Record<Slot, [string, string]> = { reading: ['mu-piano', 'pn-'], board: ['mu-stand', 'ms-'], takeaways: ['mu-gramophone', 'gr-'], materials: ['mu-cello', 'cl-'], box: ['mu-box', 'mb-'], map: ['mu-harp', 'hp-'], ideas: ['mu-violin', 'vn-'], all: ['mu-metronome', 'mt-'] }
const REST = { hover: false, open: false, typing: false }, HOVER = { ...REST, hover: true }

/* ------------------------------ the generated CSS ------------------------------ */
const RULES = [...MUSIC_CSS.replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel!.trim(), body: body!.trim() }))
/** An `animation:` shorthand's name, duration and delay (s) */
function animation(body: string) {
  const short = body.match(/animation:\s*([\w-]+)\s+([\d.]+)s(?:\s+([\d.]+)(ms|s))?/)
  if (!short) return null
  return { name: short[1]!, duration: Number(short[2]), delay: short[3] ? Number(short[3]) / (short[4] === 'ms' ? 1000 : 1) : 0 }
}
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6
const keyframes = (name: string) => MUSIC_CSS.match(new RegExp(`@keyframes ${name} \\{((?:[^{}]*\\{[^{}]*\\})*)\\s*\\}`))?.[1] ?? ''

test('one score: each loop clock rule carries its cycle and delay; each part starts at its first cue, by its delay or by its keyframes', () => {
  const matched: Record<string, number> = {}
  for (const slot of SLOTS) for (const loop of MUSIC_SCORES[slot].loops) {
    const [scope, prefix] = SCOPE[slot], { lead, total } = loop.cycle, own = new RegExp(`\\.(${loop.clock.target}|${loop.clock.target.replace(/\d+$/, '')})$`)
    const clock = RULES.filter(r => r.sel.includes(`.${scope} `) && own.test(r.sel)).map(r => animation(r.body)).find(a => a?.name === loop.clock.animation)
    assert.ok(clock, `${slot}: a rule runs ${loop.clock.animation}`)
    assert.ok(close(clock!.duration, total), `${slot} ${loop.clock.animation}: ${clock!.duration} s = cycle ${total} s`)
    assert.ok(close(clock!.delay, loop.clock.delay), `${slot} ${loop.clock.animation}: delay ${clock!.delay} s = ${loop.clock.delay} s`)
    const first = new Map<string, number>()
    for (const cue of loop.cues) if (!first.has(cue.part)) first.set(cue.part, cue.at)
    for (const [part, at] of first) for (const rule of RULES.filter(r => r.sel.includes(`.${scope} `) && r.sel.endsWith(`.${prefix}${part}`) && !own.test(r.sel))) {
      const a = animation(rule.body), tag = `${slot} .${prefix}${part}`
      if (!a || !close(a.duration, total)) continue
      const byDelay = close(a.delay, Math.round((loop.clock.delay + at) * 1000) / 1000)
      const byFrames = close(a.delay, loop.clock.delay) && [...keyframes(a.name).matchAll(/([\d.]+)%/g)].some(m => Math.abs(Number(m[1]) / 100 * total - (lead + at)) <= .0015)
      assert.ok(byDelay || byFrames, `${tag}: CSS delay ${a.delay} s and keyframes of ${a.name} against the score's ${at} s`)
      matched[slot] = (matched[slot] ?? 0) + 1
    }
  }
  assert.deepEqual(matched, { reading: 20, board: 17, box: 8, map: 7 }, "every part run by its own animation is checked")
})

test('rest: every loop is lead + one pass + a rest of at least max(run, 4 s); its cues and its clock motion stay inside the pass', () => {
  for (const slot of SLOTS) for (const loop of MUSIC_SCORES[slot].loops) {
    const { lead, run, rest, total } = loop.cycle, tag = `${slot} ${loop.clock.animation}`
    assert.equal(lead, LEAD)
    assert.ok(rest >= Math.max(run, 4), `${tag}: rest ${rest} s`)
    assert.ok(close(total, Math.round((lead + run + rest) * 1000) / 1000), `${tag}: total`)
    for (const cue of loop.cues) assert.ok(cue.at >= 0 && cue.at + cue.dur <= run + 1e-6, `${tag} ${cue.part}: ${cue.at}+${cue.dur} within ${run}`)
    const stops = [...keyframes(loop.clock.animation).matchAll(/([\d.]+)%/g)].map(m => Number(m[1])).filter(p => p < 100)
    assert.ok(stops.length > 1, `${tag}: keyframes found`)
    assert.ok(Math.max(...stops) <= (lead + run) / total * 100 + .01, `${tag}: motion ends by ${((lead + run) / total * 100).toFixed(2)}%, last stop ${Math.max(...stops)}%`)
    assert.ok(Math.min(...stops.filter(p => p > 0)) >= lead / total * 100 - .01, `${tag}: still through the lead`)
  }
})

test('picture: the eight SVGs and every rule without an animation match the pre-task baseline', () => {
  const base = JSON.parse(readFileSync(new URL('./fixtures/music-baseline.json', import.meta.url), 'utf8'))
  const sha = (text: string) => createHash('sha256').update(text).digest('hex')
  for (const o of MUSIC_OBJECTS) assert.equal(sha(o.svg({ words: o.slot === 'box' ? base.words : null })), base.svg[o.slot], `${o.slot} SVG`)
  const fold = (sel: string) => sel.replace(/\.iso-host\[data-open\]\[data-hover\]/g, '.iso-host[data-open]:hover').replace(/\.iso-host\[data-hover\]/g, '.iso-host:hover')
  const still = Object.fromEntries(RULES.filter(r => !/animation/.test(r.body)).map(r => [fold(r.sel), r.body]))
  assert.deepEqual(still, base.still)
  assert.ok(!/:hover/.test(MUSIC_CSS), 'motion starts from the confirmed hover only')
})

test('pitch: one map; the click sounds lie in D major, the drawn keys and open strings keep their own pitch', () => {
  assert.deepEqual(VIOLIN_OPEN, [55, 62, 69, 76])
  assert.deepEqual(CELLO_OPEN, [36, 43, 50, 57])
  let pitched = 0
  for (const slot of SLOTS) for (const part of partsOf(slot)) for (const cue of partCues(slot, part)) {
    const midi = pitchOf(cue.sound)
    if (midi === null) continue
    pitched++
    if (cue.sound.kind !== 'piano' && cue.sound.kind !== 'hum') assert.ok(inKey(midi), `${slot} ${part} ${cue.part}: MIDI ${midi} in D major`)
  }
  assert.ok(pitched >= 100)
  assert.deepEqual(MUSIC_SCORES.ideas.open.map((c: any) => pitchOf(c.sound)), VIOLIN_OPEN)
  assert.deepEqual(MUSIC_SCORES.materials.loops[1].cues.map((c: any) => pitchOf(c.sound)), CELLO_OPEN)
  assert.deepEqual(MUSIC_SCORES.reading.open.map((c: any) => c.sound.kind), ['noise'], 'the piano lid only: no chord is pressed')
})

test('samples: SOURCES.md and samples/ match one to one, all CC0 with a SHA-256, under 2 MB; every cue finds its recording within ±3 semitones', () => {
  const dir = new URL('../src/mastra/studio/objects/music/samples/', import.meta.url)
  const files = readdirSync(dir).filter(f => f !== 'SOURCES.md').sort()
  const rows = readFileSync(new URL('SOURCES.md', dir), 'utf8').split('\n').filter(l => /^\| [\w-]+\.m4a /.test(l)).map(l => l.split('|').map(c => c.trim()))
  assert.deepEqual(rows.map(r => r[1]).sort(), files, 'one row per file')
  for (const r of rows) {
    assert.equal(r[5], 'CC0 1.0', `${r[1]} license`)
    assert.match(r[6]!, /^[0-9a-f]{64}$/, `${r[1]} SHA-256`)
    assert.match(r[3]!, /^https:\/\//, `${r[1]} source URL`)
  }
  assert.deepEqual(Object.keys(SAMPLES).map(n => `${n}.m4a`).sort(), files, 'the manifest names every file')
  const size = files.reduce((sum, f) => sum + statSync(new URL(f, dir)).size, 0)
  assert.ok(size <= 2 * 1024 * 1024, `${size} B`)
  let cues = 0
  for (const slot of SLOTS) for (const part of partsOf(slot)) for (const cue of partCues(slot, part)) {
    const pick = sampleFor(cue), sample = SAMPLES[pick.name]
    assert.ok(sample, `${slot} ${part} ${cue.part}: ${pick.name} exists`)
    assert.ok(Math.abs(pick.shift) <= MAX_SHIFT, `${slot} ${part} ${cue.part}: shift ${pick.shift}`)
    assert.equal(sample.midi === null, pitchOf(cue.sound) === null, `${slot} ${cue.part}: a noise plays a noise, a note a note`)
    assert.ok(Math.abs(pick.rate - 2 ** (pick.shift / 12)) < 1e-12)
    cues++
  }
  assert.equal(cues, 142)
})

test('attack offset: the same recording behind 0, 20 and 48 ms of silence is found within 1 ms of each', () => {
  const rate = 44100, tone = new Float32Array(rate / 2).map((_, i) => Math.sin(2 * Math.PI * 440 * i / rate) * Math.exp(-i / rate * 6) * Math.min(1, i / (rate * .003)))
  const padded = (ms: number) => { const out = new Float32Array(Math.round(ms / 1000 * rate) + tone.length); out.set(tone, Math.round(ms / 1000 * rate)); return out }
  const zero = attackOffset(padded(0), rate)
  for (const ms of [20, 48]) assert.ok(Math.abs(attackOffset(padded(ms), rate) - zero - ms / 1000) <= .001, `${ms} ms`)
  assert.equal(attackOffset(new Float32Array(100), rate), 0)
})

test('rules: the one-shot a change plays and the loop a state runs; a plan sounds what the engine will', () => {
  assert.equal(shotFor(REST, HOVER), 'hoverIn')
  assert.equal(shotFor(HOVER, { ...HOVER, open: true }), 'open')
  assert.equal(shotFor({ ...HOVER, open: true }, HOVER), 'close')
  assert.equal(shotFor(HOVER, REST), 'stop')
  assert.equal(loopFor('takeaways', HOVER).key, loopFor('takeaways', { ...HOVER, open: true }).key, 'the record turns on through a click')
  assert.equal(loopFor('ideas', { ...HOVER, open: true }).index, -1, 'the violin stops bowing when plucked')
  assert.notEqual(loopFor('all', HOVER).key, loopFor('all', { ...HOVER, open: true }).key, 'the metronome changes tempo')
  const box = MUSIC_SCORES.box.loops[0], plan = planMotion('box', [{ at: 0, motion: HOVER }, { at: 1.2, motion: { ...HOVER, open: true } }], 30)
  assert.deepEqual(plan.filter((p: any) => 'pass' in p).map((p: any) => +p.at.toFixed(3)), [0, 1, 2].map(k => +(1.2 + box.clock.delay + k * box.cycle.total).toFixed(3)))
  assert.deepEqual(plan.filter((p: any) => 'shot' in p).map((p: any) => p.shot), ['hoverIn', 'open'])
})

test('player: a start per cue at its time; a pass follows the lead; a new shot fades the last in 50 ms and ducks the loop; parts not ready stay silent', () => {
  const ac = new FakeContext(), engine = new FakeEngine(), player = new Player(ac, engine)
  player.shot('map', 'open', 1)
  assert.deepEqual(engine.starts.map(s => +s.when.toFixed(3)), MUSIC_SCORES.map.open.map((c: any) => +(1 + c.at).toFixed(3)))
  const harp = engine.starts[0]!.out.gain
  engine.starts = []
  player.pass('all', 1, 2)
  assert.deepEqual(engine.starts.map(s => +s.when.toFixed(3)), MUSIC_SCORES.all.loops[1].cues.map((c: any) => +(2 + LEAD + c.at).toFixed(3)))
  const loop = engine.starts[0]!.out.gain
  player.shot('map', 'open', 3)
  assert.ok(harp.at(3.05) <= harp.value * 1e-3, 'the last shot is below −60 dB in 50 ms')
  player.shot('all', 'open', 4)
  assert.ok(loop.at(4.07) <= 1e-6 && loop.at(4 + engine.length('all', 'open') + .1) > .4, 'the loop ducks under the shot and comes back')
  engine.starts = []
  engine.missing.add('box:loop0')
  player.pass('box', 0, 5)
  assert.equal(engine.starts.length, 0, 'not loaded: the pass is skipped, never sounded late')
})

/** A host whose clock animation began `ago` s into its state (currentTime from the real clock) */
function host(slot: Slot, index: number) {
  const loop = MUSIC_SCORES[slot].loops[index]!, clock = { born: performance.now() }
  const anim = {
    animationName: loop.clock.animation, startTime: 0,
    get currentTime() { return performance.now() - clock.born },
    effect: { target: { classList: { contains: (c: string) => c === loop.clock.target } }, getTiming: () => ({ delay: loop.clock.delay * 1000, duration: loop.cycle.total * 1000 }) },
  }
  return { clock, element: { getAnimations: () => [anim] } as unknown as Element }
}

test('motion: one object sounds at a time, the other resumes at its next pass; reduced motion is silent; hiding fades; muting suspends', async () => {
  const engine = new FakeEngine(), contexts = made.contexts
  unlockMusic(() => engine as any)
  assert.equal(made.contexts, contexts + 1)
  const record = host('takeaways', 0), piano = host('reading', 1), opened = { ...REST, open: true }
  motionMusic('takeaways', opened, record.element)
  assert.deepEqual(engine.prepared, ['takeaways'], 'a slot loads its sounds once its host is seen')
  await wait(60)
  const recordStarts = engine.starts.filter(s => s.slot === 'takeaways' && s.part === 'loop0'), side = MUSIC_SCORES.takeaways.loops[0]
  assert.equal(recordStarts.length, side.cues.length, 'the open gramophone plays its pass')
  const recordBus = recordStarts[0]!.out.gain
  motionMusic('reading', HOVER, piano.element)
  await wait(60)
  assert.ok(recordBus.at(made.last!.currentTime + .08) <= 1e-6, 'the pointer takes the turn: the gramophone fades within 80 ms')
  assert.ok(engine.starts.some(s => s.slot === 'reading'), 'the piano under the pointer sounds')
  const before = engine.starts.filter(s => s.slot === 'takeaways').length
  skew += (side.clock.delay + side.cycle.total - .2) * 1000 - (performance.now() - record.clock.born)
  motionMusic('reading', REST, piano.element)
  const resumed = engine.starts.filter(s => s.slot === 'takeaways').slice(before).filter(s => s.part === 'loop0')
  assert.equal(resumed.length, side.cues.length, 'the gramophone resumes with its next pass only')
  assert.ok(resumed.every(s => s.when >= made.last!.currentTime + .1), 'never from the middle of the pass under way')
  reduce = true
  const count = engine.starts.length
  motionMusic('map', HOVER, host('map', 0).element)
  await wait(60)
  assert.equal(engine.starts.length, count, 'reduced motion: nothing moves, nothing sounds')
  reduce = false
  motionMusic('map', REST, null)
  page.hidden = true
  page.dispatchEvent(new Event('visibilitychange'))
  const last = engine.starts.at(-1)!.out.gain
  assert.ok(last.at(made.last!.currentTime + .08) <= 1e-6, 'a hidden window fades within 80 ms')
  page.hidden = false
  muteMusic()
  await wait(120)
  assert.equal(made.last!.state, 'suspended', 'muted: the context is suspended')
  for (const slot of ['takeaways', 'reading'] as Slot[]) motionMusic(slot, null, null)
  assert.equal(made.contexts, contexts + 1, 'one context for the page')
})
