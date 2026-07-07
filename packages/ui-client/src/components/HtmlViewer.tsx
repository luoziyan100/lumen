/** 工作区 HTML artifact 预览:严格沙箱 iframe(srcdoc + 空 sandbox = 唯一不透明源,无脚本/表单/导航/同源)。
 *  v1 只渲染静态 artifact(内联 CSS / SVG / data: 图片);模型 HTML 里的 <script> 一律不执行——
 *  既因 sandbox 未开 allow-scripts,也因父窗口 CSP `script-src 'self'`。交互型(JS 图表)属 v2:
 *  改由本地 service 以独立宽松 CSP 供源 + 放开一条 frame-src,评审记录在案,勿在此偷偷放开 sandbox。 */
export function HtmlViewer({ html }: { html: string }) {
  return (
    <iframe
      className="html-artifact"
      title="HTML 预览"
      sandbox=""
      srcDoc={html}
      referrerPolicy="no-referrer"
    />
  )
}
