/**
 * [INPUT]: the official MastraClient, the native-injected local service discovery and the chosen skill file manifest
 * [OUTPUT]: LumenApi, Connection, the topic/session catalog (rename, archive and delete of topics and conversations, the archived listing — R18–R20), library and topic references, the sheet list and the user's selected sheet (R16; silent on an older service
 *           without the route, other failures throw), the user's sheet delete and which sheet holds an element (R17; an older service answers unsupported/unknown as due), the canvas
 *           (scene by ETag, the user's save of changed elements, the commit of an AI op the app laid out, restore/dismiss of AI erasures, viewport, glance, image files), the sediment endpoints
 *           (entries/offers/invites, R13: user HTTP only) and speech habits, the topic's readings and one reading by ETag (read-only), RequestError carrying status and JSON body (messages map through the code into the UI language, i18n I6),
 *           whole skill packages, diagnostics and issue evaluation, snapshots with specialist usage, and ETag file versions; identities are {topicId, taskId}, reads and writes of one
 *           conversation serialize, and a manual unread is never overwritten by a late automatic ack
 * [POS]: the new client's single network boundary; it exposes no catalog write that would create empty sessions early, submit preparation rides the open binding; an attachment is read fully before entering the library referenced into the current topic, and a failure sends no truncated request
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { MastraClient, type KnownAgentControllerEvent } from '@mastra/client-js'
import type { SkillFile } from '../../shell/pickSkill.ts'
import { serviceErrorText, t } from '../../i18n/index.ts'

export interface Connection { baseUrl: string; token: string; error?: string }
export interface Identity { topicId: string; taskId: string }
export type { SessionSummary as SessionInfo, ArchivedSession, Page } from '../../../../mastra-service/src/catalog/types.ts'
import type { SessionSummary as SessionInfo, ArchivedSession, Page } from '../../../../mastra-service/src/catalog/types.ts'
export type { Topic, LibraryItem, TopicMaterial, Sheet, SedimentEntry, SedimentOffer, SedimentInvite, SpeechHabit, CanvasScene, CanvasElement, CanvasOp, CanvasErasure, Viewport, Reading, ReadingSection, ReadingParagraph, ReadingTextBlock, ReadingTableBlock, ReadingDiagramBlock, ReadingWidgetBlock, ReadingSummary } from '../../../../mastra-service/src/studio/types.ts'
import type { Topic, LibraryItem, TopicMaterial, Sheet, SedimentEntry, SedimentOffer, SedimentInvite, SpeechHabit, CanvasScene, CanvasElement, Viewport, Reading, ReadingSummary } from '../../../../mastra-service/src/studio/types.ts'
/** writable: newest live sheet (old field). selected/target come from R16 services; optional so an older service still parses. */
/** An image of the canvas as Excalidraw keeps it (BinaryFileData's stored fields). */
export interface CanvasFile { id: string; mimeType: string; dataURL: string }
export interface SheetList { items: Sheet[]; writable: string | null; selected?: string | null; target?: string | null }
import type { PublicSettings, SettingsPatch } from '../../../../mastra-service/src/settings/types.ts'
import type { SkillMeta, SkillLayer } from '../../../../mastra-service/src/skills/types.ts'
import type { AgentCatalog } from '../../../../mastra-service/src/agents/catalog/types.ts'
import type { BadCase, MarkCaseInput, UpdateCaseInput, DiagnosticTrace, TraceSummary, DiagnosticExport, RecordedInspection, EvaluationResult } from '../../../../mastra-service/src/diagnostics/types.ts'
export type { BadCase, MarkCaseInput, UpdateCaseInput, DiagnosticTrace, DiagnosticSpan, TraceSummary, DiagnosticExport, RecordedInspection, EvaluationResult, Coverage } from '../../../../mastra-service/src/diagnostics/types.ts'
export type { PublicSettings, SettingsPatch, PublicModelProfile } from '../../../../mastra-service/src/settings/types.ts'
export type SkillInfo = SkillMeta & { layer: SkillLayer }
export interface Asset { name: string; type: 'file' | 'directory'; size?: number }
/** work: the topic workspace (shared by its conversations); memory: this topic's memory; you: memory about the user. */
export type FileScope = 'work' | 'memory' | 'you'
/** Read scopes: beyond the three workspace ones, library means a library original (path is the item id, read-only). */
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

