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
const FADE_IN = .002, RELEASE = { sustained: .08, other: .03 }, PEAK = { low: -23, high: -15 }
const SUSTAINED = new Set(['bow', 'hum', 'phono'])
const HORN = { low: 300, high: 3000, wobble: [{ hz: .55, cents: 9 }, { hz: 6.5, cents: 3 }] }

/** Where a pitched recording's attack begins (s): the first frame at its peak −40 dB */
export const attackOffset = (data: Float32Array, rate: number) => Math.max(0, onset(data, rate, 10 ** (ONSET_DB / 20)))

/** How long a cue sounds (s): its length in the score, or its recording's at its rate when that is shorter */
export function cueLength(cue: Cue) {
  const pick = sampleFor(cue)
  return Math.min(cue.dur, SAMPLES[pick.name]!.seconds / pick.rate)
}
const releaseOf = (cue: Cue, length: number) => SUSTAINED.has(cue.sound.kind) ? Math.min(RELEASE.sustained, length / 2) : Math.min(RELEASE.other, length / 4)

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
      const level = (part === 'close' || part === 'hoverIn' ? -33 : -30) - rmsDb(mix, rate), peak = peakDb(mix) + level
      gain = 10 ** ((level + Math.max(0, PEAK.low - peak) - Math.max(0, peak - PEAK.high)) / 20)
    }
    this.levels.set(key, gain)
    return gain
  }

  start(slot: MusicSlot, part: string, index: number, when: number, out: AudioNode) {
    const cue = partCues(slot, part)[index]!, pick = sampleFor(cue), decoded = this.decoded.get(pick.name)
    if (!decoded) return []
    const ac = this.ac, source = ac.createBufferSource(), envelope = ac.createGain(), nodes: AudioScheduledSourceNode[] = [source], end = when + cueLength(cue)
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
    }
    envelope.gain.setValueAtTime(0, when)
    envelope.gain.linearRampToValueAtTime(cue.level, when + FADE_IN)
    envelope.gain.setValueAtTime(cue.level, end - releaseOf(cue, end - when))
    envelope.gain.linearRampToValueAtTime(0, end)
    tail.connect(envelope)
    envelope.connect(out)
    source.start(when, decoded.offset)
    for (const node of nodes) node.stop(end + .01)
    return nodes
  }
}
