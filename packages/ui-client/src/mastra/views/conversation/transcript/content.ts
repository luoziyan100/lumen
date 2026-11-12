/**
 * [INPUT]: Mastra 持久消息、展示正文与受控工作区路径解析
 * [OUTPUT]: userContent、turnItems、messageAnchor；附件与轮次的纯展示投影
 * [POS]: 保留原生消息不变；附件只认资料库条目 id（经服务按主题引用校验读取），不加载远程附件 URL
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { MastraDBMessage } from '@mastra/client-js'
import { messageRole, messageText } from '../../../data/feed.ts'
import type { FileTarget } from '../../../data/file-links.ts'
import { MASTRA_COPY as C } from '../../../../copy/mastraCopy.ts'

export interface MessageFile { name: string; target: FileTarget }
export interface TurnItem { id: string; label: string; description: string }

/** 附言里的资料库条目 id；格式与服务 safeId 一致，其余一律不当附件。 */
const ITEM = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/

export function userContent(message: MastraDBMessage) {
  let text = messageText(message)
  const files: MessageFile[] = []
  const marker = `\n\n${C.uploadedMaterials}\n`, index = text.lastIndexOf(marker)
  if (index >= 0) {
    const lines = text.slice(index + marker.length).split('\n'), parsed = lines.map(line => /^- (.+): ([^\s:]+)$/.exec(line))
    if (parsed.length && parsed.every(match => match && ITEM.test(match[2]!))) {
      for (const match of parsed) if (!files.some(file => file.target.path === match![2])) files.push({ name: match![1]!, target: { path: match![2]!, scope: 'library' } })
      text = text.slice(0, index)
    }
  }
  const images = (message.content.experimental_attachments ?? []).flatMap((attachment, index) => {
    if (!/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,[a-z0-9+/=\s]+$/i.test(attachment.url)) return []
    return [{ name: attachment.name || `图片 ${index + 1}`, url: attachment.url }]
  })
  return { text, files, images }
}

export const messageAnchor = (id: string) => `mw-msg-${id}`
const clip = (text: string, length: number) => { const line = text.replace(/\s+/g, ' ').trim(); return line.length > length ? `${line.slice(0, length - 1)}…` : line }

export function turnItems(messages: MastraDBMessage[]): TurnItem[] {
  const turns: TurnItem[] = []
  for (const message of messages) {
    if (messageRole(message) === 'user') {
      const content = userContent(message)
      turns.push({ id: message.id, label: clip(content.text || content.files.map(file => file.name).join('、'), 40) || '图片消息', description: '暂无回复' })
    } else if (messageRole(message) === 'assistant' && turns.length && messageText(message).trim()) {
      turns[turns.length - 1]!.description = clip(messageText(message), 80)
    }
  }
  return turns
}
