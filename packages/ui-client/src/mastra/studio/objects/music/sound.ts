/**
 * [INPUT]: the browser's Web Audio (AudioContext, OscillatorNode, GainNode, BiquadFilterNode); MusicSlot from ./index.ts
 * [OUTPUT]: playMusic(slot): one short, quiet synthesized sound for a click on a music object
 * [POS]: the only sound source of the music set. DeskObject calls it on a click, and only while the sound switch is on, so a switched-off app never creates an AudioContext.
 *        Hover and the event states never reach it. Every voice is oscillators under a decaying gain; no audio file is loaded.
 *        Piano and gramophone: stacked sine partials with a long decay. Violin, cello and harp: a plucked triangle through a closing low-pass. Music box: a high bell with an
 *        inharmonic partial. Stand: a soft two-note figure. Metronome: one short click
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import type { MusicSlot } from './index.ts'

const VOLUME = .08
let context: AudioContext | null = null

function audio() {
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

interface Voice { freq: number; type: OscillatorType; gain: number; decay: number; at?: number; cutoff?: number }

function play(voices: Voice[]) {
  const ac = audio(), now = ac.currentTime
  for (const v of voices) {
    const start = now + (v.at ?? 0), osc = ac.createOscillator(), amp = ac.createGain()
    osc.type = v.type
    osc.frequency.value = v.freq
    amp.gain.setValueAtTime(0, start)
    amp.gain.linearRampToValueAtTime(VOLUME * v.gain, start + .006)
    amp.gain.exponentialRampToValueAtTime(.0001, start + v.decay)
    let tail: AudioNode = amp
    if (v.cutoff) {
      const filter = ac.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(v.cutoff, start)
      filter.frequency.exponentialRampToValueAtTime(v.freq * 1.5, start + v.decay * .6)
      amp.connect(filter)
      tail = filter
    }
    osc.connect(amp)
    tail.connect(ac.destination)
    osc.start(start)
    osc.stop(start + v.decay + .05)
  }
}

const piano = (freq: number, at = 0): Voice[] => [1, 2, 3, 4].map((k, i) => ({ freq: freq * k, type: 'sine', gain: [1, .42, .2, .1][i]!, decay: 1.6 / k, at }))
const pluck = (freq: number, at = 0): Voice[] => [{ freq, type: 'triangle', gain: 1, decay: .9, at, cutoff: freq * 8 }, { freq: freq * 2, type: 'sine', gain: .25, decay: .4, at }]
const bell = (freq: number, at = 0): Voice[] => [{ freq, type: 'sine', gain: .8, decay: 1.2, at }, { freq: freq * 2.76, type: 'sine', gain: .3, decay: .5, at }]

const SOUNDS: Record<MusicSlot, () => Voice[]> = {
  reading: () => [...piano(261.63), ...piano(329.63, .02), ...piano(392, .04)],
  takeaways: () => [...piano(220), ...piano(277.18, .3)],
  board: () => [...piano(392), ...piano(523.25, .22)],
  materials: () => pluck(130.81),
  ideas: () => [...pluck(392), ...pluck(587.33, .06), ...pluck(880, .12)],
  map: () => [261.63, 329.63, 392, 523.25, 659.25].flatMap((f, i) => pluck(f, i * .07)),
  box: () => [1046.5, 1318.5, 1568].flatMap((f, i) => bell(f, i * .18)),
  all: () => [{ freq: 1800, type: 'square', gain: .5, decay: .04 }],
}

export function playMusic(slot: MusicSlot) {
  if (typeof AudioContext === 'undefined') return
  play(SOUNDS[slot]())
}
