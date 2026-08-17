/**
 * [INPUT]: 无运行时依赖(不 import storage/runtime 实现)
 * [OUTPUT]: 协议线上的数据形(Task/Project/SkillInfo/…);messages.ts 只从此处取形
 * [POS]: 让 ui-client type-only 直连 messages 时不把 sqlite/fs 拉进 tsc;
 *        与 storage/runtime 的同名接口结构兼容(多字段可赋给少字段)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export interface Task {
  id: string
  project_id: string
  goal: string
  title?: string | null
  status: string
  created_at?: string
  pinned_at?: string | null
}

export interface TaskEvent {
  id: string
  task_id: string
  seq: number
  kind: string
  payload_json: string
  created_at: string
  agent_role?: string | null
}

export interface Project {
  id: string
  name: string
  source_path?: string | null
  created_at: string
  updated_at: string
}

export interface WorkspaceAsset {
  path: string
  kind: 'pdf' | 'doc' | 'html' | 'image' | 'file'
  name: string
  scope?: 'shared' | 'session'
}

export interface SkillInfo {
  name: string
  description: string
  whenToUse?: string
  layer: 'source' | 'workspace' | 'user'
  baseDir: string
  disableModelInvocation: boolean
}

export interface PublicModelProfile {
  id: string
  name: string
  provider: 'anthropic' | 'openai'
  baseUrl: string
  models: string[]
  activeModel: string
  model: string
  hasApiKey: boolean
  apiKeyMasked: string
}

export interface PublicSettings {
  profiles: PublicModelProfile[]
  activeProfileId: string | null
  userInstructions: string
}

export interface SettingsPatch {
  userInstructions?: string
  upsertProfile?: {
    id?: string
    name?: string
    provider?: 'anthropic' | 'openai'
    baseUrl?: string
    apiKey?: string
    models?: string[]
    activeModel?: string
    model?: string
  }
  deleteProfileId?: string
  activeProfileId?: string
}
