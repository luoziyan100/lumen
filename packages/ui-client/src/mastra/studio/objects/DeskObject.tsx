/**
 * [INPUT]: buildDeskObject from ./registry.ts; IsoObject; motionMusic, unlockMusic, armMusic and muteMusic from ./music/sound.ts; the localized object labels (studio.objects); DeskObjects from appearance
 * [OUTPUT]: DeskKitProvider (the kit and the sound switch for the tree below), DeskObject (one slot's object in the current kit)
 * [POS]: the bridge between the appearance preference and the views. StudioApp provides the preference; a view names only its slot and its data.
 *        The markup is rebuilt only when the kit, the slot or the data changes, so polling never restarts an animation. The host is keyed by kit, so a switch starts
 *        from rest. Only in the music kit with the switch on does a host report its motion (hover, open, typing) to the sound engine; without a provider the kit is instruments and silent.
 *        Turned on in this session (a user gesture), it unlocks the AudioContext at once and the recordings of the objects in view start loading; found on at start, it waits
 *        for the first pointerdown or keydown, so nothing loads or sounds before that. Switched off, not one recording is requested. Leaving it (switch off or kit changed) mutes: every sound fades and the AudioContext, if any, is suspended
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { DeskObjects } from '../../../appearance'
import { useT } from '../../../i18n/index.ts'
import type { BoxWords } from './box.ts'
import { IsoObject } from './IsoObject'
import type { Motion } from './music/pitch.ts'
import { armMusic, motionMusic, muteMusic, unlockMusic } from './music/sound.ts'
import { buildDeskObject, deskKit, type DeskSlot } from './registry.ts'

interface DeskKit { kit: DeskObjects; sounds: boolean }
const DeskKitContext = createContext<DeskKit>({ kit: 'instruments', sounds: false })

export function DeskKitProvider({ kit, sounds, children }: { kit: unknown; sounds: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ kit: deskKit(kit), sounds }), [kit, sounds])
  const audible = value.kit === 'music' && sounds
  const restored = useRef(true)
  useEffect(() => {
    const atStart = restored.current
    restored.current = false
    if (!audible) { muteMusic(); return }
    armMusic()
    if (!atStart) unlockMusic()
  }, [audible])
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
  const motion = useCallback((state: Motion | null, host: HTMLElement | null) => motionMusic(slot, state, host), [slot])
  return <IsoObject key={kit} markup={markup} className={className} typing={typing} onMotion={kit === 'music' && sounds ? motion : undefined} />
}
