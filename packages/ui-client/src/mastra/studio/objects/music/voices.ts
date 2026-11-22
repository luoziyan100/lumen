/**
 * [INPUT]: Sound, Cue and the pitch map (pitchOf, hz) from ./pitch.ts
 * [OUTPUT]: voice(cue, rate, seed): one cue as mono samples (Float32Array, `rate` Hz), deterministic for a seed
 * [POS]: the synthesis of the music set, pure arithmetic with no Web Audio, so Node tests and both browsers hear the same samples. sound.ts wraps the samples in buffers.
 *        Plucked strings (harp, violin pizzicato) are Karplus-Strong loops tuned exactly by a first-order allpass; the violin adds its body modes.
 *        Comb reeds are a cantilever's modes (1 : 5.9 : 16.7) plus the pin's release tick. Piano notes stack inharmonic partials on three detuned strings with two-stage decay and a hammer knock.
 *        The bowed string is a band-limited sawtooth shaped by the body's resonances, with a slow attack, delayed vibrato and bow hiss. The gramophone's line is a reedy tone narrowed to
 *        the horn's band with wow and flutter. Every noise is seeded white noise through resonators and envelopes. Each voice fades its last 20 ms to silence
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { hz, pitchOf, type Cue, type Noise } from './pitch.ts'

const TAU = Math.PI * 2

function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1
  }
}

/* ============================================================
   Filters · RBJ biquads run in place over a sample array
   ============================================================ */
type Band = 'bandpass' | 'lowpass' | 'highpass'
function biquad(x: Float32Array, type: Band, f: number, q: number, rate: number) {
  const w = TAU * Math.min(f, rate * .45) / rate, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q)
  const [b0, b1, b2] = type === 'bandpass' ? [alpha, 0, -alpha] : type === 'lowpass' ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = x[i]!, y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y
  }
  return x
}

/** Parallel resonators: the input rung through each band and summed with its weight */
function resonate(x: Float32Array, modes: [number, number, number][], rate: number) {
  const out = new Float32Array(x.length)
  for (const [f, q, g] of modes) {
    const band = biquad(Float32Array.from(x), 'bandpass', f, q, rate)
    for (let i = 0; i < out.length; i++) out[i]! += band[i]! * g
  }
  return out
}

function finish(x: Float32Array, rate: number) {
  const tail = Math.min(x.length, Math.round(.02 * rate))
  for (let i = 0; i < tail; i++) x[x.length - 1 - i]! *= i / tail
  return x
}

/* ============================================================
   Plucked string · Karplus-Strong with an allpass fine tuner
   ============================================================ */
/** The allpass coefficient whose phase delay at w is d samples (0 < d < 1.2), by bisection */
function allpassFor(d: number, w: number) {
  const delay = (c: number) => {
    const re1 = c + Math.cos(w), im1 = -Math.sin(w), re2 = 1 + c * Math.cos(w), im2 = -c * Math.sin(w)
    return -(Math.atan2(im1, re1) - Math.atan2(im2, re2)) / w
  }
  let lo = -.3, hi = .99
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (delay(mid) > d) lo = mid; else hi = mid }
  return (lo + hi) / 2
}

function pluck(f: number, dur: number, rate: number, seed: number, t60: number, bright: number, position: number) {
  const n = Math.round(dur * rate), out = new Float32Array(n), period = rate / f
  const N = Math.floor(period - .5 - .1), c = allpassFor(period - .5 - N, TAU * f / rate)
  const g = 10 ** (-3 / (t60 * f)), rnd = random(seed), line = new Float32Array(N)
  let lp = 0
  for (let i = 0; i < N; i++) { lp += bright * (rnd() - lp); line[i] = lp }
  const shift = Math.max(1, Math.round(N * position)), excite = Float32Array.from(line)
  for (let i = 0; i < N; i++) line[i] = excite[i]! - excite[(i + shift) % N]!
  let mean = 0
  for (const v of line) mean += v / N
  for (let i = 0; i < N; i++) line[i]! -= mean
  let idx = 0, prev = 0, apIn = 0, apOut = 0
  for (let i = 0; i < n; i++) {
    const v = line[idx]!, avg = g * .5 * (v + prev)
    prev = v
    const ap = c * avg + apIn - c * apOut
    apIn = avg; apOut = ap
    line[idx] = ap
    out[i] = v
    idx = (idx + 1) % N
  }
  return out
}

