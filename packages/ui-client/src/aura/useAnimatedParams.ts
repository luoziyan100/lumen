import { useEffect, useRef, useState } from 'react'
import { lerp, lerpHex } from './color'
import type { AuraParams } from './states'

const EPS = 1e-4

/** 当前值以指数方式逼近目标：每帧走掉剩余距离的固定比例，天然平滑、无需时长管理 */
function approach(c: AuraParams, t: AuraParams, k: number): AuraParams {
  const num = (a: number, b: number) => (Math.abs(b - a) < EPS ? b : lerp(a, b, k))
  const col = (a: string, b: string) => {
    if (a === b) return b
    const n = lerpHex(a, b, k)
    return n === a ? b : n // 8bit 量化导致停滞时，直接吸附到目标
  }
  return {
    colors: [
      col(c.colors[0], t.colors[0]),
      col(c.colors[1], t.colors[1]),
      col(c.colors[2], t.colors[2]),
      col(c.colors[3], t.colors[3]),
    ],
    speed: num(c.speed, t.speed),
    distortion: num(c.distortion, t.distortion),
    swirl: num(c.swirl, t.swirl),
    neuroOpacity: num(c.neuroOpacity, t.neuroOpacity),
    neuroSpeed: num(c.neuroSpeed, t.neuroSpeed),
    neuroColor: col(c.neuroColor, t.neuroColor),
    neuroBlend: t.neuroBlend, // 离散值不插值，直接取目标

    borderOpacity: num(c.borderOpacity, t.borderOpacity),
    borderColors: [col(c.borderColors[0], t.borderColors[0]), col(c.borderColors[1], t.borderColors[1])],
    borderSpeed: num(c.borderSpeed, t.borderSpeed),
    borderIntensity: num(c.borderIntensity, t.borderIntensity),
    borderPulse: num(c.borderPulse, t.borderPulse),
    ease: t.ease,
  }
}

/** 把目标参数变成每帧平滑逼近的动画参数。状态切换、调参拖动都会被平滑掉。 */
export function useAnimatedParams(target: AuraParams): AuraParams {
  const [params, setParams] = useState(target)
  const currentRef = useRef(target)
  const targetRef = useRef(target)
  targetRef.current = target

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const t = targetRef.current
      if (JSON.stringify(currentRef.current) !== JSON.stringify(t)) {
        const k = 1 - Math.exp(-t.ease * dt)
        currentRef.current = approach(currentRef.current, t, k)
        setParams(currentRef.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return params
}