/** What deleting a sheet came to (R17). confirm: it has content (canvas elements, plus old blocks) and the user must agree first; unsupported: the service predates the route. settled: takeaways that lose their evidence link (S3). */
export type SheetDeletion = { kind: 'deleted'; selected: string | null } | { kind: 'confirm'; blocks: number; settled: number } | { kind: 'unsupported' }

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
    return response.status === 204 ? undefined as T : response.json()
  }
  query(identity: Identity, extra: Record<string, string> = {}) { return new URLSearchParams({ topicId: identity.topicId, taskId: identity.taskId, ...extra }).toString() }
  private sessionPath(identity: Identity) { return `/lumen/topics/${encodeURIComponent(identity.topicId)}/sessions/${encodeURIComponent(identity.taskId)}` }
  session(identity: Identity) { return this.sdk.getAgentController('lumen').session(`${identity.topicId}:${identity.taskId}`) }
  /** Create (or confirm) this conversation under the topic; repeat calls with the same identity create nothing. */
  open(identity: Identity) { return this.request<SessionInfo>(`/lumen/topics/${encodeURIComponent(identity.topicId)}/sessions`, 'POST', { taskId: identity.taskId }) }
  topics(archived = false) { return this.request<{ items: Topic[] }>(`/lumen/topics?archived=${archived}`) }
  createTopic(title: string) { return this.request<Topic>('/lumen/topics', 'POST', { title }) }
  updateTopic(topicId: string, updates: { title?: string; archived?: boolean }) { return this.request<Topic>(`/lumen/topics/${encodeURIComponent(topicId)}`, 'PATCH', updates) }
  /** R20: deletes the topic and everything it owns (library originals stay); resolves once the service has removed it all. 409 while a conversation runs or waits. */
  deleteTopic(topicId: string) { return this.request<void>(`/lumen/topics/${encodeURIComponent(topicId)}`, 'DELETE') }
  /** L7: archived topics, and archived conversations of topics still in the list (with that topic's title), newest first. */
  archived() { return this.request<{ topics: Topic[]; sessions: ArchivedSession[] }>('/lumen/archived') }
  /** selected: where the next message writes; target: where the run in progress writes. Both absent on services older than R16. */
  sheets(topicId: string) { return this.request<SheetList>(`/lumen/topics/${encodeURIComponent(topicId)}/sheets`) }
  /** Record the user's tab choice so the next run writes there (R16). */
  /** Records the user's tab on the service (R16). null: an older service without the route (404/405); any other failure throws. */
  async selectSheet(topicId: string, sheetId: string): Promise<{ selected: string | null } | null> {
    try { return await this.request<{ selected: string | null }>(`/lumen/topics/${encodeURIComponent(topicId)}/selection`, 'PUT', { sheetId }) }
    catch (error) { if (error instanceof RequestError && (error.status === 404 || error.status === 405)) return null; throw error }
  }
  /** The user's ＋ opens a new sheet (the service records it as the selection); the AI never opens one itself. */
  /** Only the user deletes a sheet (R17). Without `confirmed`, a sheet with content comes back as `confirm` with the count; other refusals throw. */
  async deleteSheet(topicId: string, sheetId: string, confirmed = false): Promise<SheetDeletion> {
    try {
      const result = await this.request<{ selected: string | null }>(`/lumen/topics/${encodeURIComponent(topicId)}/sheets/${encodeURIComponent(sheetId)}${confirmed ? '?confirm=true' : ''}`, 'DELETE')
      return { kind: 'deleted', selected: result.selected }
    } catch (error) {
      if (!(error instanceof RequestError)) throw error
      if (error.routeMissing) return { kind: 'unsupported' }
      if (error.status === 409 && error.detail?.reason === 'confirm' && typeof error.detail.blocks === 'number')
        return { kind: 'confirm', blocks: error.detail.blocks, settled: typeof error.detail.settled === 'number' ? error.detail.settled : 0 }
      throw error
    }
  }
  /** Which sheet holds a live canvas element (a conversation card's). deleted: erased, its sheet deleted (R17), or a retired block id; unknown: the service predates the route. */
  async elementSheet(topicId: string, elementId: string): Promise<{ kind: 'found'; sheetId: string } | { kind: 'deleted' } | { kind: 'unknown' }> {
    try { return { kind: 'found', sheetId: (await this.request<{ sheetId: string }>(`/lumen/topics/${encodeURIComponent(topicId)}/elements/${encodeURIComponent(elementId)}`)).sheetId } }
    catch (error) {
      if (error instanceof RequestError && error.routeMissing) return { kind: 'unknown' }
      if (error instanceof RequestError && error.status === 404) return { kind: 'deleted' }
      throw error
    }
  }
  createSheet(topicId: string, title?: string) { return this.request<Sheet>(`/lumen/topics/${encodeURIComponent(topicId)}/sheets`, 'POST', title ? { title } : {}) }
  // ---- Sediment (R13): user HTTP only; an older service without the routes answers unsupported and the view shows the clean line ----
  async sediment(topicId: string): Promise<{ items: SedimentEntry[]; offers: SedimentOffer[] } | null> {
    try { return await this.request<{ items: SedimentEntry[]; offers: SedimentOffer[] }>(`/lumen/topics/${encodeURIComponent(topicId)}/sediment`) }
    catch (error) { if (error instanceof RequestError && error.routeMissing) return null; throw error }
  }
  /** blocks carry the rev the UI saw; offerId + text confirms an offer (text is the user's final wording, S9). */
  createSediment(topicId: string, input: { text: string; blocks?: { id: string; rev: number }[] } | { offerId: string; text?: string }) {
    return this.request<SedimentEntry>(`/lumen/topics/${encodeURIComponent(topicId)}/sediment`, 'POST', input)
  }
  editSediment(topicId: string, entryId: string, text: string) {
    return this.request<SedimentEntry>(`/lumen/topics/${encodeURIComponent(topicId)}/sediment/${encodeURIComponent(entryId)}`, 'PATCH', { text })
  }
  async deleteSediment(topicId: string, entryId: string) {
    const response = await fetch(`${this.connection.baseUrl}/lumen/topics/${encodeURIComponent(topicId)}/sediment/${encodeURIComponent(entryId)}`, { method: 'DELETE', headers: this.headers() })
    if (!response.ok && response.status !== 404) throw new Error(serviceErrorText(await response.json().catch(() => null), t().data.requestFailed(response.status)))
  }
  async dismissOffer(topicId: string, offerId: string) {
    const response = await fetch(`${this.connection.baseUrl}/lumen/topics/${encodeURIComponent(topicId)}/sediment/offers/${encodeURIComponent(offerId)}`, { method: 'DELETE', headers: this.headers() })
    if (!response.ok && response.status !== 404) throw new Error(serviceErrorText(await response.json().catch(() => null), t().data.requestFailed(response.status)))
  }
  async sheetInvite(sheetId: string): Promise<SedimentInvite | null> {
    try { return (await this.request<{ invite: SedimentInvite | null }>(`/lumen/sheets/${encodeURIComponent(sheetId)}/invite`)).invite }
    catch (error) { if (error instanceof RequestError && error.routeMissing) return null; throw error }
  }
  /** S14 speech habits: view in settings, delete line by line. */
  speechHabits() { return this.request<{ items: SpeechHabit[] }>('/lumen/speech-habits') }
  async deleteSpeechHabit(fragment: string) {
    const response = await fetch(`${this.connection.baseUrl}/lumen/speech-habits/${encodeURIComponent(fragment)}`, { method: 'DELETE', headers: this.headers() })
    if (!response.ok && response.status !== 404) throw new Error(serviceErrorText(await response.json().catch(() => null), t().data.requestFailed(response.status)))
  }
  // ---- The co-drawn canvas (2026-11-19): the user's strokes go through these routes; the AI's arrive as ops the app lays out and commits ----
  /** ETag canvas read: an unchanged sheet answers scene=null without re-parsing. */
  async canvas(sheetId: string, etag?: string | null): Promise<{ scene: CanvasScene | null; etag: string | null }> {
    const response = await fetch(`${this.connection.baseUrl}${this.sheetPath(sheetId)}/canvas`, { headers: { ...this.headers(), ...(etag ? { 'If-None-Match': etag } : {}) } })
    if (response.status === 304) return { scene: null, etag: etag ?? null }
    if (!response.ok) {
      const detail = await response.json().catch(() => null)
      throw new RequestError(serviceErrorText(detail, t().data.requestFailed(response.status)), response.status, detail && typeof detail === 'object' ? detail : null)
    }
    return { scene: await response.json() as CanvasScene, etag: response.headers.get('ETag') }
  }
  /** The user's changed elements (and images new to the service); kept: stored copies that beat what was sent, to apply as they are. */
  saveCanvas(sheetId: string, elements: unknown[], files: CanvasFile[] = []) {
    return this.request<{ saved: number; kept: CanvasElement[] }>(`${this.sheetPath(sheetId)}/canvas`, 'PUT', files.length ? { elements, files } : { elements })
  }
  /** What the app laid out for one AI op; the first commit consumes it (a second answers board.op_done). */
  commitOp(sheetId: string, opId: string, elements: unknown[], files: CanvasFile[] = []) {
    return this.request<{ committed: number }>(`${this.sheetPath(sheetId)}/ops/${encodeURIComponent(opId)}`, 'POST', files.length ? { elements, files } : { elements })
  }
  /** R5: bring back every stroke the AI erased on this sheet, or keep the erase and drop the notice. */
  restoreErasures(sheetId: string) { return this.request<{ restored: number }>(`${this.sheetPath(sheetId)}/erasures/restore`, 'POST') }
  dismissErasures(sheetId: string) { return this.request<void>(`${this.sheetPath(sheetId)}/erasures/dismiss`, 'POST') }
  /** The scene rectangle the user looks at; one row per sheet, never a version. */
  saveViewport(sheetId: string, viewport: Viewport) { return this.request<void>(`${this.sheetPath(sheetId)}/viewport`, 'PUT', viewport) }
  /** Q6: the latest PNG of the sheet for the model's eyes, overwritten; it never becomes a message or an attachment. */
  saveGlance(sheetId: string, sceneVersion: number, dataURL: string) { return this.request<void>(`${this.sheetPath(sheetId)}/glance`, 'PUT', { sceneVersion, dataURL }) }
  canvasFile(sheetId: string, fileId: string) { return this.request<CanvasFile>(`${this.sheetPath(sheetId)}/files/${encodeURIComponent(fileId)}`) }
  private sheetPath(sheetId: string) { return `/lumen/sheets/${encodeURIComponent(sheetId)}` }
  // ---- Readings (P1-2): read-only for the person; the AI writes them through reading_write. An older service without the routes reads as no readings ----
  async readings(topicId: string): Promise<ReadingSummary[]> {
    try { return (await this.request<{ items: ReadingSummary[] }>(`/lumen/topics/${encodeURIComponent(topicId)}/readings`)).items }
    catch (error) { if (error instanceof RequestError && error.routeMissing) return []; throw error }
  }
  /** ETag read like a sheet: unchanged answers reading=null; no reading yet (or an older service) answers missing. */
  async readingVersion(topicId: string, itemId: string, etag?: string | null): Promise<{ reading: Reading | null; etag: string | null; missing: boolean }> {
    const response = await fetch(`${this.connection.baseUrl}/lumen/topics/${encodeURIComponent(topicId)}/readings/${encodeURIComponent(itemId)}`, { headers: { ...this.headers(), ...(etag ? { 'If-None-Match': etag } : {}) } })
    if (response.status === 304) return { reading: null, etag: etag ?? null, missing: false }
    if (response.status === 404 || response.status === 405) return { reading: null, etag: null, missing: true }
    if (!response.ok) throw new Error(serviceErrorText(await response.json().catch(() => null), t().data.requestFailed(response.status)))
    return { reading: await response.json() as Reading, etag: response.headers.get('ETag'), missing: false }
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
  updateSession(identity: Identity, updates: { title?: string; pinned?: boolean; archived?: boolean }) { return this.request<SessionInfo>(this.sessionPath(identity), 'PATCH', updates) }
  /** R20: deletes the conversation's messages, memory, cursor, traces and diagnostics; what it produced stays with the topic. 409 while it runs or waits. */
  deleteSession(identity: Identity) { return this.request<void>(this.sessionPath(identity), 'DELETE') }
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
  /** An attachment enters the library referenced into the current topic; the item id comes back so the message can mention it and the model reads it with read_material. */
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
