/**
 * [INPUT]: widget/WidgetFrame(共享网页沙箱栈)、widget/generation 的 widgetGeneration
 * [OUTPUT]: HtmlViewer —— 工作区 HTML artifact 预览(可执行脚本)
 * [POS]: components/ 阅读器侧 HTML 入口;与对话内 WidgetFrame 同安全合同。文件内容原地变化时按内容摘要换新 iframe(换代规则见 widget/CLAUDE.md),同一 receiver 不执行两次脚本
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * v2:sandbox="allow-scripts" 无 allow-same-origin;
 * receiver 为同源 /widget-receiver.html(非 srcdoc),自带 meta CSP——父页 script-src 'self' 不继承。
 */
import { WidgetFrame } from './widget/WidgetFrame'
import { widgetGeneration } from './widget/generation'

export function HtmlViewer({ html }: { html: string }) {
  return (
    <WidgetFrame
      key={widgetGeneration(html)}
      widgetCode={html}
      isStreaming={false}
      fillHeight
      title={undefined}
    />
  )
}
