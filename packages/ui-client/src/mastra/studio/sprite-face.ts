/**
 * [INPUT]: Session state, React, document visibility, reduced motion and an injectable clock
 * [OUTPUT]: FaceDriver and useSpriteExpression; one expression snapshot for both body and avatar
 * [POS]: Sole owner of expression timing; renderers never schedule their own blink or speech
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react'

export type SpriteState = 'idle' | 'running' | 'waiting' | 'speaking'
export type SpriteFaceName = 'neutral' | 'blink' | 'thinking' | 'warm' | 'speaking'
export const SPRITE_FACES: readonly SpriteFaceName[] = ['neutral', 'blink', 'thinking', 'warm', 'speaking']
export interface SpriteExpression { face: SpriteFaceName; hidden: boolean; reduced: boolean }

export const BLINK_MIN_MS = 4000
export const BLINK_MAX_MS = 7000
export const BLINK_MS = 120
export const TALK_MIN_MS = 180
export const TALK_MAX_MS = 260

/** 会话信号 → 表情状态：等你压过运行（审批挂起时 running 仍为真），说话压过等你。 */
export function spriteState(signals: { running: boolean; waiting: boolean; streaming?: boolean }): SpriteState {
  if (signals.streaming) return 'speaking'
  if (signals.waiting) return 'waiting'
  if (signals.running) return 'running'
  return 'idle'
}

/** 静止表情：说话与空闲都靠 neutral 落地，眨眼只叠在空闲上。 */
export function faceFor(state: SpriteState): SpriteFaceName {
  if (state === 'running') return 'thinking'
  if (state === 'waiting') return 'warm'
  if (state === 'speaking') return 'speaking'
  return 'neutral'
}

export interface FaceClock {
  set(callback: () => void, ms: number): number
  clear(handle: number): void
}
export const browserClock: FaceClock = {
  set: (callback, ms) => window.setTimeout(callback, ms),
  clear: handle => window.clearTimeout(handle),
}

/** One timer owns the cadence. State, visibility and unmount cancel the previous schedule.
 * Reduced/hidden drivers emit only the state's static face and never schedule a callback.
 */
export class FaceDriver {
  private state: SpriteState
  private face: SpriteFaceName
  private handle: number | null = null
  private disposed = false
  private hidden: boolean

  private readonly emit: (face: SpriteFaceName) => void
  private readonly clock: FaceClock
  private readonly random: () => number
  private readonly reduced: boolean

  constructor(emit: (face: SpriteFaceName) => void, state: SpriteState, clock: FaceClock = browserClock, random: () => number = Math.random, reduced = false, hidden = false) {
    this.emit = emit
    this.clock = clock
    this.random = random
    this.reduced = reduced
    this.hidden = hidden
    this.state = state
    this.face = faceFor(state)
    this.start()
  }

  get current(): SpriteFaceName { return this.face }

  setState(next: SpriteState) {
    if (this.disposed || next === this.state) return
    this.state = next
    this.start()
  }

  setHidden(hidden: boolean) {
    if (this.disposed || hidden === this.hidden) return
    this.hidden = hidden
    this.start()
  }

  dispose() {
    this.disposed = true
    this.cancel()
  }

  private between(min: number, max: number) {
    return Math.round(min + this.random() * (max - min))
  }

  private cancel() {
    if (this.handle !== null) this.clock.clear(this.handle)
    this.handle = null
  }

  private show(face: SpriteFaceName) {
    if (face === this.face) return
    this.face = face
    this.emit(face)
  }

  private start() {
    this.cancel()
    if (this.reduced || this.hidden) { this.show(faceFor(this.state)); return }
    if (this.state === 'idle') { this.show('neutral'); this.blinkLater(); return }
    if (this.state === 'speaking') { this.show('speaking'); this.talkLater(); return }
    this.show(faceFor(this.state))
  }

  private blinkLater() {
    this.handle = this.clock.set(() => {
      this.handle = null
      this.show('blink')
      this.handle = this.clock.set(() => {
        this.handle = null
        this.show('neutral')
        this.blinkLater()
      }, BLINK_MS)
    }, this.between(BLINK_MIN_MS, BLINK_MAX_MS))
  }

  private talkLater() {
    this.handle = this.clock.set(() => {
      this.handle = null
      this.show(this.face === 'speaking' ? 'neutral' : 'speaking')
      this.talkLater()
    }, this.between(TALK_MIN_MS, TALK_MAX_MS))
  }
}

/** Mount once in the owner; the same snapshot survives body/avatar mount changes. */
export function useSpriteExpression(state: SpriteState, reduced: boolean, visible = true): SpriteExpression {
  const [face, setFace] = useState(() => faceFor(state))
  const [hidden, setHidden] = useState(() => document.hidden)
  const latest = useRef({ state, visible })
  latest.current = { state, visible }
  const driver = useRef<FaceDriver | null>(null)
  useEffect(() => {
    const next = new FaceDriver(setFace, latest.current.state, browserClock, Math.random, reduced, document.hidden || !latest.current.visible)
    driver.current = next
    setFace(next.current)
    return () => { next.dispose(); driver.current = null }
  }, [reduced])
  useEffect(() => { driver.current?.setState(state) }, [state])
  useEffect(() => { driver.current?.setHidden(document.hidden || !visible) }, [visible])
  useEffect(() => {
    const reflect = () => {
      driver.current?.setHidden(document.hidden || !latest.current.visible)
      setHidden(document.hidden)
    }
    document.addEventListener('visibilitychange', reflect)
    return () => document.removeEventListener('visibilitychange', reflect)
  }, [])
  return { face, hidden: hidden || !visible, reduced }
}

/** 系统开关；没有 matchMedia 的环境按「不减少」处理。 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches))
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])
  return reduced
}
