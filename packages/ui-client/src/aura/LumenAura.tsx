import { MeshGradient, NeuroNoise, PulsingBorder } from '@paper-design/shaders-react'
import type { CSSProperties } from 'react'
import { lerpHex } from './color'
import type { AuraMap, AuraState } from './states'
import { DEFAULT_AURA_MAP } from './states'
import { useAnimatedParams } from './useAnimatedParams'

const layer: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
}

/**
 * Lumen 的气场：三层 shader 叠加，由 state 驱动。
 * - 基底层 MeshGradient：情绪底色，始终存在
 * - 认知层 NeuroNoise：思考/检索时浮现的神经纹理（screen 混合）
 * - 警觉层 PulsingBorder：聆听时的边缘微光 / 受阻时的红色脉冲
 */
export function LumenAura({
  state,
  map = DEFAULT_AURA_MAP,
}: {
  state: AuraState
  map?: AuraMap
}) {
  const p = useAnimatedParams(map[state])

  // screen（暗底发光）：白色主脉络、neuroColor 过渡、黑=中性不遮底
  // multiply（浅底渗墨）：neuroColor 做墨色主脉络、白=中性不遮纸
  const ink = p.neuroBlend === 'multiply'

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: ink ? '#f8f7f1' : '#06050f' }}>
      <MeshGradient
        style={layer}
        fit="cover"
        colors={p.colors}
        distortion={p.distortion}
        swirl={p.swirl}
        speed={p.speed}
      />
      <NeuroNoise
        style={{ ...layer, mixBlendMode: ink ? 'multiply' : 'screen', opacity: p.neuroOpacity }}
        colorFront={ink ? p.neuroColor : '#ffffff'}
        colorMid={ink ? lerpHex(p.neuroColor, '#ffffff', 0.55) : p.neuroColor}
        colorBack={ink ? '#ffffff' : '#000000'}
        brightness={0.08}
        contrast={0.35}
        scale={0.9}
        speed={p.neuroSpeed}
      />
      <PulsingBorder
        style={{ ...layer, opacity: p.borderOpacity }}
        fit="cover"
        colorBack="#00000000"
        colors={p.borderColors}
        roundness={0.08}
        thickness={0.08}
        softness={0.85}
        intensity={p.borderIntensity}
        bloom={0.4}
        spots={4}
        spotSize={0.55}
        pulse={p.borderPulse}
        smoke={0.3}
        smokeSize={0.5}
        scale={1}
        speed={p.borderSpeed}
      />
    </div>
  )
}
