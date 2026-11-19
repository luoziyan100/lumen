/**
 * [INPUT]: 无运行时依赖，领域身份及 HTTP 分页约定
 * [OUTPUT]: 主题下带持久消息游标的会话（未起标题为 null）、已归档会话、目录查询及分页 DTO 类型
 * [POS]: 目录服务与桌面的纯类型边界，不携带框架运行对象
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export interface SessionSummary {
  topicId: string
  taskId: string
  resourceId: string
  threadId: string
  /** null until the first message gives one or the user sets one (L8) */
  title: string | null
  pinned: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
  lastMessageId: string | null
  unread: boolean
  running?: boolean
  waiting?: boolean
}

/** Settings › Archived (L7): an archived conversation of a topic that is still in the list, with that topic's title. */
export interface ArchivedSession extends SessionSummary { topicTitle: string }

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

export interface SessionPatch { title?: string; pinned?: boolean; archived?: boolean }
