/**
 * [INPUT]: MUSIC_SCORES, partCues and MusicSlot from ./index.ts; Sampler from ./sampler.ts; Loop and Motion from ./pitch.ts;
 *          the browser's Web Audio (AudioContext, GainNode), Web Animations (getAnimations, read only) and IntersectionObserver
 * [OUTPUT]: Engine (the one seam to the sound source), Player (schedules shots and loop passes on any context through an Engine, e.g. an OfflineAudioContext),
 *           shotFor / loopFor (the one rule for which shot a state change plays and which loop a state runs), planMotion / renderPlan (a timed run of states as the engine would sound it),
 *           motionMusic(slot, motion, host) (the host's state changed: hover, open, typing, or null when it unmounts), unlockMusic(make?) (make or resume the AudioContext inside a user gesture;
 *           `make` builds the engine on it, the Sampler by default),
 *           armMusic() (sound is wanted again; unlock on the next pointerdown or keydown unless muted before it), muteMusic() (fade everything and suspend)
 * [POS]: the music set's scheduling, the only place that decides when a sound starts and stops; what a cue sounds like is the Engine's (sampler.ts plays recordings; the tests use a fake).
 *        Every sound is a named part of an object's score: open, close, hoverIn (one-shots) and loop0…n (one pass of a loop); each slot has a shot bus and a loop bus into one master.
 *        motionMusic plays the one-shot of a state change (a new shot fades the last within 50 ms and ducks the loop for its length) and keeps the loop of the first matching state:
 *        before each pass it reads the clock animation's currentTime, delay and duration, so every pass starts on the animation's own iteration and never drifts; a pass's cues count
 *        from the end of its cycle's lead, which lets the first cue be scheduled ahead of the motion. A changed state fades the old loop within 80 ms; a loop whose animation runs on
 *        (the same clock and cycle) plays on. Only one object sounds at a time: the one under the pointer, else the one that most recently began to sound (a click's one-shot
 *        counts while it rings, so a click before the hover is confirmed still sounds); the others move on muted
 *        (80 ms fade) and, when their turn comes back, sound again from the start of their next pass, never from the middle.
 *        Nothing is fetched and nothing sounds before a context exists: only unlockMusic makes one (the switch turned on, or the first pointerdown/keydown after armMusic). From then
 *        on each object's recordings load as soon as its host is in view; a pass whose recordings are not ready is skipped, never replayed late. Reduced motion is silent
 *        (nothing moves); a hidden window fades every sound within 80 ms
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { MUSIC_SCORES, partCues, type MusicSlot } from './index.ts'
import type { Loop, Motion } from './pitch.ts'
import { Sampler } from './sampler.ts'

const SHOT_FADE = .05, LOOP_FADE = .08, HIDDEN = .08, LATE = .03, AHEAD = .3, FRESH = 50

/** What a cue sounds like: loading a slot's sounds, whether a part's sounds are ready, its levelling gain, how long it sounds (s), and starting one cue at a context time into a bus */
export interface Engine {
  prepare(slot: MusicSlot): Promise<void>
  ready(slot: MusicSlot, part: string): boolean
  level(slot: MusicSlot, part: string): number
  length(slot: MusicSlot, part: string): number
  start(slot: MusicSlot, part: string, index: number, when: number, out: AudioNode): AudioScheduledSourceNode[]
}

/* ============================================================
   Player · shots and loop passes on one context, per slot a shot bus and a loop bus
   ============================================================ */
interface Bus { gain: GainNode; sources: AudioScheduledSourceNode[] }

