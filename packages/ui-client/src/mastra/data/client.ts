/**
 * [INPUT]: 官方MastraClient、原生注入的本机服务发现与所选技能文件清单
 * [OUTPUT]: LumenApi、Connection、目录/资料/完整技能包/诊断与问题评估入口、附专家用量的快照和带 ETag 的文件版本读取，范围和身份显式传递；同会话阅读写入串行，手动未读不被先发自动确认覆盖
 * [POS]: 新客户端唯一网络边界；附件先有界完整读取，再用内存 Blob 上传，文件读取失败不产生残缺请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { MastraClient, type KnownAgentControllerEvent } from '@mastra/client-js'
import type { SkillFile } from '../../shell/pickSkill.ts'

export interface Connection { baseUrl: string; token: string; error?: string }
export interface Identity { projectId: string; taskId: string }
export type { Project, ProjectSource, SessionSummary as SessionInfo, Page } from '../../../../mastra-service/src/catalog/types.ts'
import type { Project, ProjectSource, SessionSummary as SessionInfo, Page } from '../../../../mastra-service/src/catalog/types.ts'
import type { PublicSettings, SettingsPatch } from '../../../../mastra-service/src/settings/types.ts'
import type { SkillMeta, SkillLayer } from '../../../../mastra-service/src/skills/types.ts'
import type { AgentCatalog } from '../../../../mastra-service/src/agents/catalog/types.ts'
import type { BadCase, MarkCaseInput, UpdateCaseInput, DiagnosticTrace, TraceSummary, DiagnosticExport, RecordedInspection, EvaluationResult } from '../../../../mastra-service/src/diagnostics/types.ts'
export type { BadCase, MarkCaseInput, UpdateCaseInput, DiagnosticTrace, DiagnosticSpan, TraceSummary, DiagnosticExport, RecordedInspection, EvaluationResult, Coverage } from '../../../../mastra-service/src/diagnostics/types.ts'
import type { LegacyRecordPage, LegacyRecordDetail } from '../../../../mastra-service/src/migration/legacy-diagnostics/types.ts'
export type { LegacyRecord, LegacyRecordPage, LegacyRecordDetail } from '../../../../mastra-service/src/migration/legacy-diagnostics/types.ts'
export type { PublicSettings, SettingsPatch, PublicModelProfile } from '../../../../mastra-service/src/settings/types.ts'
export type SkillInfo = SkillMeta & { layer: SkillLayer }
export interface Asset { name: string; type: 'file' | 'directory'; size?: number }
export type FileScope = 'task' | 'shared' | 'source' | 'memory'
export interface Upload { path: string; name: string; size: number; mediaType: string }
export interface FileVersion { blob: Blob | null; etag: string | null }
export interface ChildTask { id: string; status: string; toolName: string; result?: unknown; error?: { message: string } }
type NativeDisplayState = Extract<KnownAgentControllerEvent, { type: 'display_state_changed' }>['displayState']
export type ChildTokenUsage = NativeDisplayState['tokenUsage'] | null
export type DisplayState = NativeDisplayState & { childTokenUsage?: ChildTokenUsage }
export interface TracePage { items: TraceSummary[]; page: number; perPage: number; total: number; hasMore: boolean; collectionEnabled: boolean }

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
      throw new Error(typeof detail?.error === 'string' ? detail.error : `请求失败 (${response.status})`)
    }
    return response.json()
  }
  query(identity: Identity, extra: Record<string, string> = {}) { return new URLSearchParams({ ...identity, ...extra }).toString() }
  session(identity: Identity) { return this.sdk.getAgentController('lumen').session(`${identity.projectId}:${identity.taskId}`) }
  open(identity: Identity) { return this.request<{ resourceId: string; threadId: string }>('/lumen/sessions', 'POST', identity) }
  projects(archived = false) { return this.request<Page<Project>>(`/lumen/projects?archived=${archived}&perPage=100`) }
  createProject(name: string) { return this.request<Project>('/lumen/projects', 'POST', { name }) }
  updateProject(projectId: string, updates: { name?: string; archived?: boolean }) { return this.request<Project>(`/lumen/projects/${encodeURIComponent(projectId)}`, 'PATCH', updates) }
  projectSource(projectId: string) { return this.request<ProjectSource>(`/lumen/projects/${encodeURIComponent(projectId)}/source`) }
  updateProjectSource(projectId: string, path: string | null) { return this.request<ProjectSource>(`/lumen/projects/${encodeURIComponent(projectId)}/source`, 'PATCH', { path }) }
  sessions(projectId: string, page = 0, archived = false, search = '') { return this.request<Page<SessionInfo>>(`/lumen/projects/${encodeURIComponent(projectId)}/sessions?${new URLSearchParams({ page: String(page), archived: String(archived), search })}`) }
  createSession(projectId: string) { return this.request<SessionInfo>(`/lumen/projects/${encodeURIComponent(projectId)}/sessions`, 'POST', {}) }
  updateSession(identity: Identity, updates: Partial<Pick<SessionInfo, 'title' | 'pinned' | 'archived'>>) { return this.request<SessionInfo>(`/lumen/projects/${encodeURIComponent(identity.projectId)}/sessions/${encodeURIComponent(identity.taskId)}`, 'PATCH', updates) }
  private changeReadState(identity: Identity, action: string, body: unknown) {
    const key = `${identity.projectId}:${identity.taskId}`
    const result = (this.readChanges.get(key) ?? Promise.resolve()).catch(() => {}).then(() => this.request<{ changed: boolean }>(`/lumen/projects/${encodeURIComponent(identity.projectId)}/sessions/${encodeURIComponent(identity.taskId)}/${action}`, 'POST', body))
    this.readChanges.set(key, result)
    void result.finally(() => { if (this.readChanges.get(key) === result) this.readChanges.delete(key) }).catch(() => {})
    return result
  }
  markSessionRead(identity: Identity, messageId: string) { return this.changeReadState(identity, 'read', { messageId }) }
  setSessionUnread(identity: Identity, unread: boolean) { return this.changeReadState(identity, 'unread', { unread }) }
  snapshot(identity: Identity) { return this.request<{ displayState: DisplayState }>(`/lumen/snapshot?${this.query(identity)}`) }
  stop(identity: Identity) { return this.request('/lumen/stop', 'POST', identity) }
  assets(identity: Identity, path = '.', scope: FileScope = 'task') { return this.request<{ entries: Asset[] }>(`/lumen/assets?${this.query(identity, { path, scope })}`) }
  children(identity: Identity) { return this.request<{ tasks: ChildTask[]; childTokenUsage?: ChildTokenUsage }>(`/lumen/children?${this.query(identity)}`) }
  cancelChild(identity: Identity, id: string) { return this.request(`/lumen/children/${encodeURIComponent(id)}/cancel`, 'POST', identity) }
  settings() { return this.request<PublicSettings>('/lumen/settings') }
  agents(projectId: string) { return this.request<AgentCatalog>(`/lumen/projects/${encodeURIComponent(projectId)}/agents`) }
  reloadAgents(projectId: string) { return this.request<AgentCatalog>(`/lumen/projects/${encodeURIComponent(projectId)}/agents/reload`, 'POST', {}) }
  setAgentDisabled(projectId: string, name: string, disabled: boolean) { return this.request<AgentCatalog>(`/lumen/projects/${encodeURIComponent(projectId)}/agents/${encodeURIComponent(name)}`, 'PATCH', { disabled }) }
  updateSettings(patch: SettingsPatch) { return this.request<PublicSettings>('/lumen/settings', 'PATCH', patch) }
  skills(identity: Identity) { return this.request<{ skills: SkillInfo[] }>(`/lumen/skills?${this.query(identity)}`) }
  activateSkill(identity: Identity, name: string, args?: string) { return this.request<{ content: string }>('/lumen/skills/activate', 'POST', { ...identity, name, args }) }
  installSkill(identity: Identity, path: string, scope: 'user' | 'project') { return this.request<SkillInfo>('/lumen/skills/install', 'POST', { ...identity, path, scope }) }
  async installSkillPackage(identity: Identity, files: SkillFile[], scope: 'user' | 'project'): Promise<SkillInfo> {
    const body = new FormData()
    body.set('manifest', JSON.stringify(files.map(({ path, executable, directory }) => ({ path, ...(executable ? { executable } : {}), ...(directory ? { directory } : {}) }))))
    files.forEach(({ file }, index) => { if (file) body.append(`file-${index}`, file) })
    const response = await fetch(`${this.connection.baseUrl}/lumen/skills/package?${this.query(identity, { scope })}`, { method: 'POST', headers: this.headers(), body })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? `技能安装失败 (${response.status})`)
    return result
  }
  removeSkill(identity: Identity, name: string, scope: 'user' | 'project') { return this.request('/lumen/skills', 'DELETE', { ...identity, name, scope }) }
  traces(identity: Identity, page = 0) { return this.request<TracePage>(`/lumen/diagnostics/traces?${this.query(identity, { page: String(page), perPage: '20' })}`) }
  trace(identity: Identity, traceId: string) { return this.request<DiagnosticTrace>(`/lumen/diagnostics/traces/${encodeURIComponent(traceId)}?${this.query(identity)}`) }
  badCases(identity: Identity, page = 0) { return this.request<Page<BadCase>>(`/lumen/diagnostics/cases?${this.query(identity, { page: String(page), perPage: '20' })}`) }
  markBadCase(identity: Identity, input: MarkCaseInput) { return this.request<BadCase>(`/lumen/diagnostics/cases?${this.query(identity)}`, 'POST', input) }
  updateBadCase(identity: Identity, id: string, input: UpdateCaseInput) { return this.request<BadCase>(`/lumen/diagnostics/cases/${encodeURIComponent(id)}?${this.query(identity)}`, 'PATCH', input) }
  evaluateBadCase(identity: Identity, id: string, mode: EvaluationResult['mode']) { return this.request<EvaluationResult>(`/lumen/diagnostics/cases/${encodeURIComponent(id)}/evaluate?${this.query(identity)}`, 'POST', { mode }) }
  exportDiagnostics(identity: Identity, traceId?: string) { return this.request<DiagnosticExport>(`/lumen/diagnostics/export?${this.query(identity, traceId ? { traceId } : {})}`) }
  readRecorded(content: string) { return this.request<RecordedInspection>('/lumen/diagnostics/recorded', 'POST', { content }) }
  legacyRecords(identity: Identity, page = 0) { return this.request<LegacyRecordPage>(`/lumen/diagnostics/legacy?${this.query(identity, { page: String(page), perPage: '30' })}`) }
  legacyRecord(identity: Identity, id: string) { return this.request<LegacyRecordDetail>(`/lumen/diagnostics/legacy/${encodeURIComponent(id)}?${this.query(identity)}`) }
  async upload(identity: Identity, file: File, scope: FileScope = 'task'): Promise<Upload> {
    if (file.size >= 25 * 1024 * 1024) throw new Error(`附件「${file.name}」过大，请使用小于 25 MiB 的文件`)
    let bytes: ArrayBuffer
    try {
      bytes = await file.arrayBuffer()
      if (bytes.byteLength !== file.size) throw new Error('Incomplete file')
    } catch {
      throw new Error(`无法完整读取附件「${file.name}」，请通过“添加文件”重新选择；若仍失败，请先将文件复制到下载目录`)
    }
    const body = new FormData()
    body.set('file', new Blob([bytes], { type: file.type }), file.name)
    const response = await fetch(`${this.connection.baseUrl}/lumen/uploads?${this.query(identity, { scope })}`, { method: 'POST', headers: this.headers(), body })
    if (!response.ok) {
      const detail = await response.json().catch(() => null)
      throw new Error(`附件「${file.name}」上传失败：${typeof detail?.error === 'string' ? detail.error : `请求失败 (${response.status})`}`)
    }
    return response.json()
  }
  async fileVersion(identity: Identity, path: string, scope: FileScope = 'task', etag?: string): Promise<FileVersion> {
    const response = await fetch(`${this.connection.baseUrl}/lumen/files?${this.query(identity, { path, binary: '1', scope })}`, {
      headers: { ...this.headers(), ...(etag ? { 'If-None-Match': etag } : {}) },
    })
    if (response.status === 304) return { blob: null, etag: response.headers.get('ETag') ?? etag ?? null }
    if (!response.ok) throw new Error(`读取失败 (${response.status})`)
    return { blob: await response.blob(), etag: response.headers.get('ETag') }
  }
  async file(identity: Identity, path: string, scope: FileScope = 'task'): Promise<Blob> {
    const result = await this.fileVersion(identity, path, scope)
    if (!result.blob) throw new Error('文件内容未变化')
    return result.blob
  }
}
