/**
 * [INPUT]: sanitize 后的 widget HTML;Tauri invoke widget_put_script
 * [OUTPUT]: hoistInlineScripts —— 内联 script 改 lumenwidget:// src
 * [POS]: widget/ 终态预处理。WK/Tauri 父 CSP(script-src 'self'+hash)拦动态
 *        textContent/blob/eval;外链 src(CDN 已证)能过。宿主把内联登记成
 *        专用 scheme 再以 src 注入,父页不加 unsafe-inline/eval。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export const WIDGET_SCRIPT_SCHEME = 'lumenwidget'

export function widgetScriptUrl(id: string): string {
  return `${WIDGET_SCRIPT_SCHEME}://localhost/${id}.js`
}

/** 把内联 <script> 换成 src=lumenwidget://…;已有 src 的不动 */
export async function hoistInlineScripts(
  html: string,
  put: (code: string) => Promise<string>,
): Promise<string> {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    out += html.slice(last, m.index)
    const attrs = m[1] ?? ''
    const body = m[2] ?? ''
    if (/\bsrc\s*=/i.test(attrs) || !body.trim()) {
      out += m[0]
    } else {
      const id = await put(body)
      out += `<script src="${widgetScriptUrl(id)}"></script>`
    }
    last = m.index + m[0].length
  }
  out += html.slice(last)
  return out
}

export async function putWidgetScript(code: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string>('widget_put_script', { code })
}