export class Player {
  readonly ac: BaseAudioContext
  readonly engine: Engine
  readonly master: GainNode
  private shots = new Map<MusicSlot, Bus>()
  private loops = new Map<MusicSlot, Bus>()
  constructor(ac: BaseAudioContext, engine: Engine) {
    this.ac = ac
    this.engine = engine
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
    partCues(slot, part).forEach((cue, i) => {
      if (only !== undefined && only !== i) return
      const start = when + cue.at
      if (this.ac.currentTime - start > LATE) return
      bus.sources.push(...this.engine.start(slot, part, i, Math.max(start, this.ac.currentTime), bus.gain))
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

  /** A one-shot (open, close, hoverIn) at `when`: the slot's last shot fades, its loop ducks under this one for its length; a part with no cues leaves both alone */
  shot(slot: MusicSlot, part: string, when: number, only?: number) {
    if (!partCues(slot, part).length) return
    const from = Math.max(this.ac.currentTime, when)
    this.fade(this.shots.get(slot), SHOT_FADE, from)
    this.shots.delete(slot)
    if (!this.engine.ready(slot, part)) return
    const bus = this.bus(this.engine.level(slot, part))
    this.shots.set(slot, bus)
    this.play(bus, slot, part, when, only)
    const loop = this.loops.get(slot)?.gain.gain
    if (loop) {
      const level = loop.value, back = from + this.engine.length(slot, part)
      loop.cancelScheduledValues(from)
      loop.setValueAtTime(level, from)
      loop.linearRampToValueAtTime(0, from + .06)
      loop.setValueAtTime(0, back)
      loop.linearRampToValueAtTime(level, back + .08)
    }
  }

  /** One pass of loop `index` whose iteration starts at `when` (its cues follow the cycle's lead; cues already past are skipped, never replayed late) */
  pass(slot: MusicSlot, index: number, when: number, only?: number) {
    const part = `loop${index}`
    if (!this.engine.ready(slot, part)) return
    let bus = this.loops.get(slot)
    if (!bus) { bus = this.bus(this.engine.level(slot, part)); this.loops.set(slot, bus) }
    this.play(bus, slot, part, when + MUSIC_SCORES[slot].loops[index]!.cycle.lead, only)
  }

  stopLoop(slot: MusicSlot, seconds = LOOP_FADE, at?: number) { this.fade(this.loops.get(slot), seconds, at); this.loops.delete(slot) }
  stopShot(slot: MusicSlot, seconds = SHOT_FADE, at?: number) { this.fade(this.shots.get(slot), seconds, at); this.shots.delete(slot) }
  silence(seconds: number) { for (const slot of new Set([...this.shots.keys(), ...this.loops.keys()])) { this.stopShot(slot, seconds); this.stopLoop(slot, seconds) } }
}

/* ============================================================
   Rules · which shot a change plays, which loop a state runs, and a run of states as a plan
   ============================================================ */
const REST: Motion = { hover: false, open: false, typing: false }
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
/** A timed run of one host's states (from 0 s, until `end`) as the engine sounds it: shots at the changes, every pass that starts while its loop runs (a CSS animation starts when its
 *  state begins, so passes fall at begin + delay + k × total), and a loop fade where it ends */
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

/** Schedule a plan into `ac` through `engine` (an OfflineAudioContext for the evidence) */
export function renderPlan(ac: BaseAudioContext, engine: Engine, slot: MusicSlot, plan: Plan[]) {
  const player = new Player(ac, engine)
  for (const step of plan) {
    if ('shot' in step) player.shot(slot, step.shot, step.at)
    else if ('pass' in step) player.pass(slot, step.pass, step.at)
    else player.stopLoop(slot, LOOP_FADE, step.at)
  }
  return player
}

/* ============================================================
   Motion · the app's host states drive shots and loop passes on the live context
   ============================================================ */
interface Watch { motion: Motion; host: Element | null; loop: number; key: string; token: number; timer: ReturnType<typeof setTimeout> | null; last: number; since: number; ringing: number; resume: boolean }
const watches = new Map<MusicSlot, Watch>()
let context: AudioContext | null = null, engine: Engine | null = null, player: Player | null = null, muted = false, owner: MusicSlot | null = null
let sight: IntersectionObserver | null = null
const seen = new WeakMap<Element, MusicSlot>()

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const live = () => !!player && !muted && !reduced() && !(typeof document !== 'undefined' && document.hidden)

/** Load a slot's recordings once its host is in view (at once where IntersectionObserver is missing) */
function look(slot: MusicSlot, host: Element | null) {
  if (!engine || !host || seen.has(host)) return
  seen.set(host, slot)
  if (typeof IntersectionObserver === 'undefined') { void engine.prepare(slot); return }
  sight ??= new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      sight!.unobserve(entry.target)
      void engine!.prepare(seen.get(entry.target)!)
    }
  })
  sight.observe(host)
}

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

/** Schedule the current pass (if it is just starting) and the next pass when it is near, from the clock's own phase; then wait for the next pass. Only the sounding slot schedules;
 *  a slot that has just taken its turn back skips the pass already under way */
