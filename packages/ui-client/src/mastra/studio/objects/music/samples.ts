/**
 * [INPUT]: pitchOf and the Cue type from ./pitch.ts; the recordings in ./samples/ (each registered in samples/SOURCES.md)
 * [OUTPUT]: SAMPLES (every recording by name: its URL as a file asset, its measured pitch as a MIDI number or null for a noise, its length in s), MAX_SHIFT,
 *           sampleFor(cue) (the recording a cue plays and its shift in semitones and playback rate)
 * [POS]: the music set's sample manifest, pure data plus one rule; sampler.ts loads and plays what it names, the tests check it against samples/ and every score.
 *        A pitched cue plays the nearest recording of its instrument family, re-pitched by playbackRate from the recording's measured pitch (not its nominal note), never more than
 *        MAX_SHIFT semitones: piano (VCSL Steinway B), harp, solo violin arco and pizzicato, cello section (VSCO 2 CE), the music box's comb (one CC0 note per tooth group) and the
 *        metronome's bell (VCSL glockenspiel). The gramophone's line plays the violin. A noise names its recording; 'pen' picks the stroke nearest the cue's length.
 *        Each URL carries ?no-inline, so Vite always emits the file as an asset and never a data: URL (the CSP's connect-src does not allow data:)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { pitchOf, type Cue } from './pitch.ts'

export interface Sample { url: string; midi: number | null; seconds: number }
export const MAX_SHIFT = 3

export const SAMPLES: Record<string, Sample> = {
  'piano-c4': { url: new URL('./samples/piano-c4.m4a?no-inline', import.meta.url).href, midi: 59.99, seconds: 1.7 },
  'piano-e4': { url: new URL('./samples/piano-e4.m4a?no-inline', import.meta.url).href, midi: 64.01, seconds: 1.7 },
  'piano-fs4': { url: new URL('./samples/piano-fs4.m4a?no-inline', import.meta.url).href, midi: 66.0, seconds: 1.7 },
  'piano-as4': { url: new URL('./samples/piano-as4.m4a?no-inline', import.meta.url).href, midi: 70.01, seconds: 1.7 },
  'piano-c5': { url: new URL('./samples/piano-c5.m4a?no-inline', import.meta.url).href, midi: 72.0, seconds: 1.7 },
  'piano-e5': { url: new URL('./samples/piano-e5.m4a?no-inline', import.meta.url).href, midi: 76.0, seconds: 1.7 },
  'violin-arco-c4': { url: new URL('./samples/violin-arco-c4.m4a?no-inline', import.meta.url).href, midi: 60.18, seconds: 1.5 },
  'violin-arco-e4': { url: new URL('./samples/violin-arco-e4.m4a?no-inline', import.meta.url).href, midi: 64.07, seconds: 1.5 },
  'violin-arco-g4': { url: new URL('./samples/violin-arco-g4.m4a?no-inline', import.meta.url).href, midi: 66.94, seconds: 1.5 },
  'violin-arco-a4': { url: new URL('./samples/violin-arco-a4.m4a?no-inline', import.meta.url).href, midi: 69.0, seconds: 1.5 },
  'violin-pizz-a3': { url: new URL('./samples/violin-pizz-a3.m4a?no-inline', import.meta.url).href, midi: 56.96, seconds: 1.0 },
  'violin-pizz-c4': { url: new URL('./samples/violin-pizz-c4.m4a?no-inline', import.meta.url).href, midi: 59.79, seconds: 1.0 },
  'violin-pizz-a4': { url: new URL('./samples/violin-pizz-a4.m4a?no-inline', import.meta.url).href, midi: 68.97, seconds: 1.0 },
  'violin-pizz-e5': { url: new URL('./samples/violin-pizz-e5.m4a?no-inline', import.meta.url).href, midi: 76.05, seconds: 1.0 },
  'cello-hum-c2': { url: new URL('./samples/cello-hum-c2.m4a?no-inline', import.meta.url).href, midi: 36.11, seconds: 4.4 },
  'cello-hum-g2': { url: new URL('./samples/cello-hum-g2.m4a?no-inline', import.meta.url).href, midi: 42.95, seconds: 4.4 },
  'cello-hum-d3': { url: new URL('./samples/cello-hum-d3.m4a?no-inline', import.meta.url).href, midi: 50.0, seconds: 4.4 },
  'cello-hum-a3': { url: new URL('./samples/cello-hum-a3.m4a?no-inline', import.meta.url).href, midi: 57.02, seconds: 4.4 },
  'cello-bow-d3': { url: new URL('./samples/cello-bow-d3.m4a?no-inline', import.meta.url).href, midi: 50.02, seconds: 1.5 },
  'harp-d2': { url: new URL('./samples/harp-d2.m4a?no-inline', import.meta.url).href, midi: 37.92, seconds: 1.3 },
  'harp-f2': { url: new URL('./samples/harp-f2.m4a?no-inline', import.meta.url).href, midi: 40.92, seconds: 1.3 },
  'harp-a2': { url: new URL('./samples/harp-a2.m4a?no-inline', import.meta.url).href, midi: 44.94, seconds: 1.3 },
  'harp-c3': { url: new URL('./samples/harp-c3.m4a?no-inline', import.meta.url).href, midi: 47.97, seconds: 1.3 },
  'harp-e3': { url: new URL('./samples/harp-e3.m4a?no-inline', import.meta.url).href, midi: 51.95, seconds: 1.3 },
  'harp-g3': { url: new URL('./samples/harp-g3.m4a?no-inline', import.meta.url).href, midi: 54.9, seconds: 1.3 },
  'harp-b3': { url: new URL('./samples/harp-b3.m4a?no-inline', import.meta.url).href, midi: 58.86, seconds: 1.3 },
  'harp-d4': { url: new URL('./samples/harp-d4.m4a?no-inline', import.meta.url).href, midi: 61.87, seconds: 1.3 },
  'harp-f4': { url: new URL('./samples/harp-f4.m4a?no-inline', import.meta.url).href, midi: 64.99, seconds: 1.3 },
  'harp-a4': { url: new URL('./samples/harp-a4.m4a?no-inline', import.meta.url).href, midi: 68.91, seconds: 1.3 },
  'harp-c5': { url: new URL('./samples/harp-c5.m4a?no-inline', import.meta.url).href, midi: 71.89, seconds: 1.3 },
  'harp-e5': { url: new URL('./samples/harp-e5.m4a?no-inline', import.meta.url).href, midi: 75.88, seconds: 1.3 },
  'harp-g5': { url: new URL('./samples/harp-g5.m4a?no-inline', import.meta.url).href, midi: 78.94, seconds: 1.3 },
  'harp-b5': { url: new URL('./samples/harp-b5.m4a?no-inline', import.meta.url).href, midi: 82.92, seconds: 1.3 },
  'harp-d6': { url: new URL('./samples/harp-d6.m4a?no-inline', import.meta.url).href, midi: 85.93, seconds: 1.3 },
  'harp-f6': { url: new URL('./samples/harp-f6.m4a?no-inline', import.meta.url).href, midi: 88.94, seconds: 1.3 },
  'harp-a6': { url: new URL('./samples/harp-a6.m4a?no-inline', import.meta.url).href, midi: 92.81, seconds: 1.3 },
  'harp-b6': { url: new URL('./samples/harp-b6.m4a?no-inline', import.meta.url).href, midi: 94.9, seconds: 1.3 },
  'harp-d7': { url: new URL('./samples/harp-d7.m4a?no-inline', import.meta.url).href, midi: 97.92, seconds: 1.3 },
  'harp-f7': { url: new URL('./samples/harp-f7.m4a?no-inline', import.meta.url).href, midi: 100.7, seconds: 1.3 },
  'box-a5': { url: new URL('./samples/box-a5.m4a?no-inline', import.meta.url).href, midi: 81.02, seconds: 1.0 },
  'box-d6': { url: new URL('./samples/box-d6.m4a?no-inline', import.meta.url).href, midi: 85.85, seconds: 1.0 },
  'box-a6': { url: new URL('./samples/box-a6.m4a?no-inline', import.meta.url).href, midi: 92.96, seconds: 1.0 },
  'box-c7': { url: new URL('./samples/box-c7.m4a?no-inline', import.meta.url).href, midi: 95.91, seconds: 1.0 },
  'box-d7': { url: new URL('./samples/box-d7.m4a?no-inline', import.meta.url).href, midi: 97.88, seconds: 0.8 },
  'box-fs7': { url: new URL('./samples/box-fs7.m4a?no-inline', import.meta.url).href, midi: 101.94, seconds: 0.498 },
  'box-g7': { url: new URL('./samples/box-g7.m4a?no-inline', import.meta.url).href, midi: 103.01, seconds: 0.85 },
  'glock-c6': { url: new URL('./samples/glock-c6.m4a?no-inline', import.meta.url).href, midi: 84.15, seconds: 1.0 },
  'lid-open': { url: new URL('./samples/lid-open.m4a?no-inline', import.meta.url).href, midi: null, seconds: 0.312 },
  'lid-close': { url: new URL('./samples/lid-close.m4a?no-inline', import.meta.url).href, midi: null, seconds: 0.403 },
  'pen-long': { url: new URL('./samples/pen-long.m4a?no-inline', import.meta.url).href, midi: null, seconds: 0.38 },
  'pen-mid': { url: new URL('./samples/pen-mid.m4a?no-inline', import.meta.url).href, midi: null, seconds: 0.257 },
  'pen-short': { url: new URL('./samples/pen-short.m4a?no-inline', import.meta.url).href, midi: null, seconds: 0.17 },
  'page': { url: new URL('./samples/page.m4a?no-inline', import.meta.url).href, midi: null, seconds: 0.493 },
  'page-flap': { url: new URL('./samples/page-flap.m4a?no-inline', import.meta.url).href, midi: null, seconds: 0.47 },
  'needle-drop': { url: new URL('./samples/needle-drop.m4a?no-inline', import.meta.url).href, midi: null, seconds: 0.358 },
  'needle-groove': { url: new URL('./samples/needle-groove.m4a?no-inline', import.meta.url).href, midi: null, seconds: 0.97 },
  'needle-lift': { url: new URL('./samples/needle-lift.m4a?no-inline', import.meta.url).href, midi: null, seconds: 0.296 },
  'crackle': { url: new URL('./samples/crackle.m4a?no-inline', import.meta.url).href, midi: null, seconds: 6.4 },
  'wood-scrape': { url: new URL('./samples/wood-scrape.m4a?no-inline', import.meta.url).href, midi: null, seconds: 0.254 },
  'box-open': { url: new URL('./samples/box-open.m4a?no-inline', import.meta.url).href, midi: null, seconds: 0.362 },
  'box-close': { url: new URL('./samples/box-close.m4a?no-inline', import.meta.url).href, midi: null, seconds: 0.334 },
  'tick': { url: new URL('./samples/tick.m4a?no-inline', import.meta.url).href, midi: null, seconds: 0.13 },
  'slide': { url: new URL('./samples/slide.m4a?no-inline', import.meta.url).href, midi: null, seconds: 0.7 },
}

const FAMILY = { piano: 'piano-', harp: 'harp-', pizz: 'violin-pizz-', violin: 'violin-arco-', cello: 'cello-bow-', hum: 'cello-hum-', reed: 'box-', phono: 'violin-arco-', bell: 'glock-' } as const
const PENS = ['pen-short', 'pen-mid', 'pen-long']

/** The recording a cue plays: its name, the shift from the recording's measured pitch to the cue's pitch (semitones) and the playback rate for it */
export function sampleFor(cue: Cue): { name: string; shift: number; rate: number } {
  const sound = cue.sound
  if (sound.kind === 'noise') {
    const name = sound.noise === 'pen' ? PENS.reduce((a, b) => Math.abs(SAMPLES[b]!.seconds - cue.dur) < Math.abs(SAMPLES[a]!.seconds - cue.dur) ? b : a) : sound.noise
    return { name, shift: 0, rate: 1 }
  }
  const prefix = FAMILY[sound.kind === 'bow' ? sound.instrument : sound.kind], target = pitchOf(sound)!
  let name = '', shift = Infinity
  for (const [key, sample] of Object.entries(SAMPLES)) if (key.startsWith(prefix) && Math.abs(target - sample.midi!) < Math.abs(shift)) { name = key; shift = target - sample.midi! }
  return { name, shift, rate: 2 ** (shift / 12) }
}
