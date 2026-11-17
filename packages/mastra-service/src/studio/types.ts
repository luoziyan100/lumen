/**
 * [INPUT]: no runtime dependencies; the objects and states of the product model in doc/studio/model.md
 * [OUTPUT]: topic, library (with authors/year/arXiv id/title source), reference, sheet, block, source and version, sediment entry/link/offer/invite DTOs,
 *           the reading of a material (sections, paragraphs and their paper/inference sources) and its list summary,
 *           plus the BlockKind/BlockState/SedimentOrigin literals
 * [POS]: the pure type boundary shared by the service and the desktop; carries no database or framework objects
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
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
  /** Paper metadata (L2): first 3 authors + et al., year, arXiv id; null for older libraries and non-papers. */
  authors: string | null
  year: number | null
  arxivId: string | null
  /** Where the title came from: arxiv > info (PDF document info) > heading (first-page big type) > file; page is a web page title, given is caller-supplied; null in older libraries. */
  titleSource: 'arxiv' | 'info' | 'heading' | 'file' | 'page' | 'given' | null
}

/** A material from the topic's point of view: the original's info plus this topic's reading progress and citation count. */
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

/** A source: a material (with optional page and quote) or a conversation; an empty array means "AI inference" (R9). */
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

/** Where a board write came from: which conversation, which run (a block can answer "who drew it"). */
export interface WriteOrigin { threadId: string | null; runId: string | null }

// -------------------------------------------------------------------------
// P1 sediment (R13): entries hold only the user's own words; P1 has a single state, the column leaves room for P2's evidence stamps
// -------------------------------------------------------------------------
export type SedimentOrigin = 'typed' | 'quoted'

/** A deleted fragment (S2): its span into the original and its text; the S9 strikethrough and the S14 habit table both feed on them. */
export interface SedimentFragment { start: number; end: number; text: string }

export interface SedimentEntry {
  id: string
  topicId: string
  /** One plain line, no Markdown rendering; an edit only appends a revision row, the old wording stays */
  text: string
  origin: SedimentOrigin
  /** Always unverified in P1; verification stamps are P2's business */
  state: string
  /** The quote's source (S2): which user message of which conversation, the full original, and the fragments kept deleted */
  quote: { threadId: string; messageId: string; original: string; fragments: SedimentFragment[] } | null
  links: SedimentLink[]
  createdAt: string
  updatedAt: string
}

/** An evidence link: the block's title is recorded at link time; after a sheet delete the link keeps its stored title for display (S3, no foreign-key cascade). */
export interface SedimentLink {
  blockId: string
  /** The block's title at link time; never changed afterwards */
  title: string
  sheetId: string
  /** The block died with its sheet: display only, no jump */
  deleted: boolean
}

/** An offer of the user's own words handed back by the AI (S4): a confirm turns it into an entry, a dismiss deletes it; the fragments drive the confirm-time strikethrough. */
export interface SedimentOffer {
  id: string
  topicId: string
  threadId: string
  messageId: string
  text: string
  original: string
  fragments: SedimentFragment[]
  blockIds: string[]
  createdAt: string
}

/** A sheet's sediment invite (S4): the latest replaces the earlier one; it dies with the sheet. */
export interface SedimentInvite {
  sheetId: string
  blockIds: string[]
  question: string
  threadId: string | null
  runId: string | null
  createdAt: string
}

/** S14 speech habits: kept/restored counts for a deleted fragment; updated only by the user's keep action. */
export interface SpeechHabit {
  fragment: string
  kept: number
  restored: number
  lastSeen: string
}

/** Where a reading paragraph comes from: a verbatim quote on a page of the material (page absent for materials without pages), or the AI's own inference. */
export type ReadingSource = { kind: 'paper'; page?: number; quote: string } | { kind: 'inference' }

export interface ReadingParagraph {
  id: string
  text: string
  source: ReadingSource
}

/** One section of a reading; it is replaced whole, so paragraph ids change with every replace. */
export interface ReadingSection {
  id: string
  /** Display order, 1-based and gapless */
  ord: number
  title: string
  paragraphs: ReadingParagraph[]
  updatedAt: string
}

/** The AI's reading of one library item inside one topic (P1: one per pair, no versions). */
export interface Reading {
  id: string
  topicId: string
  itemId: string
  itemTitle: string
  sections: ReadingSection[]
  createdAt: string
  updatedAt: string
}

/** A line of the topic's reading list: enough for the materials pane to say "write" or "open". */
export interface ReadingSummary {
  itemId: string
  title: string
  sections: number
  updatedAt: string
}
