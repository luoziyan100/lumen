/**
 * [INPUT]: MUSIC_SCORES and MusicSlot from ./index.ts; voice from ./voices.ts; peakDb and rmsDb from ./meter.ts; Cue, Loop and Motion from ./pitch.ts;
 *          the browser's Web Audio (BaseAudioContext, GainNode, AudioBufferSourceNode) and Web Animations (getAnimations, read only)
 * [OUTPUT]: motionMusic(slot, motion, host) (the host's state changed: hover, open, typing, or null when it unmounts), unlockMusic() (make or resume the AudioContext inside a user gesture),
 *           armMusic() (unlock on the next pointerdown or keydown), muteMusic() (fade everything and suspend), warmMusic() (build every sound's samples in idle time),
 *           RATE, partsOf, partCues, partVoices / mixPart / partLength (a sound as samples, pure), Player (schedules shots and loop passes on any context, e.g. an OfflineAudioContext),
 *           shotFor / loopFor (the one rule for which shot a state change plays and which loop a state runs), planMotion / renderPlan (a timed run of states as the engine would sound it)
 * [POS]: the only sound source of the music set, and its only Web Audio code. Every sound is a named part of an object's score: open, close, hoverIn (one-shots) and loop0…n (one pass of a loop).
 *        A part's cues become buffer sources at their times, through the object's shot bus or loop bus into one master gain. Samples are built once at RATE (44.1 kHz) in pure JS
 *        and levelled from their own mix (gated loudness −30 dBFS for open and loop passes, −33 for close and hover-in; peak held in −23…−15 dBFS).
 *        motionMusic plays the one-shot of a state change (a new shot fades the last within 50 ms and ducks the loop for its length) and keeps the loop of the first matching state:
 *        before each pass it reads the clock animation's currentTime, delay and duration, so every pass starts on the animation's own iteration and never drifts; a changed state
 *        fades the old loop within 80 ms. Nothing sounds before a context exists: only unlockMusic makes one (the switch turned on, or the first pointerdown/keydown after armMusic), and
 *        motions before it are never replayed. Reduced motion is silent (nothing moves); a hidden window fades every sound within 80 ms
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { MUSIC_SCORES, type MusicSlot } from './index.ts'
import { peakDb, rmsDb } from './meter.ts'
import type { Cue, Loop, Motion } from './pitch.ts'
import { voice } from './voices.ts'

export const RATE = 44100
const SHOT_FADE = .05, LOOP_FADE = .08, HIDDEN = .08, PEAK = { low: -23, high: -15 }, LATE = .03, AHEAD = .3

/* ============================================================
   Parts · every sound of a slot by name, as pure samples
   ============================================================ */
export const partsOf = (slot: MusicSlot) => ['open', 'close', 'hoverIn', ...MUSIC_SCORES[slot].loops.map((_, i) => `loop${i}`)]
export function partCues(slot: MusicSlot, part: string): Cue[] {
  const score = MUSIC_SCORES[slot]
  return part.startsWith('loop') ? score.loops[Number(part.slice(4))]!.cues : score[part as 'open' | 'close' | 'hoverIn']
}

const seedOf = (key: string) => [...key].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261)
const built = new Map<string, { cues: Cue[]; samples: Float32Array[]; gain: number }>()

export function partVoices(slot: MusicSlot, part: string) {
  const key = `${slot}:${part}`
  let hit = built.get(key)
  if (!hit) {
    const cues = partCues(slot, part), samples = cues.map((cue, i) => voice(cue, RATE, seedOf(`${key}:${i}`)))
    hit = { cues, samples, gain: 1 }
    const mix = mixAt(cues, samples, 1)
    if (mix.length) {
      const level = (part === 'close' || part === 'hoverIn' ? -33 : -30) - rmsDb(mix, RATE), peak = peakDb(mix) + level
      hit.gain = 10 ** ((level + Math.max(0, PEAK.low - peak) - Math.max(0, peak - PEAK.high)) / 20)
    }
    built.set(key, hit)
  }
  return hit
}