/* ============================================================
   Additive tones · recursive oscillators, one per partial
   ============================================================ */
/** One sine partial under a sum of exponential decays ([weight, tau s]) after a linear attack; the envelope runs by recursion, never by exp per sample */
function partial(out: Float32Array, f: number, amp: number, rate: number, decays: [number, number][], attack: number, phase = 0) {
  if (f >= rate * .45) return
  const w = TAU * f / rate, k = 2 * Math.cos(w), rise = Math.max(1, attack * rate)
  const level = decays.map(([weight]) => weight * amp), step = decays.map(([, tau]) => Math.exp(-1 / (tau * rate)))
  let s1 = Math.sin(phase - w), s2 = Math.sin(phase - 2 * w)
  for (let i = 0; i < out.length; i++) {
    const s = k * s1 - s2
    s2 = s1; s1 = s
    let env = 0
    for (let d = 0; d < level.length; d++) { env += level[d]!; level[d]! *= step[d]! }
    out[i]! += s * env * (i < rise ? i / rise : 1)
  }
}

function piano(f: number, dur: number, rate: number, seed: number) {
  const out = new Float32Array(Math.round(dur * rate)), rnd = random(seed), B = 3.2e-4 * 2 ** ((Math.log2(f / 261.6)) * .5)
  for (let n = 1; n <= 16; n++) {
    const fn = n * f * Math.sqrt(1 + B * n * n), amp = Math.abs(Math.sin(Math.PI * n / 7.6)) / n ** .95
    const decays: [number, number][] = [[.62, .32 / (1 + .3 * n)], [.38, 2.6 / (1 + .12 * n)]]
    for (const cents of [-.7, 0, .8]) partial(out, fn * 2 ** (cents / 1200), amp / 3, rate, decays, .002, rnd() * Math.PI)
  }
  const knock = Math.round(.012 * rate), hammer = new Float32Array(knock)
  for (let i = 0; i < knock; i++) hammer[i] = rnd() * Math.exp(-i / (.002 * rate))
  biquad(hammer, 'lowpass', Math.min(3200, f * 6), .7, rate)
  for (let i = 0; i < knock; i++) out[i]! += hammer[i]! * .25
  return out
}

/** The cello body's resonances (Hz, weight); the violin's sit about 2.1 times higher */
const BODY: [number, number][] = [[98, .6], [196, .9], [275, 1], [440, .7], [580, .5], [1150, .25], [2400, .35], [3600, .12]]
const bodyGain = (f: number, scale: number) => BODY.reduce((sum, [c, g]) => sum + g / (1 + ((f - c * scale) / (c * scale * .18)) ** 2), .08)

function bowed(f: number, dur: number, rate: number, seed: number, scale: number) {
  const n = Math.round(dur * rate), out = new Float32Array(n), rnd = random(seed)
  const harmonics = Math.floor(Math.min(9000, rate * .45) / f), phase = new Float64Array(harmonics + 1), gain = new Float64Array(harmonics + 1)
  const attack = .16, release = .22
  let pressure = 0, target = 0
  for (let i = 0; i < n; i++) {
    const t = i / rate
    if (i % 512 === 0) target = rnd() * .06
    pressure += (target - pressure) * .0008
    const vib = 1 + .0025 * Math.min(1, Math.max(0, (t - .28) / .3)) * Math.sin(TAU * 5.3 * t)
    const env = Math.min(1, t / attack) * Math.min(1, (dur - t) / release) * (1 + pressure)
    if (i % 64 === 0) for (let h = 1; h <= harmonics; h++) gain[h] = bodyGain(h * f * vib, scale) / h
    let s = 0
    for (let h = 1; h <= harmonics; h++) {
      phase[h] = (phase[h]! + h * f * vib / rate) % 1
      s += Math.sin(TAU * phase[h]!) * gain[h]!
    }
    out[i] = s * env * .5
  }
  const hiss = new Float32Array(n)
  for (let i = 0; i < n; i++) hiss[i] = rnd()
  biquad(hiss, 'highpass', 2200, .7, rate)
  for (let i = 0; i < n; i++) {
    const t = i / rate, env = Math.min(1, t / .006) * Math.min(1, (dur - t) / release)
    out[i]! += hiss[i]! * env * (.03 + .09 * Math.exp(-t / .08))
  }
  return out
}

