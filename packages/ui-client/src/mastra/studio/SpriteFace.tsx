/**
 * [INPUT]: The owner's shared SpriteExpression and A04 heads from the fixed master crop
 * [OUTPUT]: SpriteFace and HEAD_SOURCES; circular avatar with the existing opacity cross-fade
 * [POS]: Pure header renderer; all expression timing belongs to sprite-face.ts and its owner
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import './SpriteFigure.css'
import { SPRITE_FACES, type SpriteExpression, type SpriteFaceName, type SpriteState } from './sprite-face'
import neutral from '../../assets/sprite/head-neutral.webp'
import blink from '../../assets/sprite/head-blink.webp'
import thinking from '../../assets/sprite/head-thinking.webp'
import warm from '../../assets/sprite/head-warm.webp'
import speaking from '../../assets/sprite/head-speaking.webp'

export const HEAD_SOURCES: Record<SpriteFaceName, string> = { neutral, blink, thinking, warm, speaking }

export function SpriteFace({ state, expression, breathe = false, className = '' }: { state: SpriteState; expression: SpriteExpression; breathe?: boolean; className?: string }) {
  return <span className={`sprite-face${breathe && state === 'idle' ? ' sprite-breathe' : ''} ${className}`.trim()} data-state={state} data-face={expression.face} data-document-hidden={expression.hidden} data-reduced={expression.reduced} aria-hidden="true">
    {SPRITE_FACES.map(name => <img key={name} src={HEAD_SOURCES[name]} alt="" draggable={false} data-layer={name}
      className={`${name === 'neutral' ? 'sprite-base' : 'sprite-expression'}${name === expression.face ? ' on' : ''}`} />)}
  </span>
}
