/**
 * [INPUT]: 无
 * [OUTPUT]: nextWidgetHeight —— iframe 高度归约策略
 * [POS]: widget/ 高度策略纯函数;WidgetFrame 消费,测试可直接钉
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 流式只增不减防闪烁;终态必须可收缩——chat↔阅读器变宽后否则底部留白。
 */

export function nextWidgetHeight(
  prev: number | undefined,
  next: number,
  opts: { streaming: boolean; first: boolean },
): number {
  if (opts.first || !opts.streaming) return next
  if (prev != null && next < prev) return prev
  return next
}
