/**
 * [INPUT]: 单节循环宽度 cyclePx(一段文案+间隔)
 * [OUTPUT]: marqueeDurationSec —— 双份无缝走马灯整圈时长(秒)
 * [POS]: MarqueeTitle 与单测共用;位移 -50% 时视觉接缝消失,无需瞬切
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 体感滚动速度(px/s) */
export const MARQUEE_PX_PER_SEC = 42

/** 两段文案之间的间隔(px);须与 .sb-marquee-seg padding-right 同步 */
export const MARQUEE_GAP_PX = 32

/** cyclePx≤0 不动画 */
export function marqueeDurationSec(cyclePx: number, pxPerSec = MARQUEE_PX_PER_SEC): number {
  if (cyclePx <= 0) return 0
  return cyclePx / pxPerSec
}
