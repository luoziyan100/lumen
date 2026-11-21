/**
 * [INPUT]: the eight instrument builders of this directory; MUSIC_OBJECTS and MusicSlot from ./music/index.ts; DeskObjects from appearance
 * [OUTPUT]: DESK_SLOTS, DeskSlot, DeskInput, deskKit (unknown kit → instruments), buildDeskObject(kit, slot, input): the one SVG for a slot in a kit
 * [POS]: the single answer to "which object stands in this slot". Every slot maps to two builders, one per kit; the views and DeskObject never branch on the kit themselves.
 *        The input carries all a builder reads (material title, the box's front-card words, localized labels), so both kits build from the same data
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import type { DeskObjects } from '../../../appearance'
import { boxSvg, type BoxLabels, type BoxWords } from './box.ts'
import { cabinetSvg, type CabinetLabels } from './cabinet.ts'
import { corkSvg } from './corkboard.ts'
import { easelSvg } from './easel.ts'
import { lampSvg } from './lamp.ts'
import { pressSvg } from './press.ts'
import { typecaseSvg } from './typecase.ts'
import { paperLines, typewriterSvg } from './typewriter.ts'
import { MUSIC_OBJECTS, type MusicSlot } from './music/index.ts'

export type DeskSlot = MusicSlot
export const DESK_SLOTS: readonly DeskSlot[] = MUSIC_OBJECTS.map(o => o.slot)
export interface DeskInput { title: string; words: BoxWords | null; labels: { box: BoxLabels; cabinet: CabinetLabels } }

const INSTRUMENTS: Record<DeskSlot, (input: DeskInput) => string> = {
  reading: ({ title }) => typewriterSvg({ lines: paperLines(title) }),
  board: () => easelSvg(),
  takeaways: () => pressSvg(),
  materials: ({ labels }) => cabinetSvg({ labels: labels.cabinet }),
  box: ({ labels, words }) => boxSvg({ labels: labels.box, words }),
  map: () => corkSvg(),
  ideas: () => lampSvg(),
  all: () => typecaseSvg(),
}

export const deskKit = (kit: unknown): DeskObjects => kit === 'music' ? 'music' : 'instruments'

export function buildDeskObject(kit: unknown, slot: DeskSlot, input: DeskInput) {
  if (deskKit(kit) === 'instruments') return INSTRUMENTS[slot](input)
  return MUSIC_OBJECTS.find(o => o.slot === slot)!.svg(input)
}
