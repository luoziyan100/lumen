/**
 * [INPUT]: http(s) URL
 * [OUTPUT]: 系统默认浏览器打开;桌面壳走 open_external_url,网页退回 window.open
 * [POS]: ExternalLinkGate / widget 外链;WKWebView 不能靠 window.open
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export async function openExternalUrl(url: string): Promise<void> {
  const href = url.trim()
  if (!/^https?:\/\//i.test(href)) throw new Error('only http(s)')
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_external_url', { url: href })
  } catch (err) {
    const w = window.open(href, '_blank', 'noopener,noreferrer')
    if (!w) throw (err instanceof Error ? err : new Error('popup blocked'))
  }
}
