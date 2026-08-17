/**
 * [INPUT]: storage 的 Task / TaskEvent / Project
 * [OUTPUT]: WS 协议消息类型（client→server / server→client;含 rename_task/pin_task/unpin_task / Skills;
 *           submit/continue 可带 uploads[] / activePath — 上传知情 + 产物闭环当前稿;
 *           repair_mermaid → ok.source 为修正围栏 body（不改落库））
 * [POS]: §4 agent↔UI 协议。UI 发命令，service 推事件流；shared 包将复用这些类型。
 *        事件 kind 含 ephemeral text_delta / tool_call_start(仅 notify,不入库,见 runtime/event-hub);
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

/** 子 Agent 列表项（UI / list_subagents） */
export interface SubagentInfo {
  id: string
  parent_task_id: string
  parent_turn_id: string
  subagent_type: string
  description: string
  status: string
  isolation: string
  cwd_root: string | null
  worktree_path: string | null
  completion_summary: string | null
  resume_allowed: boolean
  created_at: string
  finished_at: string | null
}

export type ClientMessage =
  | { type: 'submit'; projectId: string; userText: string; images?: ImageData[]; uploads?: UploadRef[]; activePath?: string }
  | { type: 'continue'; taskId: string; userText: string; images?: ImageData[]; uploads?: UploadRef[]; activePath?: string; projectId?: string }
  | { type: 'create_task'; projectId: string; goal?: string }
  | { type: 'subscribe'; taskId: string; afterSeq?: number; projectId?: string }
  /** 整 task 取消（abort 主 loop + 全部子）；归档/强制停用 */
  | { type: 'cancel'; taskId: string; projectId?: string }
  /** 只停当前 turn（abort 主 loop + 杀 parent_turn 匹配的子）；UI Stop 默认 */
  | { type: 'cancel_turn'; taskId: string; projectId?: string }
  | { type: 'list_subagents'; taskId: string; projectId?: string }
  | { type: 'kill_subagent'; taskId: string; subagentId: string; projectId?: string }
  | { type: 'list_agent_types'; projectId: string }
  | { type: 'set_agent_type_disabled'; projectId: string; name: string; disabled: boolean }
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
  /** Phase B:前端发现 parse 失败后请后端单次修图;camelCase 与全协议对齐 */
  | { type: 'repair_mermaid'; taskId: string; source: string; error: string; projectId?: string }

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
  | { type: 'subagents'; taskId: string; subagents: SubagentInfo[] }
  | {
      type: 'agent_types'
      projectId: string
      agents: Array<{
        name: string
        description: string
        layer: string
        disabled: boolean
        defaultCapability: string
      }>
    }
  | { type: 'settings'; settings: PublicSettings }
  | { type: 'ok'; taskId?: string; source?: string }
  | { type: 'error'; message: string }
