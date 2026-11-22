/**
 * [INPUT]: the music objects of this directory and their click scores, MUSIC_BASE from ./line.ts, the Score type from ./pitch.ts, BoxWords from ../box.ts
 * [OUTPUT]: MUSIC_OBJECTS (slot, label, design-page width, builder for each of the eight), MUSIC_SCORES (each slot's click score), MUSIC_CSS (the one style text of the set: base plus every object's motion), PIANO_KEYS
 * [POS]: the single entry of objects/music/. The registry and the design page read the set from here, never from the object files. Slots match the instrument set one to one
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import type { BoxWords } from '../box.ts'
import { MUSIC_BASE } from './line.ts'
import type { Score } from './pitch.ts'
import { pianoSvg, PIANO_CSS, PIANO_SCORE } from './piano.ts'
import { violinSvg, VIOLIN_CSS, VIOLIN_SCORE } from './violin.ts'
import { celloSvg, CELLO_CSS, CELLO_SCORE } from './cello.ts'
import { musicBoxSvg, MUSIC_BOX_CSS, MUSIC_BOX_SCORE } from './musicbox.ts'
import { metronomeSvg, METRONOME_CSS, METRONOME_SCORE } from './metronome.ts'
import { harpSvg, HARP_CSS, HARP_SCORE } from './harp.ts'
import { gramophoneSvg, GRAMOPHONE_CSS, GRAMOPHONE_SCORE } from './gramophone.ts'
import { standSvg, STAND_CSS, STAND_SCORE } from './stand.ts'

export { PIANO_KEYS } from './piano.ts'
export { VIOLIN_STRINGS } from './violin.ts'
export { CELLO_STRINGS } from './cello.ts'
export { MUSIC_BOX_TEETH } from './musicbox.ts'
export { HARP_STRINGS } from './harp.ts'
export { GRAMOPHONE_ARM } from './gramophone.ts'
export { STAND_PHRASE } from './stand.ts'

export type MusicSlot = 'reading' | 'board' | 'takeaways' | 'materials' | 'box' | 'map' | 'ideas' | 'all'
export interface MusicInput { words?: BoxWords | null }
/** crop: the viewBox region of the design page's 3× capture */
export interface MusicObject { slot: MusicSlot; label: string; width: number; crop: [number, number, number, number]; svg: (input: MusicInput) => string }

export const MUSIC_OBJECTS: MusicObject[] = [
  { slot: 'reading', label: 'PIANO · I', width: 640, crop: [40, 130, 220, 130], svg: () => pianoSvg() },
  { slot: 'board', label: 'LEGGIO · II', width: 640, crop: [320, 180, 150, 70], svg: () => standSvg() },
  { slot: 'takeaways', label: 'GRAMMOFONO · III', width: 640, crop: [470, 70, 150, 150], svg: () => gramophoneSvg() },
  { slot: 'materials', label: 'VIOLONCELLO · IV', width: 280, crop: [66, 176, 96, 96], svg: () => celloSvg() },
  { slot: 'box', label: 'CARILLON · V', width: 260, crop: [60, 80, 100, 60], svg: ({ words }) => musicBoxSvg({ words: words ?? null }) },
  { slot: 'map', label: 'ARPA · VI', width: 640, crop: [140, 14, 130, 90], svg: () => harpSvg() },
  { slot: 'ideas', label: 'VIOLINO · VII', width: 640, crop: [130, 36, 150, 120], svg: () => violinSvg() },
  { slot: 'all', label: 'METRONOMO · VIII', width: 640, crop: [200, 120, 110, 90], svg: () => metronomeSvg() },
]

/** Each object's click score by slot: the one timetable its click motion and its sound both read */
export const MUSIC_SCORES: Record<MusicSlot, Score> = {
  reading: PIANO_SCORE, board: STAND_SCORE, takeaways: GRAMOPHONE_SCORE, materials: CELLO_SCORE, box: MUSIC_BOX_SCORE, map: HARP_SCORE, ideas: VIOLIN_SCORE, all: METRONOME_SCORE,
}

export const MUSIC_CSS = MUSIC_BASE + PIANO_CSS + VIOLIN_CSS + CELLO_CSS + MUSIC_BOX_CSS + METRONOME_CSS + HARP_CSS + GRAMOPHONE_CSS + STAND_CSS
