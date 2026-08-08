/**
 * [INPUT]: storage 的 Task / TaskEvent / Project
 * [OUTPUT]: WS 协议消息类型（client→server / server→client;含 rename_task/pin_task/unpin_task / Skills;
 *           submit/continue 可带 uploads[] — 上传知情,见 doc/upload-awareness.md）
 * [POS]: §4 agent↔UI 协议。UI 发命令，service 推事件流；shared 包将复用这些类型。
 *        事件 kind 含 ephemeral text_delta / tool_call_start(仅 notify,不入库,见 runtime makeEmit);
 *        answer_user 解开 ask_user 挂起(见 doc/ask-user.md);
 *        rename_task 只写侧栏 title(≠ goal);pin_task/unpin_task 写 pinned_at;activate_skill 与 run_skill 同构回灌 playbook
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md;改格式须同步 ui-client agent-client
 */
import type { Task, TaskEvent } from '../storage/task-store.ts'
import type { Project } from '../storage/project-store.ts'
import type { WorkspaceAsset, SkillInfo } from '../runtime/agent-runtime.ts'
import type { UploadRef } from '../runtime/upload-awareness.ts'
import type { ImageData } from '../core/types.ts'
import type { PublicSettings, SettingsPatch } from '../storage/settings.ts'

export type { Project, SkillInfo, UploadRef }

/** demo 模式:浏览器随连接带入的模型配置(含用户自己的 key),后端只在连接内存持有、不落盘 */
export interface ConnModelConfig {
  provider: 'anthropic' | 'openai'
  model: string
  apiKey: string
  baseUrl?: string
}

/** ask_user 作答载荷(与 tools/env/ask-user-tools.AskUserAnswer 同构) */
export interface AnswerUserPayload {
  answers: Record<string, { selected: string[]; note?: string }>
  skipped?: boolean
}

export type SkillInstallScope = 'user' | 'project'

export type ClientMessage =
  | { type: 'submit'; projectId: string; userText: string; images?: ImageData[]; uploads?: UploadRef[] }
  | { type: 'continue'; taskId: string; userText: string; images?: ImageData[]; uploads?: UploadRef[]; projectId?: string }
  | { type: 'create_task'; projectId: string; goal?: string }
  | { type: 'subscribe'; taskId: string; afterSeq?: number; projectId?: string }
  | { type: 'cancel'; taskId: string; projectId?: string }
  | { type: 'archive_task'; taskId: string; projectId?: string }
  | { type: 'rename_task'; taskId: string; title: string; projectId?: string }
  | { type: 'pin_task'; taskId: string; projectId?: string }
  | { type: 'unpin_task'; taskId: string; projectId?: string }
  | { type: 'resume'; taskId: string; projectId?: string }
  | { type: 'answer_user'; taskId: string; toolCallId: string; answers: AnswerUserPayload['answers']; skipped?: boolean; projectId?: string }
  | { type: 'list'; projectId?: string }
  | { type: 'list_projects' }
  | { type: 'create_project'; name: string; sourcePath?: string }
  | { type: 'rename_project'; projectId: string; name: string }
  | { type: 'archive_project'; projectId: string }
  | { type: 'list_assets'; projectId: string; taskId?: string }
  | { type: 'read_asset'; projectId: string; path: string; taskId?: string }
  | { type: 'list_skills'; projectId: string }
  | { type: 'install_skill'; projectId: string; scope: SkillInstallScope; path: string }
  | { type: 'uninstall_skill'; projectId: string; scope: SkillInstallScope; name: string }
  | { type: 'activate_skill'; projectId: string; name: string; taskId?: string; args?: string }
  | { type: 'get_settings' }
  | { type: 'update_settings'; settings: SettingsPatch }
  | { type: 'set_model'; config: ConnModelConfig }

export type ServerMessage =
  | { type: 'hello'; demo: boolean }
  | { type: 'task_created'; taskId: string }
  | { type: 'event'; event: TaskEvent }
  | { type: 'tasks'; tasks: Task[] }
  | { type: 'projects'; projects: Project[] }
  | { type: 'project_created'; project: Project }
  | { type: 'project_updated'; project: Project }
  | { type: 'task_updated'; task: Task }
  | { type: 'assets'; assets: WorkspaceAsset[] }
  | { type: 'asset'; path: string; content: string }
  | { type: 'skills'; skills: SkillInfo[] }
  | { type: 'settings'; settings: PublicSettings }
  | { type: 'ok'; taskId?: string }
  | { type: 'error'; message: string }