function mixAt(cues: Cue[], samples: Float32Array[], gain: number) {
  const length = Math.max(0, ...cues.map((cue, i) => Math.round(cue.at * RATE) + samples[i]!.length)), out = new Float32Array(length)
  cues.forEach((cue, i) => { const from = Math.round(cue.at * RATE); samples[i]!.forEach((v, k) => { out[from + k]! += v * gain }) })
  return out
}

/** A part's whole sound as samples at RATE, levelled as it plays; `only` keeps one cue (by index) at its time */
export function mixPart(slot: MusicSlot, part: string, only?: number) {
  const { cues, samples, gain } = partVoices(slot, part)
  const keep = (i: number) => only === undefined || only === i
  return mixAt(cues.filter((_, i) => keep(i)), samples.filter((_, i) => keep(i)), gain)
}

/** How long a part sounds (s): its last cue's time plus that cue's length */
export function partLength(slot: MusicSlot, part: string) {
  const { cues, samples } = partVoices(slot, part)
  return Math.max(0, ...cues.map((cue, i) => cue.at + samples[i]!.length / RATE))
}

/** Build every sound's samples, one slot per idle slice, so the first motion does not wait for synthesis */
export function warmMusic() {
  const idle = (run: () => void) => typeof requestIdleCallback === 'function' ? requestIdleCallback(run) : setTimeout(run, 50)
  const slots = Object.keys(MUSIC_SCORES) as MusicSlot[]
  const next = () => { const slot = slots.shift(); if (!slot) return; for (const part of partsOf(slot)) partVoices(slot, part); idle(next) }
  idle(next)
}

/* ============================================================
   Player · shots and loop passes on one context, per slot a shot bus and a loop bus
   ============================================================ */
interface Bus { gain: GainNode; sources: AudioBufferSourceNode[] }

export class Player {
  readonly ac: BaseAudioContext
  readonly master: GainNode
  private shots = new Map<MusicSlot, Bus>()
  private loops = new Map<MusicSlot, Bus>()
  constructor(ac: BaseAudioContext) {
    this.ac = ac
    this.master = ac.createGain()
    this.master.connect(ac.destination)
  }

  private bus(level: number): Bus {
    const gain = this.ac.createGain()
    gain.gain.value = level
    gain.connect(this.master)
    return { gain, sources: [] }
  }

  private play(bus: Bus, slot: MusicSlot, part: string, when: number, only?: number) {
    const { cues, samples } = partVoices(slot, part)
    samples.forEach((data, i) => {
      if (only !== undefined && only !== i) return
      const start = when + cues[i]!.at
      if (this.ac.currentTime - start > LATE) return
      const buffer = this.ac.createBuffer(1, data.length, RATE), source = this.ac.createBufferSource()
      buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0)
      source.buffer = buffer
      source.connect(bus.gain)
      source.start(Math.max(start, this.ac.currentTime))
      bus.sources.push(source)
    })
  }

  private fade(bus: Bus | undefined, seconds: number, at = this.ac.currentTime) {
    if (!bus) return
    const gain = bus.gain.gain
    gain.cancelScheduledValues(at)
    gain.setValueAtTime(gain.value, at)
    gain.linearRampToValueAtTime(0, at + seconds)
    for (const source of bus.sources) source.stop(at + seconds + .01)
  }

  /** A one-shot (open, close, hoverIn) at `when`: the slot's last shot fades, its loop ducks under this one for its length */
  shot(slot: MusicSlot, part: string, when: number, only?: number) {
    const from = Math.max(this.ac.currentTime, when)
    this.fade(this.shots.get(slot), SHOT_FADE, from)
    this.shots.delete(slot)
    const { cues, gain } = partVoices(slot, part)
    if (!cues.length) return
    const bus = this.bus(gain)
    this.shots.set(slot, bus)
    this.play(bus, slot, part, when, only)
    const loop = this.loops.get(slot)?.gain.gain
    if (loop) {
      const level = loop.value, back = from + partLength(slot, part)
      loop.cancelScheduledValues(from)
      loop.setValueAtTime(level, from)
      loop.linearRampToValueAtTime(0, from + .06)
      loop.setValueAtTime(0, back)
      loop.linearRampToValueAtTime(level, back + .08)
    }
  }

  /** One pass of loop `index` starting at `when` (cues already past are skipped, never replayed late) */
  pass(slot: MusicSlot, index: number, when: number, only?: number) {
    const part = `loop${index}`
    let bus = this.loops.get(slot)
    if (!bus) { bus = this.bus(partVoices(slot, part).gain); this.loops.set(slot, bus) }
    this.play(bus, slot, part, when, only)
  }

  stopLoop(slot: MusicSlot, seconds = LOOP_FADE, at?: number) { this.fade(this.loops.get(slot), seconds, at); this.loops.delete(slot) }
  stopShot(slot: MusicSlot, seconds = SHOT_FADE, at?: number) { this.fade(this.shots.get(slot), seconds, at); this.shots.delete(slot) }
  silence(seconds: number) { for (const slot of new Set([...this.shots.keys(), ...this.loops.keys()])) { this.stopShot(slot, seconds); this.stopLoop(slot, seconds) } }
}

