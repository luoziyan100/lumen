/**
 * [INPUT]: 无运行时依赖；产品模型 doc/studio/model.md 的对象与状态
 * [OUTPUT]: 主题、资料、引用、白板、区块、出处与版本 DTO，以及 BlockKind/BlockState 字面量
 * [POS]: studio 服务与桌面的纯类型边界，不携带数据库或框架对象
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export interface Topic {
  id: string
  title: string
  archived: boolean
  createdAt: string
  updatedAt: string
  running?: boolean
  waiting?: boolean
}

export type LibraryKind = 'file' | 'pdf' | 'web'
export type AddedBy = 'you' | 'ai'

export interface LibraryItem {
  id: string
  kind: LibraryKind
  title: string
  file: string
  sourceUrl: string | null
  sha256: string
  mediaType: string
  size: number
  addedBy: AddedBy
  createdAt: string
}

/** 主题视角的材料：原件信息 + 这个主题读到哪、被当前区块引用几处。 */
export interface TopicMaterial extends LibraryItem {
  addedAt: string
  readProgress: number
  citedBy: number
}

export type SheetState = 'live' | 'folded'

export interface Sheet {
  id: string
  topicId: string
  title: string
  state: SheetState
  capacity: number
  used: number
  ord: number
  createdAt: string
  updatedAt: string
}

export type BlockKind = 'text' | 'ladder' | 'table' | 'widget'
export type BlockState = 'current' | 'superseded' | 'settled'

/** 出处：材料（可带页码与原文）或某段对话；空数组表示「AI 推断」（R9）。 */
export type BlockSource = { itemId: string; page?: number; quote?: string } | { threadId: string }

export interface Block {
  id: string
  sheetId: string
  kind: BlockKind
  title: string
  content: unknown
  x: number
  y: number
  w: number
  h: number
  state: BlockState
  supersededBy: string | null
  rev: number
  sources: BlockSource[]
  threadId: string | null
  runId: string | null
  createdAt: string
  updatedAt: string
}

export interface SheetView { sheet: Sheet; blocks: Block[] }

export interface SheetVersion {
  sheetId: string
  version: number
  threadId: string | null
  runId: string | null
  snapshot: SheetView
  createdAt: string
}

/** 白板写入的来路：哪段对话、哪次运行（区块能回到「是谁画的」）。 */
export interface WriteOrigin { threadId: string | null; runId: string | null }