function pump(slot: MusicSlot, w: Watch, token: number, tries = 0) {
  if (token !== w.token || w.loop < 0 || !live()) return
  const loop = MUSIC_SCORES[slot].loops[w.loop]!, clock = clockOf(w.host, loop)
  if (!clock || clock.currentTime === null || clock.startTime === null) { if (tries < 10) requestAnimationFrame(() => pump(slot, w, token, tries + 1)); return }
  const timing = clock.effect!.getTiming(), delay = Number(timing.delay ?? 0), span = Number(timing.duration)
  const frame = Number(document.timeline.currentTime ?? performance.now()), into = Number(clock.currentTime) - delay
  const start = frame + (into < 0 ? -into : -(into % span)), now = performance.now()
  if (owner === slot) {
    for (const begin of [start, start + span]) {
      if (begin <= w.last + span / 2 || begin - now > AHEAD * 1000 + 200) continue
      w.last = begin
      if (w.resume && begin + loop.cycle.lead * 1000 < now) continue
      player!.pass(slot, w.loop, heardAt(context!, begin))
    }
    w.resume = false
  }
  if (w.timer) clearTimeout(w.timer)
  w.timer = setTimeout(() => pump(slot, w, token), Math.max(50, start + span - now - AHEAD * 1000))
}

function retune(slot: MusicSlot, w: Watch) {
  const { index, key } = live() ? loopFor(slot, w.motion) : { index: -1, key: '' }
  if (key === w.key) { w.loop = index; return }
  if (w.timer) clearTimeout(w.timer)
  w.token++
  player?.stopLoop(slot)
  Object.assign(w, { loop: index, key, timer: null, last: -Infinity, resume: false })
  if (index < 0) return
  w.since = performance.now()
  const token = w.token
  requestAnimationFrame(() => requestAnimationFrame(() => pump(slot, w, token)))
}

/** Give the turn to the slot under the pointer, else to the one that most recently began to sound (a loop, or a one-shot still ringing); the one losing it fades, the one regaining it resumes at its next pass */
function elect() {
  let next: MusicSlot | null = null, latest = -Infinity
  for (const [slot, w] of watches) {
    if (w.motion.hover) { next = slot; break }
    if ((w.loop >= 0 || w.ringing > performance.now()) && w.since > latest) { latest = w.since; next = slot }
  }
  if (next === owner) return
  if (owner && player) { player.stopLoop(owner); player.stopShot(owner, LOOP_FADE) }
  owner = next
  const w = next ? watches.get(next) : undefined
  if (!next || !w || w.loop < 0 || performance.now() - w.since < FRESH) return
  w.resume = true
  pump(next, w, w.token)
}

export function motionMusic(slot: MusicSlot, motion: Motion | null, host: Element | null = null) {
  const w = watches.get(slot) ?? { motion: REST, host, loop: -1, key: '', token: 0, timer: null, last: -Infinity, since: -Infinity, ringing: -Infinity, resume: false }
  watches.set(slot, w)
  const before = w.motion
  w.motion = motion ?? REST
  w.host = host
  look(slot, host)
  if (!motion) { retune(slot, w); player?.stopShot(slot, LOOP_FADE); watches.delete(slot); elect(); return }
  const change = live() ? shotFor(before, motion) : null
  if ((motion.hover && !before.hover) || (change && change !== 'stop')) w.since = performance.now()
  if (change && change !== 'stop') w.ringing = w.since + player!.engine.length(slot, change) * 1000
  retune(slot, w)
  elect()
  const shot = owner === slot ? change : null
  if (shot === 'stop') player!.stopShot(slot, LOOP_FADE)
  else if (shot) player!.shot(slot, shot, context!.currentTime)
}

function retuneAll() { for (const [slot, w] of watches) { w.key = '\u0000'; retune(slot, w) } elect() }

export function unlockMusic(make: (ac: AudioContext) => Engine = ac => new Sampler(ac)) {
  if (typeof AudioContext === 'undefined') return
  muted = false
  if (!context) {
    context = new AudioContext()
    engine = make(context)
    player = new Player(context, engine)
    document.addEventListener('visibilitychange', () => { if (document.hidden) player?.silence(HIDDEN); retuneAll() })
  }
  if (context.state === 'suspended') void context.resume()
  for (const [slot, w] of watches) look(slot, w.host)
  retuneAll()
}

export function armMusic() {
  if (typeof window === 'undefined') return
  muted = false
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
