/**
 * [INPUT]: Mastra 持久消息、展示正文与受控工作区路径解析
 * [OUTPUT]: userContent、turnItems、messageAnchor；附件与轮次的纯展示投影
 * [POS]: 保留原生消息不变；仅接受当前任务/项目范围附件，不加载远程附件 URL
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { MastraDBMessage } from '@mastra/client-js'
import { messageRole, messageText } from '../../../data/feed.ts'
import { workspaceLink, type FileTarget } from '../../../data/file-links.ts'
import { MASTRA_COPY as C } from '../../../../copy/mastraCopy.ts'

export interface MessageFile { name: string; target: FileTarget }
export interface TurnItem { id: string; label: string; description: string }
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}

function attachmentTarget(path: unknown): FileTarget | null {
  if (typeof path !== 'string') return null
  let decoded: string
  try { decoded = decodeURIComponent(path) } catch { return null }
  if (decoded.split('/').some(segment => segment === '..') || /^(?:workspaces|projects)\//.test(decoded)) return null
  if (decoded.startsWith('shared/')) {
    const target = workspaceLink(decoded.slice(7))
    return target ? { ...target, scope: 'shared' } : null
  }
  return workspaceLink(path)
}

export function userContent(message: MastraDBMessage) {
  let text = messageText(message)
  const files: MessageFile[] = []
  const add = (name: unknown, path: unknown) => {
    const target = attachmentTarget(path)
    if (typeof name !== 'string' || !target || files.some(file => file.target.path === target.path && file.target.scope === target.scope)) return
    files.push({ name, target })
  }
  const uploads = message.content.metadata?.legacyUploads
  if (Array.isArray(uploads)) for (const value of uploads) { const upload = record(value); add(upload.name, upload.path) }
  const marker = `\n\n${C.uploadedMaterials}\n`, index = text.lastIndexOf(marker)
  if (index >= 0) {
    const lines = text.slice(index + marker.length).split('\n'), parsed = lines.map(line => /^- (.+): (library\/[^\n]+)$/.exec(line))
    if (parsed.length && parsed.every(match => match && attachmentTarget(match[2]))) {
      for (const match of parsed) add(match![1], match![2])
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
