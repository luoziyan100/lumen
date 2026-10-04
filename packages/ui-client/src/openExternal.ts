/**
 * [INPUT]: 已通过界面确认的 http(s) URL 与 Tauri 外链命令
 * [OUTPUT]: openExternalUrl，桌面打开系统浏览器，网页使用隔离的窗口
 * [POS]: Markdown 与 widget 共享的外链出口；工作区文件由 Mastra 文件接口读取
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
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
