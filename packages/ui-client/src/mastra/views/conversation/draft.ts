/**
 * [INPUT]: 固定项目/会话身份、受控当前稿路径、文件上传API、延迟会话准备与原生SessionFeed.send
 * [OUTPUT]: conversationDraft；可外部订阅的草稿、提交进度与失败材料；点击发送即冻结材料与当前稿附言，准备会话期间新增输入不进入已确认快照
 * [POS]: 输入内容独立于组件挂载；提交快照送往原会话，运行生命周期仍由 Mastra 拥有
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { MASTRA_COPY as C } from '../../../copy/mastraCopy.ts'
import type { Identity, LumenApi, Upload } from '../../data/client.ts'
import type { SessionFeed } from '../../data/feed.ts'
import { writableDocument } from '../../data/file-links.ts'

type SendTarget = Pick<SessionFeed, 'send' | 'identity'>

interface FailedSubmission { id: number; content: string; files: File[]; error: string }
interface DraftState { draft: string; files: File[]; uploading: boolean; pending: number; failed: FailedSubmission[] }

function storedText(key: string): string {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}

function materials(content: string, uploaded: Upload[]): string {
  return `${content}${uploaded.length ? `\n\n${C.uploadedMaterials}\n${uploaded.map(file => `- ${file.name}: ${file.path}`).join('\n')}` : ''}`
}

class ConversationDraft {
  readonly identity: Identity
  private readonly key: string
  private state: DraftState
  private listeners = new Set<() => void>()
  private staging = false
  private nextId = 0

  constructor(identity: Identity, key: string) {
    this.identity = Object.freeze({ ...identity }); this.key = key
    this.state = { draft: storedText(key), files: [], uploading: false, pending: 0, failed: [] }
  }

  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<DraftState>) {
    this.state = { ...this.state, ...patch }
    if (patch.draft !== undefined) {
      try { if (patch.draft) localStorage.setItem(this.key, patch.draft); else localStorage.removeItem(this.key) }
      catch { /* 无本地存储权限时，草稿仍在当前进程保留。 */ }
    }
    for (const listener of this.listeners) listener()
  }

  setText(draft: string) { this.publish({ draft }) }
  appendText(content: string) { this.setText(`${this.state.draft}${this.state.draft ? '\n\n' : ''}${content}`) }
  addFiles(files: File[]) { if (files.length) this.publish({ files: [...this.state.files, ...files] }) }
  removeFile(index: number) { this.publish({ files: this.state.files.filter((_, at) => at !== index) }) }

  restore(id: number) {
    const item = this.state.failed.find(item => item.id === id)
    if (!item) return
    this.publish({ draft: `${item.content}${this.state.draft ? `\n\n${this.state.draft}` : ''}`,
      files: [...item.files, ...this.state.files], failed: this.state.failed.filter(item => item.id !== id) })
  }

  private fail(id: number, content: string, files: File[], error: unknown) {
    this.publish({ failed: [...this.state.failed, { id, content, files, error: error instanceof Error ? error.message : String(error) }] })
  }

  private matches(feed: SendTarget) {
    return feed.identity.projectId === this.identity.projectId && feed.identity.taskId === this.identity.taskId
  }

  async send(api: Pick<LumenApi, 'upload'>, target: SendTarget | (() => Promise<SendTarget>), activePath?: string | null): Promise<boolean> {
    if (typeof target !== 'function' && !this.matches(target)) return false
    const { draft, files } = this.state
    if (this.staging || (!draft.trim() && !files.length)) return false
    const id = ++this.nextId, uploaded: Upload[] = []
    const path = writableDocument(activePath ? { path: activePath, scope: 'task' } : null)
    const prompt = path ? `${draft}\n\n当前稿（本会话工作区路径）：${path}\n用户正在查看这份稿件；若要求修改它，请先读取现有内容。` : draft
    this.staging = true
    this.publish({ draft: '', files: [], uploading: files.length > 0 })
    let feed: SendTarget
    try {
      feed = typeof target === 'function' ? await target() : target
      if (!this.matches(feed)) throw new Error('会话身份不匹配，未发送研究')
      for (const file of files) uploaded.push(await api.upload(this.identity, file))
    }
    catch (error) { this.fail(id, materials(prompt, uploaded), files.slice(uploaded.length), error); return false }
    finally { this.staging = false; this.publish({ uploading: false }) }
    const content = materials(prompt, uploaded)
    this.publish({ pending: this.state.pending + 1 })
    try { await feed.send(content); return true }
    catch (error) { this.fail(id, content, [], error); return false }
    finally { this.publish({ pending: this.state.pending - 1 }) }
  }
}

const drafts = new Map<string, ConversationDraft>()

export function conversationDraft(identity: Identity): ConversationDraft {
  const key = `lumen:mastra:draft:v1:${JSON.stringify([identity.projectId, identity.taskId])}`
  let draft = drafts.get(key)
  if (!draft) { draft = new ConversationDraft(identity, key); drafts.set(key, draft) }
  return draft
}
