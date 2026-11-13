/**
 * [INPUT]: 无运行时依赖；产品模型 doc/studio/model.md 的对象与状态
 * [OUTPUT]: 主题、资料（含作者/年份/arXiv 编号/标题来源）、引用、白板、区块、出处与版本 DTO，以及 BlockKind/BlockState 字面量
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
  /** 论文元数据（L2）：作者前 3 位 + et al.、年份、arXiv 编号；旧库与非论文为 null */
  authors: string | null
  year: number | null
  arxivId: string | null
  /** 标题从哪来：arxiv > info（PDF 文档信息）> heading（首页大字）> file；page 是网页标题、given 是调用方给的；旧库为 null */
  titleSource: 'arxiv' | 'info' | 'heading' | 'file' | 'page' | 'given' | null
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
