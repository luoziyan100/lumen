/**
 * [INPUT]: storage 的 Task / TaskEvent
 * [OUTPUT]: WS 协议消息类型（client→server / server→client）
 * [POS]: §4 agent↔UI 协议。UI 发命令，service 推事件流；shared 包将复用这些类型
 */
import type { Task, TaskEvent } from '../storage/task-store.ts'
import type { WorkspaceAsset } from '../runtime/agent-runtime.ts'
import type { ImageData } from '../core/types.ts'
import type { PublicSettings, SettingsPatch } from '../storage/settings.ts'

/** demo 模式:浏览器随连接带入的模型配置(含用户自己的 key),后端只在连接内存持有、不落盘 */
export interface ConnModelConfig {
  provider: 'anthropic' | 'openai'
  model: string
  apiKey: string
  baseUrl?: string
}

export type ClientMessage =
  | { type: 'submit'; projectId: string; userText: string; images?: ImageData[] }
  | { type: 'continue'; taskId: string; userText: string; images?: ImageData[] }
  | { type: 'create_task'; projectId: string; goal?: string }
  | { type: 'subscribe'; taskId: string; afterSeq?: number }
  | { type: 'cancel'; taskId: string }
  | { type: 'resume'; taskId: string }
  | { type: 'list'; projectId?: string }
  | { type: 'list_assets'; projectId: string; taskId?: string }
  | { type: 'read_asset'; projectId: string; path: string; taskId?: string }
  | { type: 'get_settings' }
  | { type: 'update_settings'; settings: SettingsPatch }
  | { type: 'set_model'; config: ConnModelConfig }

export type ServerMessage =
  | { type: 'hello'; demo: boolean }
  | { type: 'task_created'; taskId: string }
  | { type: 'event'; event: TaskEvent }
  | { type: 'tasks'; tasks: Task[] }
  | { type: 'assets'; assets: WorkspaceAsset[] }
  | { type: 'asset'; path: string; content: string }
  | { type: 'settings'; settings: PublicSettings }
  | { type: 'ok'; taskId?: string }
  | { type: 'error'; message: string }
