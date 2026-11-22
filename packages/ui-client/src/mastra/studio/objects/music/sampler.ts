/**
 * [INPUT]: MUSIC_SCORES, partsOf, partCues and MusicSlot from ./index.ts; SAMPLES and sampleFor from ./samples.ts; onset, peakDb and rmsDb from ./meter.ts; the Cue type from ./pitch.ts;
 *          the Engine type from ./sound.ts; the browser's fetch and Web Audio (decodeAudioData, AudioBufferSourceNode, BiquadFilterNode, OscillatorNode, GainNode)
 * [OUTPUT]: Sampler (the Engine that plays the recordings on one context: prepare(slot) loads a slot's recordings, ready / level / length / start serve the Player),
 *           slotSamples(slot), cueLength(cue), attackOffset(data, rate), ONSET_DB
 * [POS]: the music set's only sound source: every cue is a recording from samples/, nothing is synthesized. Bytes are fetched once per page (only when the sound switch is on and a
 *        slot is prepared) and decoded once per context. A pitched recording starts at its attack (the first frame at its peak −40 dB, so an encoder's priming silence never delays
 *        the cue) with a 2 ms fade-in; a noise starts at 0. A pitched cue is re-pitched by playbackRate. Every cue sounds for its length in the score at most (a recording that ends
 *        sooner ends there) and releases inside it: 80 ms for a bowed, humming or gramophone note (the bow change), a quarter of the length up to 30 ms for the rest. The gramophone's
 *        line passes the horn's band (300 Hz–3 kHz) with a slow wow and a faster flutter on the detune. A part is levelled from its own mix once all its recordings are decoded
 *        (gated loudness −30 dBFS for open and loop passes, −33 for close and hover-in, peak held in −23…−15 dBFS). A recording that fails to load leaves its parts silent; the first
 *        failure writes one console line
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { partCues, partsOf, type MusicSlot } from './index.ts'
import { onset, peakDb, rmsDb } from './meter.ts'
import type { Cue } from './pitch.ts'
import { SAMPLES, sampleFor } from './samples.ts'
import type { Engine } from './sound.ts'

export const ONSET_DB = -40
const FADE_IN = .002, PEAK = { low: -23, high: -15 }
const HORN = { low: 280, high: 1850, wobble: [{ hz: .45, cents: 4.5 }, { hz: 5.5, cents: 1.5 }] }
const ROOM_TAPS: [number, number][] = [[.024, .11], [.054, .075], [.092, .045]]
const ROOM_KINDS = new Set(['piano', 'harp', 'pizz', 'bow', 'hum', 'reed', 'bell'])

/** Target gated RMS per part: melodic instruments sit warm and calm; pen strokes and cello hum stay whispered */
function targetRms(slot: MusicSlot, part: string) {
  if ((slot === 'board' && part === 'loop0') || (slot === 'materials' && part === 'loop1')) return -38
  if (slot === 'all' && part.startsWith('loop')) return -34
  if (part === 'close' || part === 'hoverIn') return -34
  return -31
}

/** Gentle lowpass warmth per voice to round off shrill highs, bow rosin and sandpaper noise */
function warmCutoff(cue: Cue): number | null {
  const s = cue.sound
  if (s.kind === 'bow') return s.instrument === 'violin' ? 2400 : 1500
  if (s.kind === 'hum') return 720
  if (s.kind === 'reed') return 3800
  if (s.kind === 'bell') return 3400
  if (s.kind === 'noise') {
    if (s.noise === 'pen') return 1800
    if (s.noise === 'page' || s.noise === 'page-flap') return 2600
    if (s.noise === 'tick' || s.noise === 'slide') return 2600
  }
  return null
}

/** Where a pitched recording's attack begins (s): the first frame at its peak −40 dB */
export const attackOffset = (data: Float32Array, rate: number) => Math.max(0, onset(data, rate, 10 ** (ONSET_DB / 20)))

/** How long a cue sounds (s): its length in the score, or its recording's at its rate when that is shorter */
export function cueLength(cue: Cue) {
  const pick = sampleFor(cue)
  return Math.min(cue.dur, SAMPLES[pick.name]!.seconds / pick.rate)
}
function releaseOf(cue: Cue, length: number) {
  if (cue.sound.kind === 'hum') return Math.min(1.1, length * .4)
  if (cue.sound.kind === 'bow') return Math.min(.36, length * .35)
  if (cue.sound.kind === 'phono' || cue.sound.kind === 'piano' || cue.sound.kind === 'harp' || cue.sound.kind === 'reed') return Math.min(.22, length * .3)
  if (cue.sound.kind === 'noise' && cue.sound.noise === 'pen') return Math.min(.06, length * .35)
  return Math.min(.04, length / 4)
}

/** The recordings a slot's score plays */
export const slotSamples = (slot: MusicSlot) => [...new Set(partsOf(slot).flatMap(part => partCues(slot, part).map(cue => sampleFor(cue).name)))]

let warned = false
function failed(name: string, error: unknown) {
  if (warned) return
  warned = true
  console.warn(`[music] sample ${name} unavailable: ${error instanceof Error ? error.message : String(error)}`)
}