/** An open string ringing in sympathy (no bow): few partials, slow swell and fade, a slow beat */
function hum(f: number, dur: number, rate: number, seed: number) {
  const out = new Float32Array(Math.round(dur * rate)), rnd = random(seed)
  for (let n = 1; n <= 6; n++) partial(out, f * n * (1 + rnd() * .0004), bodyGain(f * n, 1) / n ** 1.4, rate, [[1, 9]], .005, rnd() * Math.PI)
  const swell = Math.min(.45, dur / 3), fall = Math.min(.6, dur / 3)
  for (let i = 0; i < out.length; i++) { const t = i / rate; out[i]! *= Math.min(1, t / swell) ** .5 * Math.min(1, (dur - t) / fall) * (1 + .12 * Math.sin(TAU * 1.3 * t)) }
  return out
}

function reed(f: number, dur: number, rate: number, seed: number) {
  const out = new Float32Array(Math.round(dur * rate)), rnd = random(seed)
  for (const [ratio, amp, tau] of [[1, 1, .9], [5.9, .22, .18], [16.7, .07, .05]] as const) partial(out, f * ratio, amp, rate, [[1, tau]], .0015, rnd())
  const tick = Math.round(.004 * rate)
  for (let i = 0; i < tick; i++) out[i]! += rnd() * .12 * (1 - i / tick)
  return out
}

function bell(f: number, dur: number, rate: number, seed: number) {
  const out = new Float32Array(Math.round(dur * rate)), rnd = random(seed)
  for (const [ratio, amp, tau] of [[1, 1, .7], [2.32, .35, .3], [4.25, .2, .14], [6.63, .1, .07]] as const) partial(out, f * ratio, amp, rate, [[1, tau]], .001, rnd())
  return out
}

/** The gramophone's line: odd-rich reedy partials, narrowed to the horn's band (300 Hz–3 kHz), on a wow (0.55 Hz) and flutter (7 Hz) that run on the record's clock */
function phono(f: number, dur: number, rate: number, seed: number, at: number) {
  const n = Math.round(dur * rate), out = new Float32Array(n), rnd = random(seed)
  let p = rnd() * .5
  for (let i = 0; i < n; i++) {
    const t = i / rate, clock = at + t, drift = 1 + .0025 * Math.sin(TAU * .55 * clock) + .0007 * Math.sin(TAU * 7 * clock)
    p = (p + f * drift / rate) % 1
    let s = 0
    for (let h = 1; h <= 9; h++) s += Math.sin(TAU * h * p) * (h % 2 ? 1 : .45) / h
    out[i] = s * Math.min(1, t / .025) * Math.min(1, (dur - t) / .04)
  }
  biquad(out, 'highpass', 300, .7, rate)
  biquad(out, 'lowpass', 3000, .7, rate)
  return biquad(out, 'lowpass', 3400, .6, rate)
}

/* ============================================================
   Noises · seeded white noise through resonators and envelopes
   ============================================================ */
