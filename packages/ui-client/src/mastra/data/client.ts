/**
 * [INPUT]: 官方MastraClient、原生注入的本机服务发现与所选技能文件清单
 * [OUTPUT]: LumenApi、Connection、主题/会话目录、资料库与主题引用、白板只读视图与用户选中的白板（R16；旧服务缺路由时静默，其它失败抛出）、用户删除白板与区块所在白板（R17；旧服务缺路由如实返回 unsupported/unknown）、带状态码与 JSON 正文的 RequestError（消息按 code 译成界面语言，i18n I6）、完整技能包/诊断与问题评估入口、附专家用量的快照和带 ETag 的文件版本读取；身份是 {topicId, taskId}，同会话阅读写入串行，手动未读不被先发自动确认覆盖
 * [POS]: 新客户端唯一网络边界；不暴露提前创建空会话的目录写入，提交准备沿 open 绑定；附件先完整读取再进资料库并引用到当前主题，失败不发残缺请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { MastraClient, type KnownAgentControllerEvent } from '@mastra/client-js'
import type { SkillFile } from '../../shell/pickSkill.ts'
import { serviceErrorText, t } from '../../i18n/index.ts'

export interface Connection { baseUrl: string; token: string; error?: string }
export interface Identity { topicId: string; taskId: string }
export type { SessionSummary as SessionInfo, Page } from '../../../../mastra-service/src/catalog/types.ts'
import type { SessionSummary as SessionInfo, Page } from '../../../../mastra-service/src/catalog/types.ts'
export type { Topic, LibraryItem, TopicMaterial, Sheet, SheetView } from '../../../../mastra-service/src/studio/types.ts'
import type { Topic, LibraryItem, TopicMaterial, Sheet, SheetView } from '../../../../mastra-service/src/studio/types.ts'
/** writable: newest live sheet (old field). selected/target come from R16 services; optional so an older service still parses. */
export interface SheetList { items: Sheet[]; writable: string | null; selected?: string | null; target?: string | null }
import type { PublicSettings, SettingsPatch } from '../../../../mastra-service/src/settings/types.ts'
import type { SkillMeta, SkillLayer } from '../../../../mastra-service/src/skills/types.ts'
import type { AgentCatalog } from '../../../../mastra-service/src/agents/catalog/types.ts'
import type { BadCase, MarkCaseInput, UpdateCaseInput, DiagnosticTrace, TraceSummary, DiagnosticExport, RecordedInspection, EvaluationResult } from '../../../../mastra-service/src/diagnostics/types.ts'
export type { BadCase, MarkCaseInput, UpdateCaseInput, DiagnosticTrace, DiagnosticSpan, TraceSummary, DiagnosticExport, RecordedInspection, EvaluationResult, Coverage } from '../../../../mastra-service/src/diagnostics/types.ts'
export type { PublicSettings, SettingsPatch, PublicModelProfile } from '../../../../mastra-service/src/settings/types.ts'
export type SkillInfo = SkillMeta & { layer: SkillLayer }
export interface Asset { name: string; type: 'file' | 'directory'; size?: number }
/** work：主题工作区（各段对话共用）；memory：这个主题的记忆；you：关于用户的记忆。 */
export type FileScope = 'work' | 'memory' | 'you'
/** 读取范围：工作区三处之外，library 表示资料库原件（path 即条目 id，只读）。 */
export type ReadScope = FileScope | 'library'
export interface Upload { itemId: string; name: string; size: number; mediaType: string }
export interface FileVersion { blob: Blob | null; etag: string | null }
export interface ChildTask { id: string; status: string; toolName: string; result?: unknown; error?: { message: string } }
type NativeDisplayState = Extract<KnownAgentControllerEvent, { type: 'display_state_changed' }>['displayState']
export type ChildTokenUsage = NativeDisplayState['tokenUsage'] | null
export type DisplayState = NativeDisplayState & { childTokenUsage?: ChildTokenUsage }
export interface TracePage { items: TraceSummary[]; page: number; perPage: number; total: number; hasMore: boolean; collectionEnabled: boolean }

/** A non-2xx answer from the service; network failures stay as the fetch error. */
export class RequestError extends Error {
  status: number
  /** The JSON body of the answer, when it had one (Lumen's own errors always do; a route the service does not have answers plain text). */
  detail: Record<string, unknown> | null
  constructor(message: string, status: number, detail: Record<string, unknown> | null = null) { super(message); this.status = status; this.detail = detail }
  /** The service has no such route (an older build): 405, or a 404 that is not one of Lumen's own JSON errors. */
  get routeMissing() { return this.status === 405 || (this.status === 404 && typeof this.detail?.error !== 'string') }
}

/** What deleting a sheet came to (R17). confirm: it has blocks and the user must agree first; unsupported: the service predates the route. */
export type SheetDeletion = { kind: 'deleted'; selected: string | null } | { kind: 'confirm'; blocks: number } | { kind: 'unsupported' }