const bytes = new Map<string, Promise<ArrayBuffer | null>>()
function fetchSample(name: string) {
  let hit = bytes.get(name)
  if (!hit) {
    hit = fetch(SAMPLES[name]!.url).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.arrayBuffer()
    }).catch(error => { failed(name, error); return null })
    bytes.set(name, hit)
  }
  return hit
}

interface Decoded { buffer: AudioBuffer; offset: number }

export class Sampler implements Engine {
  readonly ac: BaseAudioContext
  private decoded = new Map<string, Decoded>()
  private loading = new Map<string, Promise<void>>()
  private levels = new Map<string, number>()
  constructor(ac: BaseAudioContext) { this.ac = ac }

  /** Fetch and decode every recording of a slot; resolves when each has loaded or failed */
  prepare(slot: MusicSlot) { return Promise.all(slotSamples(slot).map(name => this.load(name))).then(() => undefined) }

  private load(name: string) {
    let hit = this.loading.get(name)
    if (!hit) {
      hit = fetchSample(name).then(async data => {
        if (!data) return
        const buffer = await this.ac.decodeAudioData(data.slice(0))
        this.decoded.set(name, { buffer, offset: SAMPLES[name]!.midi === null ? 0 : attackOffset(buffer.getChannelData(0), buffer.sampleRate) })
      }).catch(error => failed(name, error))
      this.loading.set(name, hit)
    }
    return hit
  }

  ready(slot: MusicSlot, part: string) { return partCues(slot, part).every(cue => this.decoded.has(sampleFor(cue).name)) }

  length(slot: MusicSlot, part: string) { return Math.max(0, ...partCues(slot, part).map(cue => cue.at + cueLength(cue))) }

  level(slot: MusicSlot, part: string) {
    const key = `${slot}:${part}`, known = this.levels.get(key)
    if (known !== undefined) return known
    const rate = this.ac.sampleRate, mix = new Float32Array(Math.ceil(this.length(slot, part) * rate) + 1)
    for (const cue of partCues(slot, part)) {
      const pick = sampleFor(cue), { buffer, offset } = this.decoded.get(pick.name)!, data = buffer.getChannelData(0)
      const from = Math.round(cue.at * rate), count = Math.round(cueLength(cue) * rate), head = offset * buffer.sampleRate, step = pick.rate * buffer.sampleRate / rate
      for (let k = 0; k < count && from + k < mix.length; k++) mix[from + k]! += (data[Math.floor(head + k * step)] ?? 0) * cue.level
    }
    let gain = 1
    if (mix.some(v => v !== 0)) {
      const level = targetRms(slot, part) - rmsDb(mix, rate), peak = peakDb(mix) + level
      gain = 10 ** ((level + Math.max(0, PEAK.low - peak) - Math.max(0, peak - PEAK.high)) / 20)
    }
    this.levels.set(key, gain)
    return gain
  }

  start(slot: MusicSlot, part: string, index: number, when: number, out: AudioNode) {
    const cue = partCues(slot, part)[index]!, pick = sampleFor(cue), decoded = this.decoded.get(pick.name)
    if (!decoded) return []
    const ac = this.ac, source = ac.createBufferSource(), envelope = ac.createGain(), nodes: AudioScheduledSourceNode[] = [source]
    const length = cueLength(cue), end = when + length
    source.buffer = decoded.buffer
    source.playbackRate.value = pick.rate
    let tail: AudioNode = source
    if (cue.sound.kind === 'phono') {
      const low = ac.createBiquadFilter(), high = ac.createBiquadFilter()
      low.type = 'highpass'; low.frequency.value = HORN.low
      high.type = 'lowpass'; high.frequency.value = HORN.high
      source.connect(low); low.connect(high); tail = high
      for (const { hz, cents } of HORN.wobble) {
        const lfo = ac.createOscillator(), depth = ac.createGain()
        lfo.frequency.value = hz; depth.gain.value = cents
        lfo.connect(depth); depth.connect(source.detune); lfo.start(when)
        nodes.push(lfo)
      }
    } else {
      const cutoff = warmCutoff(cue)
      if (cutoff !== null) {
        const lp = ac.createBiquadFilter()
        lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = .65
        tail.connect(lp); tail = lp
      }
    }
    const release = releaseOf(cue, length), sustainEnd = Math.max(when + FADE_IN, end - release)
    envelope.gain.setValueAtTime(0, when)
    envelope.gain.linearRampToValueAtTime(cue.level, when + FADE_IN)
    envelope.gain.setValueAtTime(cue.level, sustainEnd)
    envelope.gain.linearRampToValueAtTime(0, end)
    tail.connect(envelope)
    if (ROOM_KINDS.has(cue.sound.kind) && length >= .3) {
      const roomLp = ac.createBiquadFilter()
      roomLp.type = 'lowpass'; roomLp.frequency.value = 1900; roomLp.Q.value = .6
      tail.connect(roomLp)
      for (const [delayTime, wet] of ROOM_TAPS) {
        const tap = ac.createDelay(.2), gain = ac.createGain()
        tap.delayTime.value = delayTime; gain.gain.value = wet
        roomLp.connect(tap); tap.connect(gain); gain.connect(envelope)
      }
    }
    envelope.connect(out)
    source.start(when, decoded.offset)
    for (const node of nodes) node.stop(end + .01)
    return nodes
  }
}
