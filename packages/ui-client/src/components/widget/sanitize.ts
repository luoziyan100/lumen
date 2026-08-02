/**
 * [INPUT]: 无外部依赖;处理模型生成的 widget HTML 字符串
 * [OUTPUT]: sanitizeForStreaming / sanitizeForIframe / CDN_WHITELIST
 * [POS]: widget/ 安全层 —— 流式预览剥脚本;终态仅剥嵌套逃逸标签
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** Chart.js 等允许的脚本 CDN(与 receiver CSP 同步) */
export const CDN_WHITELIST = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'esm.sh',
] as const

const DANGEROUS_TAGS = /<(iframe|object|embed|meta|link|base|form)[\s>][\s\S]*?<\/\1>/gi
const DANGEROUS_VOID = /<(iframe|object|embed|meta|link|base)\b[^>]*\/?>/gi

/** 流式预览:无交互,剥 script / on* / 危险标签 / javascript: data: URL */
export function sanitizeForStreaming(html: string): string {
  return html
    .replace(DANGEROUS_TAGS, '')
    .replace(DANGEROUS_VOID, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']*)/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(
      /\s+(href|src|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']*))/gi,
      (match, _attr: string, dq?: string, sq?: string, uq?: string) => {
        const url = (dq ?? sq ?? uq ?? '').trim()
        if (/^\s*(javascript|data)\s*:/i.test(url)) return ''
        return match
      },
    )
}

/** 终态:仅剥可嵌套/逃逸的标签;script 与 handler 在 sandbox iframe 内执行 */
export function sanitizeForIframe(html: string): string {
  return html.replace(DANGEROUS_TAGS, '').replace(DANGEROUS_VOID, '')
}

/** 未闭合 <script 时截断,避免 JS 源码在预览里变成可见文本 */
export function truncateOpenScript(html: string): { html: string; truncated: boolean } {
  const open = html.lastIndexOf('<script')
  if (open < 0) return { html, truncated: false }
  const after = html.slice(open)
  if (/<\/script>/i.test(after)) return { html, truncated: false }
  return { html: html.slice(0, open), truncated: true }
}
