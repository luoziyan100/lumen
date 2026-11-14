/**
 * [INPUT]: A shared SpriteExpression, state, compact density sources and Retina desktop derivatives
 * [OUTPUT]: SpriteFigure and BODY_SOURCES; size-specific sources with invariant neutral and facial overlays
 * [POS]: Pure display boundary shared by the compact and retained desktop forms; no timer or positioning
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import './SpriteFigure.css'
import { SPRITE_FACES, type SpriteExpression, type SpriteFaceName, type SpriteState } from './sprite-face'
import neutral2 from '../../assets/sprite/body-neutral@2x.webp'
import neutral3 from '../../assets/sprite/body-neutral@3x.webp'
import blink2 from '../../assets/sprite/body-blink@2x.webp'
import blink3 from '../../assets/sprite/body-blink@3x.webp'
import thinking2 from '../../assets/sprite/body-thinking@2x.webp'
import thinking3 from '../../assets/sprite/body-thinking@3x.webp'
import warm2 from '../../assets/sprite/body-warm@2x.webp'
import warm3 from '../../assets/sprite/body-warm@3x.webp'
import speaking2 from '../../assets/sprite/body-speaking@2x.webp'
import speaking3 from '../../assets/sprite/body-speaking@3x.webp'
import neutralDesktop from '../../assets/sprite/body-desktop-neutral@2x.webp?no-inline'
import blinkDesktop from '../../assets/sprite/body-desktop-blink@2x.webp?no-inline'
import thinkingDesktop from '../../assets/sprite/body-desktop-thinking@2x.webp?no-inline'
import warmDesktop from '../../assets/sprite/body-desktop-warm@2x.webp?no-inline'
import speakingDesktop from '../../assets/sprite/body-desktop-speaking@2x.webp?no-inline'

export const BODY_SOURCES: Record<SpriteFaceName, { two: string; three: string; desktop: string }> = {
  neutral: { two: neutral2, three: neutral3, desktop: neutralDesktop },
  blink: { two: blink2, three: blink3, desktop: blinkDesktop },
  thinking: { two: thinking2, three: thinking3, desktop: thinkingDesktop },
  warm: { two: warm2, three: warm3, desktop: warmDesktop },
  speaking: { two: speaking2, three: speaking3, desktop: speakingDesktop },
}

export function SpriteFigure({ state, size, expression }: { state: SpriteState; size: 'compact' | 'desktop'; expression: SpriteExpression }) {
  const desktop = size === 'desktop'
  return <span className={`sprite-visual sprite-visual-${size}`} data-state={state} data-face={expression.face} data-document-hidden={expression.hidden} data-reduced={expression.reduced} aria-hidden="true">
    <span className="sprite-visual-body">
      {SPRITE_FACES.map(name => <img key={name} src={desktop ? BODY_SOURCES[name].desktop : BODY_SOURCES[name].two}
        srcSet={desktop ? `${BODY_SOURCES[name].desktop} 2x` : `${BODY_SOURCES[name].two} 2x, ${BODY_SOURCES[name].three} 3x`} alt="" draggable={false}
        data-layer={name} className={`${name === 'neutral' ? 'sprite-base' : 'sprite-expression'}${name === expression.face ? ' on' : ''}`} />)}
    </span>
    <span className="sprite-visual-glow" />
  </span>
}
