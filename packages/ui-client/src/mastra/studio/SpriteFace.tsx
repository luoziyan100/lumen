/**
 * [INPUT]: 五张 256px 圆形 WebP（assets/sprite/）、sprite-face 的状态映射与计时器、prefers-reduced-motion
 * [OUTPUT]: SpriteFace：叠放五张图做 200ms 交叉淡入，外圈光环跟状态走（运行转、等你呼吸），空闲极轻呼吸；preloadSprite 一次性预加载五张
 * [POS]: 精灵的脸——只管画表情与光环，节奏在 sprite-face.ts，状态由 Sprite 从主题/会话投影
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react'
import neutral from '../../assets/sprite/neutral.webp'
import blink from '../../assets/sprite/blink.webp'
import thinking from '../../assets/sprite/thinking.webp'
import warm from '../../assets/sprite/warm.webp'
import speaking from '../../assets/sprite/speaking.webp'
import { FaceDriver, browserClock, faceFor, useReducedMotion, type SpriteFaceName, type SpriteState } from './sprite-face'

const SOURCES: Record<SpriteFaceName, string> = { neutral, blink, thinking, warm, speaking }
const NAMES = Object.keys(SOURCES) as SpriteFaceName[]

let preloaded = false
/** 五张一次性进缓存：之后切换只改透明度，不重新请求、不闪白（契约 S9）。 */
export function preloadSprite() {
  if (preloaded || typeof Image === 'undefined') return
  preloaded = true
  for (const source of Object.values(SOURCES)) { const image = new Image(); image.src = source }
}

export function SpriteFace({ state, breathe = false, className = '' }: { state: SpriteState; breathe?: boolean; className?: string }) {
  const reduced = useReducedMotion()
  const [face, setFace] = useState<SpriteFaceName>(() => faceFor(state))
  const latest = useRef(state)
  latest.current = state
  const driver = useRef<FaceDriver | null>(null)

  useEffect(() => {
    setFace(faceFor(latest.current))
    const next = new FaceDriver(setFace, latest.current, browserClock, Math.random, reduced)
    driver.current = next
    return () => { next.dispose(); driver.current = null }
  }, [reduced])
  useEffect(() => { driver.current?.setState(state) }, [state])
  useEffect(() => { preloadSprite() }, [])

  return <span className={`sprite-face${breathe && state === 'idle' ? ' sprite-breathe' : ''} ${className}`.trim()} data-state={state} data-face={face} aria-hidden="true">
    {NAMES.map(name => <img key={name} src={SOURCES[name]} alt="" draggable={false} className={name === face ? 'on' : ''} />)}
  </span>
}
