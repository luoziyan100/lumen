/**
 * [INPUT]: 无运行时依赖，领域身份及 HTTP 分页约定
 * [OUTPUT]: 项目、带持久消息游标的会话、目录查询及分页 DTO 类型
 * [POS]: 目录服务与桌面的纯类型边界，不携带框架运行对象
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export interface Project {
  id: string
  name: string
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface ProjectSource { path: string | null; readOnly: true }

export interface SessionSummary {
  projectId: string
  taskId: string
  resourceId: string
  threadId: string
  title: string
  pinned: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
  lastMessageId: string | null
  unread: boolean
  running?: boolean
  waiting?: boolean
}

export interface CatalogQuery {
  page: number
  perPage: number
  archived: boolean | 'all'
  search?: string
}

export interface Page<T> {
  items: T[]
  page: number
  perPage: number
  total: number
  hasMore: boolean
}

export interface ProjectPatch { name?: string; archived?: boolean }
export interface SessionPatch { title?: string; pinned?: boolean; archived?: boolean }
