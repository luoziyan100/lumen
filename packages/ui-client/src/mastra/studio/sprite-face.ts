/**
 * [INPUT]: React 的系统减少动态订阅；浏览器计时器由调用方注入，FaceDriver 可用假时钟脱离 DOM 验证
 * [OUTPUT]: SpriteState（空闲/运行/等你/说话）→ 表情的映射、眨眼与说话交替的计时规则（4–7s/120ms/180–260ms）、FaceDriver（状态机 + 计时器所有权）与 useReducedMotion
 * [POS]: 精灵表情的唯一真相：组件只画，节奏在这里；纯逻辑可脱开 React 用假时钟验证
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react'

export type SpriteState = 'idle' | 'running' | 'waiting' | 'speaking'
export type SpriteFaceName = 'neutral' | 'blink' | 'thinking' | 'warm' | 'speaking'

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

/**
 * 表情节奏的所有者：同一时刻只有一个计时器。
 * 状态一变就整体重启——运行/等你/说话都不该留着上一态的眨眼。
 * reduced 为真时不排任何计时器，只按状态给一张静态表情（契约 S6）。
 */
export class FaceDriver {
  private state: SpriteState
  private face: SpriteFaceName
  private handle: number | null = null
  private disposed = false

  private readonly emit: (face: SpriteFaceName) => void
  private readonly clock: FaceClock
  private readonly random: () => number
  private readonly reduced: boolean

  constructor(emit: (face: SpriteFaceName) => void, state: SpriteState, clock: FaceClock = browserClock, random: () => number = Math.random, reduced = false) {
    this.emit = emit
    this.clock = clock
    this.random = random
    this.reduced = reduced
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
    if (this.reduced) { this.show(faceFor(this.state)); return }
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
