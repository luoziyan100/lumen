/**
 * [INPUT]: the music objects of this directory, MUSIC_BASE from ./line.ts, BoxWords from ../box.ts
 * [OUTPUT]: MUSIC_OBJECTS (slot, label, design-page width, builder for each of the eight), MUSIC_CSS (the one style text of the set: base plus every object's motion), PIANO_KEYS
 * [POS]: the single entry of objects/music/. The registry and the design page read the set from here, never from the object files. Slots match the instrument set one to one
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import type { BoxWords } from '../box.ts'
import { MUSIC_BASE } from './line.ts'
import { pianoSvg, PIANO_CSS } from './piano.ts'
import { violinSvg, VIOLIN_CSS } from './violin.ts'
import { celloSvg, CELLO_CSS } from './cello.ts'
import { musicBoxSvg, MUSIC_BOX_CSS } from './musicbox.ts'
import { metronomeSvg, METRONOME_CSS } from './metronome.ts'
import { harpSvg, HARP_CSS } from './harp.ts'
import { gramophoneSvg, GRAMOPHONE_CSS } from './gramophone.ts'
import { standSvg, STAND_CSS } from './stand.ts'

export { PIANO_KEYS } from './piano.ts'
export { VIOLIN_STRINGS } from './violin.ts'
export { CELLO_STRINGS } from './cello.ts'
export { MUSIC_BOX_TEETH } from './musicbox.ts'
export { HARP_STRINGS } from './harp.ts'
export { GRAMOPHONE_ARM } from './gramophone.ts'
export { STAND_PHRASE } from './stand.ts'

export type MusicSlot = 'reading' | 'board' | 'takeaways' | 'materials' | 'box' | 'map' | 'ideas' | 'all'
export interface MusicInput { words?: BoxWords }
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

export const MUSIC_CSS = MUSIC_BASE + PIANO_CSS + VIOLIN_CSS + CELLO_CSS + MUSIC_BOX_CSS + METRONOME_CSS + HARP_CSS + GRAMOPHONE_CSS + STAND_CSS
