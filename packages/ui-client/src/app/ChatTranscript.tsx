/**
 * [INPUT]: ChatItem 用户面;useAgent 思考/重试态;AgentClient.repairMermaid;工作区资产
 * [OUTPUT]: ChatTranscript —— 对话列(空态/Thought/过程/气泡/思考指示)
 * [POS]: App 对话舞台的消息相;终稿 Sources 原样;SourceList 仅漏写兜底
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useMemo, useState } from 'react'
import type { AgentClient, Asset } from '../agent-client'
import type { ChatItem, ModelRetryState, PendingAsk } from '../useAgent'
import { shouldShowHostSourceList } from '../sourceCite'
import { APP_STATUS_COPY } from '../copy/appCopy'
import { CheckIcon, CopyIcon } from '../components/icons'
import { CollapsibleUserText } from '../components/CollapsibleUserText'
import { MsgFileChips } from '../components/MsgFileChips'
import { SourceList } from '../components/SourceList'
import { ProcessRow } from '../components/ProcessRow'
import { ThoughtRow } from '../components/ThoughtRow'
import { TodoCard } from '../components/TodoCard'
import { ThinkingIndicator } from '../components/ThinkingIndicator'
import { AssistantContent } from '../components/widget/AssistantContent'
import { msgAnchorId } from '../components/turnRail'
import { EmptyState } from './EmptyState'
import { assetKindFromPath } from './assetKind'

export function ChatTranscript({
  items,
  evidenceItems,
  running,
  pendingAsk,
  modelRetry,
  thinkStartedAt,
  isEmpty,
  taskId,
  projectId,
  client,
  onSend,
  assets,
  onOpenAsset,
  onToggleRail,
}: {
  items: ChatItem[]
  evidenceItems: ChatItem[]
  running: boolean
  pendingAsk: PendingAsk | null
  modelRetry: ModelRetryState | null
  thinkStartedAt: string | null
  isEmpty: boolean
  taskId: string | null
  projectId: string
  client: AgentClient
  onSend: (text: string) => void
  assets: Asset[]
  onOpenAsset: (a: Asset) => void
  onToggleRail: (open: boolean) => void
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function copyMsg(id: string, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopiedId(id)
    window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1400)
  }

  const copyBtn = (id: string, text: string, label: string) => (
    <button type="button" className={`msg-copy${copiedId === id ? ' is-copied' : ''}`} aria-label={label} title="复制" onClick={() => void copyMsg(id, text)}>
      {copiedId === id ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
    </button>
  )

  // 每轮只给"最终输出"配复制:该 assistant 消息之后、到下一条 user 之前再无 assistant;
  // 正在流式的一轮先不配(收尾后才出现)
  const finalAssistantIds = useMemo(() => {
    const ids = new Set<string>()
    let candidate: string | null = null
    for (const it of items) {
      if (it.kind !== 'msg') continue
      if (it.role === 'assistant') candidate = it.id
      else if (it.role === 'user') { if (candidate) ids.add(candidate); candidate = null }
    }
    if (candidate && !running) ids.add(candidate)
    return ids
  }, [items, running])

  const lastItem = items[items.length - 1]
  const toolsBusy =
    items.some((it) => it.kind === 'process' && it.running)
    || evidenceItems.some((it) => it.kind === 'process' && it.running)
  const lastStreamingAssistant =
    lastItem?.kind === 'msg'
    && lastItem.role === 'assistant'
    && Boolean(lastItem.streaming)
  const hasOpenThought = items.some((it) => it.kind === 'thought' && !it.done)
  const showThinking =
    running
    && !pendingAsk
    && !lastStreamingAssistant
    && !hasOpenThought
    && (!toolsBusy || Boolean(modelRetry))

  return (
    <>
      {isEmpty && <EmptyState />}
      {items.map((it) => {
        if (it.kind === 'compaction') {
          return <div key={it.id} className="ctx-divider"><span>已整理更早的上下文 · 细节在工作区与历史记录</span></div>
        }
        if (it.kind === 'todo') return <TodoCard key={it.id} todo={it} />
        if (it.kind === 'thought') {
          return (
            <ThoughtRow
              key={it.id}
              thought={it}
              clockStart={it.done ? undefined : (thinkStartedAt ?? it.startedAt)}
            />
          )
        }
        if (it.kind === 'process') return <ProcessRow key={it.id} block={it} />
        if (it.role === 'assistant') {
          const isProvisional = Boolean(it.provisional)
          const streamingWidget =
            Boolean(it.streaming)
            || (running && isProvisional)
            || (running && !finalAssistantIds.has(it.id) && !isProvisional)
          if (isProvisional || !finalAssistantIds.has(it.id)) {
            return (
              <div
                key={it.id}
                id={msgAnchorId(it.id)}
                className={`bubble bubble-assistant${isProvisional ? ' is-provisional' : ''}${streamingWidget ? ' is-streaming' : ''}`}
              >
                <AssistantContent content={it.content} isStreaming={streamingWidget} onSendMessage={(t) => { onSend(t) }} />
              </div>
            )
          }
          const showHostList = shouldShowHostSourceList(it.content, it.sources ?? [])
          return (
            <div key={it.id} id={msgAnchorId(it.id)} className="msg-group msg-group-assistant">
              <div className="bubble bubble-assistant">
                <AssistantContent
                  content={it.content}
                  onSendMessage={(t) => { onSend(t) }}
                  onRepairMermaid={taskId
                    ? (source, error) => client.repairMermaid(taskId, source, error, projectId)
                    : undefined}
                />
                {showHostList ? <SourceList sources={it.sources ?? []} /> : null}
              </div>
              <div className="msg-actions">{copyBtn(it.id, it.content, '复制这条回答')}</div>
            </div>
          )
        }
        if (it.role === 'user') {
          return (
            <div key={it.id} id={msgAnchorId(it.id)} className="msg-group msg-group-user">
              <div className="bubble bubble-user">
                <CollapsibleUserText
                  text={it.content}
                  leading={(it.uploads?.length || it.images?.length) ? (
                    <>
                      {it.uploads?.length ? (
                        <MsgFileChips
                          uploads={it.uploads}
                          onOpen={(ref) => {
                            const asset = assets.find((a) => a.path === ref.path)
                              ?? {
                                path: ref.path,
                                name: ref.name,
                                kind: assetKindFromPath(ref.path),
                                scope: 'session' as const,
                              }
                            onOpenAsset(asset)
                            onToggleRail(true)
                          }}
                        />
                      ) : null}
                      {it.images?.length ? (
                        <div className="msg-images">
                          {it.images.map((im, i) => (
                            <img key={i} className="msg-image" src={`data:${im.mediaType};base64,${im.base64}`} alt="粘贴的图片" />
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : undefined}
                />
              </div>
              <div className="msg-actions">{copyBtn(it.id, it.content, '复制这条输入')}</div>
            </div>
          )
        }
        return <div key={it.id} id={msgAnchorId(it.id)} className={`bubble bubble-${it.role}`}>{it.content}</div>
      })}
      {showThinking && (
        <ThinkingIndicator
          label={
            modelRetry
              ? APP_STATUS_COPY.retry(modelRetry.attempt, modelRetry.maxAttempts)
              : APP_STATUS_COPY.thinking
          }
          retrying={Boolean(modelRetry)}
          detail={modelRetry?.reason}
          startedAt={thinkStartedAt}
        />
      )}
    </>
  )
}
