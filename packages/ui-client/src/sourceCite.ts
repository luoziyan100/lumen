/**
 * [INPUT]: 外链对话框提交的 URL
 * [OUTPUT]: hostOf：供确认文案与受信站点规则共用的规范主机名
 * [POS]: 外链门禁的纯解析边界；不收集工具来源或改写模型正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
