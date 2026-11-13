/**
 * [INPUT]: SpriteState、compact/desktop 尺寸档、可选的 reduced-motion 开关与 assets/sprite/runtime 的两张派生 WebP
 * [OUTPUT]: SpriteFigure：应用内缩小版与桌面版共用的全身显示层，只表达状态动效，不处理位置、拖动或窗口生命周期
 * [POS]: 精灵形象的可替换边界；以后换 VRM 只替换此组件，Sprite/useSpriteMove/Tauri 不感知内部绘制
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useReducedMotion, type SpriteState } from '../sprite-face'
import compact from '../../../assets/sprite/runtime/body-compact@2x.webp'
import desktop from '../../../assets/sprite/runtime/body-desktop@2x.webp'

const SOURCES = { compact, desktop } as const

export function SpriteFigure({ state, size, reducedMotion }: { state: SpriteState; size: 'compact' | 'desktop'; reducedMotion?: boolean }) {
  const systemReduced = useReducedMotion()
  const reduced = reducedMotion ?? systemReduced
  return <span className={`sprite-visual sprite-visual-${size}`} data-state={state} data-reduced={reduced ? 'true' : 'false'} aria-hidden="true">
    <img src={SOURCES[size]} alt="" draggable={false} />
    <span className="sprite-visual-glow" />
  </span>
}
