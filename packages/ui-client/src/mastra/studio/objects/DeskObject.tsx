/**
 * [INPUT]: buildDeskObject from ./registry.ts; IsoObject; playMusic from ./music/sound.ts; the localized object labels (studio.objects); DeskObjects from appearance
 * [OUTPUT]: DeskKitProvider (the kit and the sound switch for the tree below), DeskObject (one slot's object in the current kit)
 * [POS]: the bridge between the appearance preference and the views. StudioApp provides the preference; a view names only its slot and its data.
 *        The markup is rebuilt only when the kit, the slot or the data changes, so polling never restarts an animation. The host is keyed by kit, so a switch starts
 *        from rest. A click plays a sound only in the music kit with the switch on; without a provider the kit is instruments and silent
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import type { DeskObjects } from '../../../appearance'
import { useT } from '../../../i18n/index.ts'
import type { BoxWords } from './box.ts'
import { IsoObject } from './IsoObject'
import { playMusic } from './music/sound.ts'
import { buildDeskObject, deskKit, type DeskSlot } from './registry.ts'

interface DeskKit { kit: DeskObjects; sounds: boolean }
const DeskKitContext = createContext<DeskKit>({ kit: 'instruments', sounds: false })

export function DeskKitProvider({ kit, sounds, children }: { kit: unknown; sounds: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ kit: deskKit(kit), sounds }), [kit, sounds])
  return <DeskKitContext.Provider value={value}>{children}</DeskKitContext.Provider>
}

export function DeskObject({ slot, className, title = '', words = null, typing }: {
  slot: DeskSlot
  className: string
  /** The material whose title the reading object shows */
  title?: string
  /** The box's front card */
  words?: BoxWords | null
  typing?: boolean
}) {
  const { kit, sounds } = useContext(DeskKitContext)
  const labels = useT().studio.objects
  const wordsKey = words ? JSON.stringify(words) : ''
  const markup = useMemo(() => buildDeskObject(kit, slot, { title, words, labels }), [kit, slot, title, wordsKey, labels])
  const press = useCallback(() => playMusic(slot), [slot])
  return <IsoObject key={kit} markup={markup} className={className} typing={typing} onPress={kit === 'music' && sounds ? press : undefined} />
}