/* ============================================================
   Motion · the app's host states drive shots and loop passes
   ============================================================ */
interface Watch { motion: Motion; host: Element | null; loop: number; key: string; token: number; timer: ReturnType<typeof setTimeout> | null; last: number }
const REST: Motion = { hover: false, open: false, typing: false }
const watches = new Map<MusicSlot, Watch>()
let context: AudioContext | null = null, player: Player | null = null, muted = false

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const matches = (loop: Loop, m: Motion) => Object.entries(loop.when).every(([k, v]) => m[k as keyof Motion] === v)

/** The one-shot a state change plays: open or close on a click, hoverIn when the pointer comes to a closed host, 'stop' (fade the hover-in) when it leaves one */
export function shotFor(before: Motion, after: Motion): string | null {
  if (after.open !== before.open) return after.open ? 'open' : 'close'
  if (after.hover && !before.hover && !after.open) return 'hoverIn'
  if (!after.hover && before.hover && !after.open) return 'stop'
  return null
}
/** The loop a state runs (index, or −1) and its key: the same key means the same CSS animation runs on, so the passes go on without a restart */
export function loopFor(slot: MusicSlot, motion: Motion) {
  const index = MUSIC_SCORES[slot].loops.findIndex(loop => matches(loop, motion)), loop = MUSIC_SCORES[slot].loops[index]
  return { index, key: loop ? `${loop.clock.animation}:${loop.clock.target}:${loop.cycle.total}` : '' }
}

export type Plan = { at: number; shot: string } | { at: number; pass: number } | { at: number; stopLoop: true }
/** A timed run of host states (from 0 s, until `end`) as the engine sounds it: shots at the changes, every pass that starts while its loop runs (a CSS animation starts when its state begins,
 *  so passes fall at begin + delay + k × total), and a loop fade where it ends */
export function planMotion(slot: MusicSlot, steps: { at: number; motion: Motion }[], end: number): Plan[] {
  const plan: Plan[] = []
  let before = REST, key = '', index = -1, born = 0
  const close = (until: number) => {
    if (index < 0) return
    const loop = MUSIC_SCORES[slot].loops[index]!
    for (let begin = born + loop.clock.delay; begin < until; begin += loop.cycle.total) plan.push({ at: begin, pass: index })
    plan.push({ at: until, stopLoop: true })
  }
  for (const step of steps) {
    const shot = shotFor(before, step.motion), next = loopFor(slot, step.motion)
    if (next.key !== key) { close(step.at); key = next.key; born = step.at }
    index = next.index
    if (shot && shot !== 'stop') plan.push({ at: step.at, shot })
    before = step.motion
  }
  close(end)
  return plan.sort((a, b) => a.at - b.at)
}

/** Schedule a plan into `ac` (an OfflineAudioContext for the evidence); `only` keeps one part */
export function renderPlan(ac: BaseAudioContext, slot: MusicSlot, plan: Plan[]) {
  const player = new Player(ac)
  for (const step of plan) {
    if ('shot' in step) player.shot(slot, step.shot, step.at)
    else if ('pass' in step) player.pass(slot, step.pass, step.at)
    else player.stopLoop(slot, LOOP_FADE, step.at)
  }
  return player
}
const live = () => !!player && !muted && !reduced() && !(typeof document !== 'undefined' && document.hidden)

