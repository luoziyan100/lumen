/**
 * [INPUT]: parseShowWidget / WidgetFrame / Markdown
 * [OUTPUT]: AssistantContent —— 文本段(Markdown/mermaid) + show-widget 段交错渲染
 * [POS]: widget/ 与对话气泡的接合点;mermaid 走 Markdown,不经沙箱;
 *        终稿把失败图的修正请求经 onSendMessage 发回当前会话(与 widget 回发同一出口)，按 fixScope × 图原文只发一次;
 *        流式时 Markdown deferMath,避免半截公式高度抖动牵动贴底
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { memo, useMemo } from 'react'
import { MODEL_TEXT } from '../../i18n/locales/model.ts'
import { markMermaidFixAsked, mermaidFixAsked, subscribeMermaidFix, type MermaidFix } from '../../mermaid/mermaidFixLedger'
import { Markdown } from '../Markdown'
import { WidgetFrame } from './WidgetFrame'
import { parseShowWidgets } from './parseShowWidget'
import { truncateOpenScript } from './sanitize'

export const AssistantContent = memo(function AssistantContent({
  content,
  isStreaming,
  onSendMessage,
  fixScope,
}: {
  content: string
  /** 修正请求去重的会话作用域(topicId:taskId)；缺省时不提供修正 */
  fixScope?: string
  /** 整条 assistant 消息仍在流式(围栏可能未闭合) */
  isStreaming?: boolean
  onSendMessage?: (text: string) => void
}) {
  const mermaidFix = useMemo<MermaidFix | undefined>(
    () => (onSendMessage && fixScope && !isStreaming
      ? {
          asked: (source) => mermaidFixAsked(fixScope, source),
          ask: (source, error) => { if (markMermaidFixAsked(fixScope, source)) onSendMessage(MODEL_TEXT.mermaidFix(source, error)) },
          subscribe: subscribeMermaidFix,
        }
      : undefined),
    [onSendMessage, fixScope, isStreaming],
  )
  const segments = parseShowWidgets(content)
  if (!segments.length) return null
  const deferMath = Boolean(isStreaming)

  // 无 widget:走纯 Markdown(保持原路径)
  if (segments.length === 1 && segments[0]!.kind === 'text') {
    return <Markdown deferMath={deferMath} mermaidFix={mermaidFix}>{segments[0]!.text}</Markdown>
  }

  return (
    <div className="assistant-content">
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          const t = seg.text.trim()
          if (!t) return null
          return (
            <Markdown key={`t-${i}`} deferMath={deferMath} mermaidFix={mermaidFix}>
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
