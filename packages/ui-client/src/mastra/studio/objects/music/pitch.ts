/**
 * [INPUT]: the Cycle type from ./cycle.ts
 * [OUTPUT]: Sound, Cue, Loop, Motion and Score types (an object's score: its click cues, its hover-in cues and its loops), pitchOf(sound) (part number → MIDI note), hz(midi), inKey(midi),
 *           D_MAJOR, VIOLIN_OPEN, CELLO_OPEN, ms(seconds)
 * [POS]: the score types and the one pitch map of the music set. Every object file writes its score with these types; sound.ts turns a cue into sound and the tests check pitch with the same map.
 *        A part number goes in and a MIDI note comes out, tuned as the real instrument: the piano's white keys from A0 = 0 (a sharp is the black key after it), the harp's strings from
 *        C2 with its pedals in D major (C and F sound sharp), the comb a D major scale from G5, the strings on their open fifths. Click sounds are composed in D major; a drawn key or
 *        string keeps its own pitch even outside it (the piano's hover phrase is on white keys)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */

import type { Cycle } from './cycle.ts'

export type Noise = 'wood' | 'thud' | 'paper' | 'flap' | 'needle' | 'crackle' | 'lift' | 'scrape' | 'tick' | 'nib'
export type Sound =
  | { kind: 'piano'; white: number; sharp?: boolean }
  | { kind: 'harp'; string: number }
  | { kind: 'pizz'; string: number }
  | { kind: 'bow'; instrument: 'violin' | 'cello'; string: number }
  | { kind: 'hum'; string: number }
  | { kind: 'reed'; tooth: number }
  | { kind: 'phono'; degree: number }
  | { kind: 'bell'; degree: number }
  | { kind: 'noise'; noise: Noise }

/** One sound of a click: when (s after the click), how long (s), the drawn part whose motion makes it (the CSS class after the prefix), what sounds and how loud (0–1) */
export interface Cue { at: number; dur: number; part: string; sound: Sound; level: number }
/** The host's state as the sound engine sees it */
export interface Motion { hover: boolean; open: boolean; typing: boolean }
/** A lasting motion: while the host matches `when`, the clock animation (name, the class of the element it runs on, its delay in s) plays one pass of `cycle.run` then rests;
 *  each pass sounds `cues`, timed from the clock's iteration start (after its delay) */
export interface Loop { when: Partial<Motion>; cycle: Cycle; clock: { animation: string; target: string; delay: number }; cues: Cue[] }
/** An object's score: the click's open and close cues (`limit`: their longest length), the cues when the pointer comes in while closed, and its loops (first match wins) */
export interface Score { open: Cue[]; close: Cue[]; hoverIn: Cue[]; loops: Loop[]; limit: number }

export const D_MAJOR = [2, 4, 6, 7, 9, 11, 1]
export const VIOLIN_OPEN = [55, 62, 69, 76]
export const CELLO_OPEN = [36, 43, 50, 57]

const STEPS = [0, 2, 4, 5, 7, 9, 11]
const FROM_A = [0, 2, 3, 5, 7, 8, 10]
const HARP_LETTERS = [1, 2, 4, 6, 7, 9, 11]
const scale = (root: number, degree: number) => root + 12 * Math.floor(degree / 7) + STEPS[((degree % 7) + 7) % 7]!

export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
export const inKey = (midi: number) => D_MAJOR.includes(((midi % 12) + 12) % 12)
export const ms = (seconds: number) => Math.round(seconds * 1000)

export function pitchOf(sound: Sound): number | null {
  switch (sound.kind) {
    case 'piano': return 21 + 12 * Math.floor(sound.white / 7) + FROM_A[sound.white % 7]! + (sound.sharp ? 1 : 0)
    case 'harp': return 36 + 12 * Math.floor(sound.string / 7) + HARP_LETTERS[sound.string % 7]!
    case 'pizz': return VIOLIN_OPEN[sound.string]!
    case 'bow': return (sound.instrument === 'violin' ? VIOLIN_OPEN : CELLO_OPEN)[sound.string]!
    case 'hum': return CELLO_OPEN[sound.string]!
    case 'reed': return scale(74, 3 + sound.tooth)
    case 'phono': return scale(62, sound.degree)
    case 'bell': return scale(86, sound.degree)
    case 'noise': return null
  }
}
