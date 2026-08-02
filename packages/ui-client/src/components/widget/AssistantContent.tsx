/**
 * [INPUT]: parseShowWidget / WidgetFrame / Markdown
 * [OUTPUT]: AssistantContent —— 把 reply 拆成文本段 + show-widget 段交错渲染
 * [POS]: widget/ 与对话气泡的接合点;替代气泡内直接 <Markdown>
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { Markdown } from '../Markdown'
import { WidgetFrame } from './WidgetFrame'
import { parseShowWidgets } from './parseShowWidget'
import { truncateOpenScript } from './sanitize'

export function AssistantContent({
  content,
  isStreaming,
  onSendMessage,
}: {
  content: string
  /** 整条 assistant 消息仍在流式(围栏可能未闭合) */
  isStreaming?: boolean
  onSendMessage?: (text: string) => void
}) {
  const segments = parseShowWidgets(content)
  if (!segments.length) return null

  // 无 widget:走纯 Markdown(保持原路径)
  if (segments.length === 1 && segments[0]!.kind === 'text') {
    return <Markdown>{segments[0]!.text}</Markdown>
  }

  return (
    <div className="assistant-content">
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          const t = seg.text.trim()
          if (!t) return null
          return <Markdown key={`t-${i}`}>{seg.text}</Markdown>
        }
        const streaming = Boolean(isStreaming) || !seg.closed
        const { truncated } = truncateOpenScript(seg.widgetCode)
        return (
          <WidgetFrame
            key={`w-${i}`}
            title={seg.title}
            widgetCode={seg.widgetCode}
            isStreaming={streaming}
            showOverlay={streaming && truncated}
            onSendMessage={onSendMessage}
          />
        )
      })}
    </div>
  )
}