export class LumenApi {
  private readonly readChanges = new Map<string, Promise<{ changed: boolean }>>()
  readonly sdk: MastraClient
  readonly connection: Connection
  constructor(connection: Connection) {
    const url = new URL(connection.baseUrl)
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password) throw new Error('Invalid local service address')
    this.connection = { baseUrl: url.origin, token: connection.token }
    this.sdk = new MastraClient({ baseUrl: url.origin, headers: this.headers() })
  }
  headers() { return { Authorization: `Bearer ${this.connection.token}` } }
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`${this.connection.baseUrl}${path}`, { method, headers: { ...this.headers(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    if (!response.ok) {
      const detail = await response.json().catch(() => null)
      throw new RequestError(serviceErrorText(detail, t().data.requestFailed(response.status)), response.status, detail && typeof detail === 'object' ? detail : null)
    }
    return response.json()
  }
  query(identity: Identity, extra: Record<string, string> = {}) { return new URLSearchParams({ topicId: identity.topicId, taskId: identity.taskId, ...extra }).toString() }
  private sessionPath(identity: Identity) { return `/lumen/topics/${encodeURIComponent(identity.topicId)}/sessions/${encodeURIComponent(identity.taskId)}` }
  session(identity: Identity) { return this.sdk.getAgentController('lumen').session(`${identity.topicId}:${identity.taskId}`) }
  /** 建好（或确认）主题下的这段对话；同一身份重复调用不新建。 */
  open(identity: Identity) { return this.request<SessionInfo>(`/lumen/topics/${encodeURIComponent(identity.topicId)}/sessions`, 'POST', { taskId: identity.taskId }) }
  topics(archived = false) { return this.request<{ items: Topic[] }>(`/lumen/topics?archived=${archived}`) }
  createTopic(title: string) { return this.request<Topic>('/lumen/topics', 'POST', { title }) }
  updateTopic(topicId: string, updates: { title?: string; archived?: boolean }) { return this.request<Topic>(`/lumen/topics/${encodeURIComponent(topicId)}`, 'PATCH', updates) }
  /** selected: where the next message writes; target: where the run in progress writes. Both absent on services older than R16. */
  sheets(topicId: string) { return this.request<SheetList>(`/lumen/topics/${encodeURIComponent(topicId)}/sheets`) }
  /** Record the user's tab choice so the next run writes there (R16). */
  /** Records the user's tab on the service (R16). null: an older service without the route (404/405); any other failure throws. */
  async selectSheet(topicId: string, sheetId: string): Promise<{ selected: string | null } | null> {
    try { return await this.request<{ selected: string | null }>(`/lumen/topics/${encodeURIComponent(topicId)}/selection`, 'PUT', { sheetId }) }
    catch (error) { if (error instanceof RequestError && (error.status === 404 || error.status === 405)) return null; throw error }
  }
  sheet(sheetId: string) { return this.request<SheetView>(`/lumen/sheets/${encodeURIComponent(sheetId)}`) }
  /** 你点 ＋ 新开一张白板（服务把它记为选中）；AI 不会自己开。 */
  /** Only the user deletes a sheet (R17). Without `confirmed`, a sheet with blocks comes back as `confirm` with the count; other refusals throw. */
  async deleteSheet(topicId: string, sheetId: string, confirmed = false): Promise<SheetDeletion> {
    try {
      const result = await this.request<{ selected: string | null }>(`/lumen/topics/${encodeURIComponent(topicId)}/sheets/${encodeURIComponent(sheetId)}${confirmed ? '?confirm=true' : ''}`, 'DELETE')
      return { kind: 'deleted', selected: result.selected }
    } catch (error) {
      if (!(error instanceof RequestError)) throw error
      if (error.routeMissing) return { kind: 'unsupported' }
      if (error.status === 409 && error.detail?.reason === 'confirm' && typeof error.detail.blocks === 'number') return { kind: 'confirm', blocks: error.detail.blocks }
      throw error
    }
  }
  /** Which sheet a block is on. deleted: its sheet is gone (R17); unknown: the service predates the route. */
  async blockSheet(blockId: string): Promise<{ kind: 'found'; sheetId: string } | { kind: 'deleted' } | { kind: 'unknown' }> {
    try { return { kind: 'found', sheetId: (await this.request<{ sheetId: string }>(`/lumen/blocks/${encodeURIComponent(blockId)}`)).sheetId } }
    catch (error) {
      if (error instanceof RequestError && error.routeMissing) return { kind: 'unknown' }
      if (error instanceof RequestError && error.status === 404) return { kind: 'deleted' }
      throw error
    }
  }
  createSheet(topicId: string, title?: string) { return this.request<Sheet>(`/lumen/topics/${encodeURIComponent(topicId)}/sheets`, 'POST', title ? { title } : {}) }
  /** 带 ETag 读白板：没变时返回 view=null，不重新解析。 */
  async sheetVersion(sheetId: string, etag?: string | null): Promise<{ view: SheetView | null; etag: string | null }> {
    const response = await fetch(`${this.connection.baseUrl}/lumen/sheets/${encodeURIComponent(sheetId)}`, { headers: { ...this.headers(), ...(etag ? { 'If-None-Match': etag } : {}) } })
    if (response.status === 304) return { view: null, etag: etag ?? null }
    if (!response.ok) {
      const detail = await response.json().catch(() => null)
      throw new Error(serviceErrorText(detail, t().data.requestFailed(response.status)))
    }
    return { view: await response.json() as SheetView, etag: response.headers.get('ETag') }
  }
  library() { return this.request<{ items: LibraryItem[] }>('/lumen/library') }
  materials(topicId: string) { return this.request<{ items: TopicMaterial[] }>(`/lumen/topics/${encodeURIComponent(topicId)}/materials`) }
  reference(topicId: string, itemId: string) { return this.request<{ referenced: boolean }>(`/lumen/topics/${encodeURIComponent(topicId)}/materials`, 'POST', { itemId }) }
  async unreference(topicId: string, itemId: string) {
    const response = await fetch(`${this.connection.baseUrl}/lumen/topics/${encodeURIComponent(topicId)}/materials/${encodeURIComponent(itemId)}`, { method: 'DELETE', headers: this.headers() })
    if (!response.ok && response.status !== 404) throw new Error(t().data.unreferenceFailed(response.status))
  }
  libraryContentUrl(itemId: string) { return `${this.connection.baseUrl}/lumen/library/${encodeURIComponent(itemId)}/content` }
  sessions(topicId: string, page = 0, archived = false, search = '') { return this.request<Page<SessionInfo>>(`/lumen/topics/${encodeURIComponent(topicId)}/sessions?${new URLSearchParams({ page: String(page), archived: String(archived), search })}`) }
  updateSession(identity: Identity, updates: Partial<Pick<SessionInfo, 'title' | 'pinned' | 'archived'>>) { return this.request<SessionInfo>(this.sessionPath(identity), 'PATCH', updates) }
  private changeReadState(identity: Identity, action: string, body: unknown) {
    const key = `${identity.topicId}:${identity.taskId}`
    const result = (this.readChanges.get(key) ?? Promise.resolve()).catch(() => {}).then(() => this.request<{ changed: boolean }>(`${this.sessionPath(identity)}/${action}`, 'POST', body))
    this.readChanges.set(key, result)
    void result.finally(() => { if (this.readChanges.get(key) === result) this.readChanges.delete(key) }).catch(() => {})
    return result
  }
  markSessionRead(identity: Identity, messageId: string) { return this.changeReadState(identity, 'read', { messageId }) }
  setSessionUnread(identity: Identity, unread: boolean) { return this.changeReadState(identity, 'unread', { unread }) }
  snapshot(identity: Identity) { return this.request<{ displayState: DisplayState }>(`/lumen/snapshot?${this.query(identity)}`) }
  stop(identity: Identity) { return this.request('/lumen/stop', 'POST', { topicId: identity.topicId, taskId: identity.taskId }) }
  assets(identity: Identity, path = '.', scope: FileScope = 'work') { return this.request<{ entries: Asset[] }>(`/lumen/assets?${this.query(identity, { path, scope })}`) }
  children(identity: Identity) { return this.request<{ tasks: ChildTask[]; childTokenUsage?: ChildTokenUsage }>(`/lumen/children?${this.query(identity)}`) }
  cancelChild(identity: Identity, id: string) { return this.request(`/lumen/children/${encodeURIComponent(id)}/cancel`, 'POST', { topicId: identity.topicId, taskId: identity.taskId }) }
  settings() { return this.request<PublicSettings>('/lumen/settings') }
  agents() { return this.request<AgentCatalog>('/lumen/agents') }
  reloadAgents() { return this.request<AgentCatalog>('/lumen/agents/reload', 'POST', {}) }
  setAgentDisabled(name: string, disabled: boolean) { return this.request<AgentCatalog>(`/lumen/agents/${encodeURIComponent(name)}`, 'PATCH', { disabled }) }
  updateSettings(patch: SettingsPatch) { return this.request<PublicSettings>('/lumen/settings', 'PATCH', patch) }
  skills(identity: Identity) { return this.request<{ skills: SkillInfo[] }>(`/lumen/skills?${this.query(identity)}`) }
  activateSkill(identity: Identity, name: string, args?: string) { return this.request<{ content: string }>('/lumen/skills/activate', 'POST', { topicId: identity.topicId, taskId: identity.taskId, name, args }) }
  installSkill(identity: Identity, path: string) { return this.request<SkillInfo>('/lumen/skills/install', 'POST', { topicId: identity.topicId, taskId: identity.taskId, path }) }
  async installSkillPackage(identity: Identity, files: SkillFile[]): Promise<SkillInfo> {
    const body = new FormData()
    body.set('manifest', JSON.stringify(files.map(({ path, executable, directory }) => ({ path, ...(executable ? { executable } : {}), ...(directory ? { directory } : {}) }))))
    files.forEach(({ file }, index) => { if (file) body.append(`file-${index}`, file) })
    const response = await fetch(`${this.connection.baseUrl}/lumen/skills/package?${this.query(identity)}`, { method: 'POST', headers: this.headers(), body })
    const result = await response.json()
    if (!response.ok) throw new Error(serviceErrorText(result, t().data.skillInstallFailed(response.status)))
    return result
  }
  removeSkill(identity: Identity, name: string) { return this.request('/lumen/skills', 'DELETE', { topicId: identity.topicId, taskId: identity.taskId, name }) }
  traces(identity: Identity, page = 0) { return this.request<TracePage>(`/lumen/diagnostics/traces?${this.query(identity, { page: String(page), perPage: '20' })}`) }
  trace(identity: Identity, traceId: string) { return this.request<DiagnosticTrace>(`/lumen/diagnostics/traces/${encodeURIComponent(traceId)}?${this.query(identity)}`) }
  badCases(identity: Identity, page = 0) { return this.request<Page<BadCase>>(`/lumen/diagnostics/cases?${this.query(identity, { page: String(page), perPage: '20' })}`) }
  markBadCase(identity: Identity, input: MarkCaseInput) { return this.request<BadCase>(`/lumen/diagnostics/cases?${this.query(identity)}`, 'POST', input) }
  updateBadCase(identity: Identity, id: string, input: UpdateCaseInput) { return this.request<BadCase>(`/lumen/diagnostics/cases/${encodeURIComponent(id)}?${this.query(identity)}`, 'PATCH', input) }
  evaluateBadCase(identity: Identity, id: string, mode: EvaluationResult['mode']) { return this.request<EvaluationResult>(`/lumen/diagnostics/cases/${encodeURIComponent(id)}/evaluate?${this.query(identity)}`, 'POST', { mode }) }
  exportDiagnostics(identity: Identity, traceId?: string) { return this.request<DiagnosticExport>(`/lumen/diagnostics/export?${this.query(identity, traceId ? { traceId } : {})}`) }
  readRecorded(content: string) { return this.request<RecordedInspection>('/lumen/diagnostics/recorded', 'POST', { content }) }
  /** 附件进资料库并引用到当前主题；返回资料库条目 id，消息里按 id 提及，模型用 read_material 读。 */
  async upload(identity: Pick<Identity, 'topicId'>, file: File): Promise<Upload> {
    if (file.size >= 25 * 1024 * 1024) throw new Error(t().data.uploadTooLarge(file.name))
    let bytes: ArrayBuffer
    try {
      bytes = await file.arrayBuffer()
      if (bytes.byteLength !== file.size) throw new Error('Incomplete file')
    } catch {
      throw new Error(t().data.uploadUnreadable(file.name))
    }
    const body = new FormData()
    body.set('file', new Blob([bytes], { type: file.type }), file.name)
    body.set('topicId', identity.topicId)
    const response = await fetch(`${this.connection.baseUrl}/lumen/library`, { method: 'POST', headers: this.headers(), body })
    if (!response.ok) {
      const detail = await response.json().catch(() => null)
      throw new Error(t().data.uploadFailed(file.name, serviceErrorText(detail, t().data.requestFailed(response.status))))
    }
    const { item } = await response.json() as { item: LibraryItem }
    return { itemId: item.id, name: file.name, size: item.size, mediaType: item.mediaType }
  }
  async fileVersion(identity: Identity, path: string, scope: ReadScope = 'work', etag?: string): Promise<FileVersion> {
    const url = scope === 'library' ? this.libraryContentUrl(path) : `${this.connection.baseUrl}/lumen/files?${this.query(identity, { path, binary: '1', scope })}`
    const response = await fetch(url, {
      headers: { ...this.headers(), ...(etag ? { 'If-None-Match': etag } : {}) },
    })
    if (response.status === 304) return { blob: null, etag: response.headers.get('ETag') ?? etag ?? null }
    if (!response.ok) throw new Error(t().data.readFailed(response.status))
    return { blob: await response.blob(), etag: response.headers.get('ETag') }
  }
  async file(identity: Identity, path: string, scope: ReadScope = 'work'): Promise<Blob> {
    const result = await this.fileVersion(identity, path, scope)
    if (!result.blob) throw new Error(t().data.unchanged)
    return result.blob
  }
}
