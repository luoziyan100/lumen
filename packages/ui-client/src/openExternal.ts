/**
 * [INPUT]: http(s) URL;或工作区相对路径(阅读器「系统打开」)
 * [OUTPUT]: 系统默认浏览器/应用打开;桌面壳走 Tauri invoke,网页退回 window.open / blob
 * [POS]: ExternalLinkGate / widget 外链 / ReaderPane 打开本地产物;WKWebView 不能靠 window.open
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

/** 打开工作区磁盘文件;HTML 不在盘上时落临时预览。 */
export async function openWorkspaceFile(opts: {
  projectId: string
  path: string
  taskId?: string | null
  fallbackHtml?: string
  fallbackName?: string
}): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  try {
    await invoke('open_workspace_file', {
      projectId: opts.projectId,
      path: opts.path,
      taskId: opts.taskId ?? null,
    })
    return
  } catch (err) {
    if (opts.fallbackHtml) {
      try {
        await invoke('open_temp_html', { html: opts.fallbackHtml, name: opts.fallbackName ?? 'preview.html' })
        return
      } catch {
        const blob = new Blob([opts.fallbackHtml], { type: 'text/html;charset=utf-8' })
        const href = URL.createObjectURL(blob)
        const w = window.open(href, '_blank', 'noopener,noreferrer')
        window.setTimeout(() => URL.revokeObjectURL(href), 10_000)
        if (!w) throw (err instanceof Error ? err : new Error('open failed'))
        return
      }
    }
    throw (err instanceof Error ? err : new Error('open failed'))
  }
}