/** The context time heard at a performance time (ms), from the output timestamp when the context gives one */
function heardAt(ac: AudioContext, perf: number) {
  const stamp = typeof ac.getOutputTimestamp === 'function' ? ac.getOutputTimestamp() : null
  if (!stamp?.performanceTime || stamp.contextTime === undefined) return ac.currentTime + (perf - performance.now()) / 1000
  return stamp.contextTime + (perf - stamp.performanceTime) / 1000
}

function clockOf(host: Element | null, loop: Loop) {
  if (!host || typeof host.getAnimations !== 'function') return null
  return host.getAnimations({ subtree: true }).find(a => (a as CSSAnimation).animationName === loop.clock.animation &&
    ((a.effect as KeyframeEffect | null)?.target as Element | null)?.classList.contains(loop.clock.target)) ?? null
}

/** Schedule the current pass (if it is just starting) and the next pass when it is near, from the clock's own phase; then wait for the next pass */
function pump(slot: MusicSlot, w: Watch, token: number, tries = 0) {
  if (token !== w.token || w.loop < 0 || !live()) return
  const loop = MUSIC_SCORES[slot].loops[w.loop]!, clock = clockOf(w.host, loop)
  if (!clock || clock.currentTime === null) { if (tries < 6) requestAnimationFrame(() => pump(slot, w, token, tries + 1)); return }
  const timing = clock.effect!.getTiming(), delay = Number(timing.delay ?? 0), span = Number(timing.duration)
  const frame = Number(document.timeline.currentTime ?? performance.now()), into = Number(clock.currentTime) - delay
  const start = frame + (into < 0 ? -into : -(into % span)), now = performance.now()
  for (const begin of [start, start + span]) {
    if (begin <= w.last + span / 2 || begin - now > AHEAD * 1000 + 200) continue
    player!.pass(slot, w.loop, heardAt(context!, begin))
    w.last = begin
  }
  w.timer = setTimeout(() => pump(slot, w, token), Math.max(50, start + span - now - AHEAD * 1000))
}

function retune(slot: MusicSlot, w: Watch) {
  const { index, key } = live() ? loopFor(slot, w.motion) : { index: -1, key: '' }
  if (key === w.key) { w.loop = index; return }
  if (w.timer) clearTimeout(w.timer)
  w.token++
  player?.stopLoop(slot)
  Object.assign(w, { loop: index, key, timer: null, last: -Infinity })
  if (index >= 0) { const token = w.token; requestAnimationFrame(() => requestAnimationFrame(() => pump(slot, w, token))) }
}

export function motionMusic(slot: MusicSlot, motion: Motion | null, host: Element | null = null) {
  const w = watches.get(slot) ?? { motion: REST, host, loop: -1, key: '', token: 0, timer: null, last: -Infinity }
  watches.set(slot, w)
  const before = w.motion
  w.motion = motion ?? REST
  w.host = host
  if (!motion) { retune(slot, w); player?.stopShot(slot, LOOP_FADE); watches.delete(slot); return }
  const shot = live() ? shotFor(before, motion) : null
  if (shot === 'stop') player!.stopShot(slot, LOOP_FADE)
  else if (shot) player!.shot(slot, shot, context!.currentTime)
  retune(slot, w)
}

function retuneAll() { for (const [slot, w] of watches) { w.key = '\u0000'; retune(slot, w) } }

export function unlockMusic() {
  if (typeof AudioContext === 'undefined') return
  muted = false
  if (!context) {
    context = new AudioContext()
    player = new Player(context)
    document.addEventListener('visibilitychange', () => { if (document.hidden) player?.silence(HIDDEN); retuneAll() })
  }
  if (context.state === 'suspended') void context.resume()
  retuneAll()
}

export function armMusic() {
  if (typeof window === 'undefined') return
  const once = () => { window.removeEventListener('pointerdown', once, true); window.removeEventListener('keydown', once, true); if (!muted) unlockMusic() }
  window.addEventListener('pointerdown', once, true)
  window.addEventListener('keydown', once, true)
}

export function muteMusic() {
  muted = true
  if (!context || !player) return
  player.silence(SHOT_FADE)
  retuneAll()
  const ac = context
  setTimeout(() => { if (muted) void ac.suspend() }, SHOT_FADE * 1000 + 30)
}
