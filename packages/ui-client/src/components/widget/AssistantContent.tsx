/**
 * [INPUT]: parseShowWidget / WidgetFrame / Markdown
 * [OUTPUT]: AssistantContent —— 文本段(Markdown/mermaid) + show-widget 段交错渲染
 * [POS]: widget/ 与对话气泡的接合点;mermaid 走 Markdown,不经沙箱;
 *        终稿把失败图的修正请求经 onSendMessage 发回当前会话(与 widget 回发同一出口);
 *        流式时 Markdown deferMath,避免半截公式高度抖动牵动贴底
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { memo, useMemo } from 'react'
import { mermaidFixPrompt } from '../../copy/appCopy'
import { Markdown } from '../Markdown'
import { WidgetFrame } from './WidgetFrame'
import { parseShowWidgets } from './parseShowWidget'
import { truncateOpenScript } from './sanitize'

export const AssistantContent = memo(function AssistantContent({
  content,
  isStreaming,
  onSendMessage,
}: {
  content: string
  /** 整条 assistant 消息仍在流式(围栏可能未闭合) */
  isStreaming?: boolean
  onSendMessage?: (text: string) => void
}) {
  const onMermaidFix = useMemo(
    () => (onSendMessage && !isStreaming ? (source: string, error: string) => onSendMessage(mermaidFixPrompt(source, error)) : undefined),
    [onSendMessage, isStreaming],
  )
  const segments = parseShowWidgets(content)
  if (!segments.length) return null
  const deferMath = Boolean(isStreaming)

  // 无 widget:走纯 Markdown(保持原路径)
  if (segments.length === 1 && segments[0]!.kind === 'text') {
    return <Markdown deferMath={deferMath} onMermaidFix={onMermaidFix}>{segments[0]!.text}</Markdown>
  }

  return (
    <div className="assistant-content">
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          const t = seg.text.trim()
          if (!t) return null
          return (
            <Markdown key={`t-${i}`} deferMath={deferMath} onMermaidFix={onMermaidFix}>
              {seg.text}
            </Markdown>
          )
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
})
