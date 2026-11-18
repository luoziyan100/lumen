/**
 * [INPUT]: the four view objects from src/mastra/studio/objects/ (press, cork board, lamp, type case)
 * [OUTPUT]: VIEW_OBJECTS: per object its id, name, markup, CSS, the hover values to pin, and the mid-states the checkpoint captures
 * [POS]: the one list views-page.mts and views-shots.mts share, so the page and the screenshots never disagree about states
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { pressSvg, PRESS_CSS } from '../../src/mastra/studio/objects/press.ts'
import { corkSvg, CORK_CSS } from '../../src/mastra/studio/objects/corkboard.ts'
import { lampSvg, LAMP_CSS } from '../../src/mastra/studio/objects/lamp.ts'
import { typecaseSvg, TYPECASE_CSS } from '../../src/mastra/studio/objects/typecase.ts'

export interface ViewObject { id: string; name: string; markup: string; css: string; hover: string; mid: string }

export const VIEW_OBJECTS: ViewObject[] = [
  { id: 'press', name: '压花板', markup: pressSvg(), css: PRESS_CSS, hover: '--iso-spin:1', mid: '--iso-spin:1,--iso-lift:.5' },
  { id: 'cork', name: '软木板', markup: corkSvg(), css: CORK_CSS, hover: '--iso-tilt:1', mid: '--iso-tilt:1,--iso-taut:.5' },
  { id: 'lamp', name: '台灯', markup: lampSvg(), css: LAMP_CSS, hover: '--iso-dip:1', mid: '--iso-dip:.5,--iso-light:.5' },
  { id: 'case', name: '字盘', markup: typecaseSvg(), css: TYPECASE_CSS, hover: '--iso-tilt:1', mid: '--iso-tilt:1,--iso-sorts:.5' },
]