function noise(kind: Noise, dur: number, rate: number, seed: number) {
  const n = Math.round(dur * rate), rnd = random(seed), x = new Float32Array(n)
  const shape = (env: (t: number) => number) => { for (let i = 0; i < n; i++) x[i] = rnd() * env(i / rate) }
  switch (kind) {
    case 'wood': {
      shape(t => Math.exp(-t / .004))
      return resonate(x, [[210, 9, 1.4], [520, 12, 1], [1130, 14, .5], [2300, 8, .2]], rate).map((v, i) => v * Math.exp(-i / rate / .07))
    }
    case 'thud': {
      shape(t => Math.exp(-t / .008))
      biquad(x, 'lowpass', 900, .7, rate)
      return resonate(x, [[95, 6, 2.2], [170, 8, 1.4], [340, 10, .5]], rate).map((v, i) => v * Math.exp(-i / rate / .12))
    }
    case 'tick': {
      shape(t => Math.exp(-t / .0008))
      return resonate(x, [[1850, 16, 1], [3350, 18, .6], [880, 10, .45]], rate).map((v, i) => v * Math.exp(-i / rate / .02))
    }
    case 'needle': {
      shape(t => Math.exp(-t / .0015))
      const knock = resonate(x, [[120, 5, 2], [2600, 6, .35]], rate)
      return knock.map((v, i) => v * Math.exp(-i / rate / .06))
    }
    case 'lift': {
      shape(t => Math.exp(-t / .001) + .12 * Math.exp(-t / .03))
      biquad(x, 'highpass', 900, .7, rate)
      return resonate(x, [[1600, 4, 1], [3800, 5, .5]], rate)
    }
    case 'crackle': {
      const hiss = new Float32Array(n)
      for (let i = 0; i < n; i++) hiss[i] = rnd() * .05
      biquad(hiss, 'bandpass', 2600, .5, rate)
      for (let i = 0; i < n; i++) if (i === 0 || rnd() > 1 - 32 / rate * 2) { const a = .25 + .75 * Math.abs(rnd()), len = Math.round(rate * .0012); for (let k = 0; k < len && i + k < n; k++) x[i + k]! += a * rnd() * (1 - k / len) }
      biquad(x, 'highpass', 1200, .7, rate)
      for (let i = 0; i < n; i++) { const t = i / rate; x[i] = (x[i]! + hiss[i]!) * Math.min(1, t / .0005) * Math.min(1, Math.max(0, (dur - t) / .3)) }
      return x
    }
    case 'paper': {
      let burst = 0
      for (let i = 0; i < n; i++) {
        const t = i / rate, hump = Math.min(1, t / .006) * (.45 + .55 * Math.sin(Math.PI * Math.min(1, t / dur)) ** .7)
        if (rnd() > .9993) burst = .6 + .4 * Math.abs(rnd())
        burst *= .9985
        x[i] = rnd() * hump * (.35 + burst)
      }
      const lo = Float32Array.from(x), hi = Float32Array.from(x)
      biquad(lo, 'bandpass', 1400, .8, rate)
      biquad(hi, 'bandpass', 4200, 1.1, rate)
      for (let i = 0; i < n; i++) { const p = i / n; x[i] = lo[i]! * (1 - p) + hi[i]! * (.5 + p) }
      return x
    }
    case 'flap': {
      shape(t => Math.min(1, t / .006) * (1 - Math.min(1, t / dur)) ** 1.5)
      return biquad(biquad(x, 'bandpass', 620, 1.2, rate), 'lowpass', 1800, .7, rate)
    }
    case 'nib': {
      let fibre = 0
      for (let i = 0; i < n; i++) {
        const t = i / rate
        if (i % Math.round(rate / 180) === 0) fibre = .4 + .6 * Math.abs(rnd())
        x[i] = rnd() * fibre * Math.min(1, t / .008) * Math.min(1, (dur - t) / .012)
      }
      return biquad(biquad(x, 'highpass', 2800, .7, rate), 'bandpass', 5200, .9, rate)
    }
    case 'scrape': {
      let slip = 0
      for (let i = 0; i < n; i++) {
        const t = i / rate
        if (i % Math.round(rate / 46) === 0) slip = .5 + .5 * Math.abs(rnd())
        x[i] = rnd() * slip * Math.min(1, t / .03) * Math.min(1, (dur - t) / .06)
      }
      return biquad(biquad(x, 'bandpass', 3100, 2.2, rate), 'bandpass', 2700, 1.4, rate)
    }
  }
}

/* ============================================================
   Entry · a cue becomes samples
   ============================================================ */
export function voice(cue: Cue, rate: number, seed: number): Float32Array {
  const { sound, dur } = cue, midi = pitchOf(sound), f = midi === null ? 0 : hz(midi)
  let x: Float32Array
  switch (sound.kind) {
    case 'harp': x = pluck(f, dur, rate, seed, 3.2 * (110 / f) ** .45, .55, .3); break
    case 'pizz': x = resonate(pluck(f, dur, rate, seed, .55 * (196 / f) ** .3, .8, .2), [[275, 6, .9], [460, 7, .8], [2800, 2, .5], [f, 4, .6]], rate); break
    case 'piano': x = piano(f, dur, rate, seed); break
    case 'bow': x = bowed(f, dur, rate, seed, sound.instrument === 'violin' ? 2.1 : 1); break
    case 'hum': x = hum(f, dur, rate, seed); break
    case 'reed': x = reed(f, dur, rate, seed); break
    case 'bell': x = bell(f, dur, rate, seed); break
    case 'phono': x = phono(f, dur, rate, seed, cue.at); break
    case 'noise': x = noise(sound.noise, dur, rate, seed); break
  }
  let peak = 0
  for (const v of x) peak = Math.max(peak, Math.abs(v))
  if (peak > 0) for (let i = 0; i < x.length; i++) x[i]! *= cue.level / peak
  return finish(x, rate)
}
