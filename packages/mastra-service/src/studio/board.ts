/**
 * [INPUT]: studio/db 的连接与事务、studio/content 的内容与出处合同、主题引用清单
 * [OUTPUT]: BoardStore：白板张的新建与列举、区块画/改/取代、自动排版、按运行/按对话收集改动与版本快照；insertSheet
 * [POS]: 白板唯一写入口（R4）；主题由调用方从受信身份给出，容量（R11）、rev 并发、出处边界（R15）都在单个事务里裁决
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomBytes, randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { blockTitle, parseContent, parseSources } from './content.ts'
import { transaction } from './db.ts'
import { StudioError } from './errors.ts'
import type { Block, BlockKind, BlockSource, Sheet, SheetVersion, SheetView, WriteOrigin } from './types.ts'

type Row = Record<string, SQLOutputValue>
export const DEFAULT_CAPACITY = 8

// ---------------------------------------------------------------------------
// 自动排版：三列瀑布流，AI 不管坐标；near 只决定落在哪一列。高度是估计值，前端按实测高度渲染
// ---------------------------------------------------------------------------
const COLUMN_WIDTH = 400, GAP = 32, COLUMNS = 3

function estimateHeight(kind: BlockKind, content: unknown): number {
  if (kind === 'text') return Math.min(640, 72 + Math.ceil((content as { markdown: string }).markdown.length / 26) * 22)
  if (kind === 'ladder') return 64 + (content as { rungs: unknown[] }).rungs.length * 44
  if (kind === 'table') return 64 + ((content as { rows: unknown[] }).rows.length + 1) * 34
  return 320
}

function sheet(row: Row): Sheet {
  return { id: String(row.id), topicId: String(row.topic_id), title: String(row.title), state: row.state as Sheet['state'],
    capacity: Number(row.capacity), used: Number(row.used ?? 0), ord: Number(row.ord), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
}

function block(row: Row): Block {
  return { id: String(row.id), sheetId: String(row.sheet_id), kind: row.kind as BlockKind, title: String(row.title), content: JSON.parse(String(row.content)),
    x: Number(row.x), y: Number(row.y), w: Number(row.w), h: Number(row.h), state: row.state as Block['state'],
    supersededBy: row.superseded_by === null ? null : String(row.superseded_by), rev: Number(row.rev), sources: JSON.parse(String(row.sources)) as BlockSource[],
    threadId: row.thread_id === null ? null : String(row.thread_id), runId: row.run_id === null ? null : String(row.run_id),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
}

const SHEET_COLUMNS = `s.*, (SELECT COUNT(*) FROM blocks b WHERE b.sheet_id = s.id AND b.state = 'current') AS used`

/** 新开一张进行中的白板，ord 递增；新主题建第一张与用户点 ＋ 共用。 */
export function insertSheet(db: DatabaseSync, topicId: string, title: string, now: string): string {
  const id = randomUUID()
  const ord = Number(db.prepare('SELECT COALESCE(MAX(ord), 0) + 1 AS ord FROM sheets WHERE topic_id = ?').get(topicId)!.ord)
  db.prepare(`INSERT INTO sheets (id, topic_id, title, state, capacity, ord, created_at, updated_at) VALUES (?, ?, ?, 'live', ?, ?, ?, ?)`)
    .run(id, topicId, title, DEFAULT_CAPACITY, ord, now, now)
  return id
}

export interface DrawInput { kind: BlockKind; title: string; content: unknown; sources?: unknown; near?: string }
export interface UpdateInput { blockId: string; title?: string; content?: unknown; sources?: unknown; baseRev: number }

export class BoardStore {
  private readonly db: DatabaseSync

  constructor(db: DatabaseSync) { this.db = db }

  sheets(topicId: string): Sheet[] {
    return this.db.prepare(`SELECT ${SHEET_COLUMNS} FROM sheets s WHERE s.topic_id = ? ORDER BY s.ord`).all(topicId).map(sheet)
  }

  sheet(sheetId: string): Sheet {
    const row = this.db.prepare(`SELECT ${SHEET_COLUMNS} FROM sheets s WHERE s.id = ?`).get(sheetId)
    if (!row) throw new StudioError('没有这张白板', 404)
    return sheet(row)
  }

  createSheet(topicId: string, title?: string): Sheet {
    const now = new Date().toISOString()
    const id = transaction(this.db, () => {
      const count = Number(this.db.prepare('SELECT COUNT(*) AS n FROM sheets WHERE topic_id = ?').get(topicId)!.n)
      const created = insertSheet(this.db, topicId, title?.trim() || `白板 ${count + 1}`, now)
      this.touchTopic(topicId, now)
      return created
    })
    return this.sheet(id)
  }

  view(sheetId: string): SheetView {
    const target = this.sheet(sheetId)
    return { sheet: target, blocks: this.db.prepare('SELECT * FROM blocks WHERE sheet_id = ? ORDER BY rowid').all(sheetId).map(block) }
  }

  /** 每个主题同一时刻只有一张接受 AI 写入：ord 最大的那张进行中白板。 */
  writableSheet(topicId: string): Sheet {
    const row = this.db.prepare(`SELECT ${SHEET_COLUMNS} FROM sheets s WHERE s.topic_id = ? AND s.state = 'live' ORDER BY s.ord DESC LIMIT 1`).get(topicId)
    if (!row) throw new StudioError('这个主题现在没有进行中的白板；请用户点 ＋ 新开一张', 409)
    return sheet(row)
  }

  draw(topicId: string, input: DrawInput, origin: WriteOrigin): { blockId: string; rev: number; sheetId: string; used: number; capacity: number } {
    const content = parseContent(input.kind, input.content)
    const title = this.title(input.title)
    const sources = this.sources(topicId, input.sources)
    return transaction(this.db, () => {
      const target = this.writableSheet(topicId)
      if (target.used >= target.capacity) throw new StudioError(
        `这张白板满了（${target.used}/${target.capacity}）。不要往外挤：先告诉用户这张已经写满，把想清楚的部分沉淀下来，再请用户点 ＋ 开一张新的；如果某块已被新的理解取代，可以用 board_supersede 把它标灰腾出位置。`, 409)
      const place = this.place(target.id, input.kind, content, input.near)
      const id = `b${randomBytes(5).toString('hex')}`, now = new Date().toISOString()
      this.db.prepare(`INSERT INTO blocks (id, sheet_id, kind, title, content, x, y, w, h, state, superseded_by, rev, sources, thread_id, run_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'current', NULL, 1, ?, ?, ?, ?, ?)`)
        .run(id, target.id, input.kind, title, JSON.stringify(content), place.x, place.y, place.w, place.h, JSON.stringify(sources), origin.threadId, origin.runId, now, now)
      this.touchSheet(target, now)
      return { blockId: id, rev: 1, sheetId: target.id, used: target.used + 1, capacity: target.capacity }
    })
  }

  update(topicId: string, input: UpdateInput, origin: WriteOrigin): { blockId: string; rev: number } {
    const title = input.title === undefined ? undefined : this.title(input.title)
    const sources = input.sources === undefined ? undefined : this.sources(topicId, input.sources)
    return transaction(this.db, () => {
      const current = this.ownedBlock(topicId, input.blockId)
      if (current.block.state !== 'current') throw new StudioError(`「${current.block.title}」已经不是当前区块（${current.block.state}），不能再改；需要的话画一块新的`, 409)
      if (input.baseRev !== current.block.rev) throw new StudioError(
        `「${current.block.title}」已经被改过：现在是第 ${current.block.rev} 版，你基于第 ${input.baseRev} 版。先用 board_view 看最新内容再改。`, 409)
      const content = input.content === undefined ? current.block.content : parseContent(current.block.kind, input.content)
      const now = new Date().toISOString(), rev = current.block.rev + 1
      this.db.prepare(`UPDATE blocks SET title = ?, content = ?, sources = ?, rev = ?, thread_id = ?, run_id = ?, updated_at = ? WHERE id = ?`)
        .run(title ?? current.block.title, JSON.stringify(content), JSON.stringify(sources ?? current.block.sources), rev, origin.threadId, origin.runId, now, current.block.id)
      this.touchSheet(current.sheet, now)
      return { blockId: current.block.id, rev }
    })
  }

  supersede(topicId: string, input: { blockId: string; by?: string }, origin: WriteOrigin): { blockId: string; rev: number } {
    return transaction(this.db, () => {
      const current = this.ownedBlock(topicId, input.blockId)
      if (current.block.state !== 'current') throw new StudioError(`「${current.block.title}」已经是 ${current.block.state}，不用再取代`, 409)
      if (input.by !== undefined) {
        if (input.by === input.blockId) throw new StudioError('一块不能取代它自己', 400)
        const replacement = this.db.prepare(`SELECT state FROM blocks WHERE id = ? AND sheet_id = ?`).get(input.by, current.sheet.id)
        if (!replacement || replacement.state !== 'current') throw new StudioError(`取代它的区块 ${input.by} 不在这张白板的当前区块里`, 400)
      }
      const now = new Date().toISOString(), rev = current.block.rev + 1
      this.db.prepare(`UPDATE blocks SET state = 'superseded', superseded_by = ?, rev = ?, thread_id = ?, run_id = ?, updated_at = ? WHERE id = ?`)
        .run(input.by ?? null, rev, origin.threadId, origin.runId, now, current.block.id)
      this.touchSheet(current.sheet, now)
      return { blockId: current.block.id, rev }
    })
  }

  /** 本次运行写过的白板（R7：有变化的才留版本）。 */
  changedSheets(runId: string): string[] {
    return this.db.prepare('SELECT DISTINCT sheet_id FROM blocks WHERE run_id = ? ORDER BY sheet_id').all(runId).map(row => String(row.sheet_id))
  }

  /** 这段对话自它上一个版本以来写过的白板；挂起后续跑会换 runId，按对话而不是按 runId 收，重启后也不丢。 */
  pendingSheets(threadId: string): string[] {
    return this.db.prepare(`SELECT DISTINCT sheet_id FROM blocks WHERE thread_id = ?
      AND updated_at > COALESCE((SELECT MAX(created_at) FROM sheet_versions WHERE thread_id = ?), '') ORDER BY sheet_id`).all(threadId, threadId).map(row => String(row.sheet_id))
  }

  writeVersion(sheetId: string, origin: WriteOrigin): SheetVersion {
    return transaction(this.db, () => {
      const snapshot = this.view(sheetId)
      const version = Number(this.db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM sheet_versions WHERE sheet_id = ?').get(sheetId)!.v)
      const now = new Date().toISOString()
      this.db.prepare('INSERT INTO sheet_versions VALUES (?, ?, ?, ?, ?, ?)').run(sheetId, version, origin.threadId, origin.runId, JSON.stringify(snapshot), now)
      return { sheetId, version, threadId: origin.threadId, runId: origin.runId, snapshot, createdAt: now }
    })
  }

  versions(sheetId: string): SheetVersion[] {
    return this.db.prepare('SELECT * FROM sheet_versions WHERE sheet_id = ? ORDER BY version').all(sheetId).map(row => ({
      sheetId: String(row.sheet_id), version: Number(row.version), threadId: row.thread_id === null ? null : String(row.thread_id),
      runId: row.run_id === null ? null : String(row.run_id), snapshot: JSON.parse(String(row.snapshot)) as SheetView, createdAt: String(row.created_at) }))
  }

  // -------------------------------------------------------------------------
  // 内部：归属、出处边界与排版
  // -------------------------------------------------------------------------
  private title(value: string) {
    const result = blockTitle.safeParse(value)
    if (!result.success) throw new StudioError('区块标题要有，且不超过 80 字', 400)
    return result.data
  }

  /** R15：出处只能指向本主题引用的材料或本主题的对话。 */
  private sources(topicId: string, value: unknown): BlockSource[] {
    const sources = parseSources(value)
    const referenced = this.db.prepare('SELECT 1 FROM topic_materials WHERE topic_id = ? AND item_id = ?')
    for (const source of sources) {
      if ('itemId' in source && !referenced.get(topicId, source.itemId))
        throw new StudioError(`出处里的材料 ${source.itemId} 不在这个主题的引用清单里；先用 list_materials 看能引用哪些材料`, 400)
      if ('threadId' in source && !source.threadId.startsWith(`${topicId}:`))
        throw new StudioError(`出处里的对话 ${source.threadId} 不属于这个主题`, 400)
    }
    return sources
  }

  private ownedBlock(topicId: string, blockId: string) {
    const row = this.db.prepare(`SELECT b.* FROM blocks b JOIN sheets s ON s.id = b.sheet_id WHERE b.id = ? AND s.topic_id = ?`).get(blockId, topicId)
    if (!row) throw new StudioError(`这个主题的白板上没有区块 ${blockId}；用 board_view 看现有区块`, 404)
    const owned = block(row), target = this.sheet(owned.sheetId)
    if (target.state !== 'live') throw new StudioError('这张白板已经收起，只读', 409)
    return { block: owned, sheet: target }
  }

  private place(sheetId: string, kind: BlockKind, content: unknown, near?: string) {
    const rows = this.db.prepare('SELECT id, x, y, h FROM blocks WHERE sheet_id = ?').all(sheetId)
    const bottoms = Array.from({ length: COLUMNS }, () => 0)
    const columnOf = (x: number) => Math.max(0, Math.min(COLUMNS - 1, Math.round(x / (COLUMN_WIDTH + GAP))))
    for (const row of rows) {
      const column = columnOf(Number(row.x))
      bottoms[column] = Math.max(bottoms[column]!, Number(row.y) + Number(row.h) + GAP)
    }
    const anchor = near ? rows.find(row => row.id === near) : undefined
    const column = anchor ? columnOf(Number(anchor.x)) : bottoms.indexOf(Math.min(...bottoms))
    return { x: column * (COLUMN_WIDTH + GAP), y: bottoms[column]!, w: COLUMN_WIDTH, h: estimateHeight(kind, content) }
  }

  private touchSheet(target: Sheet, now: string) {
    this.db.prepare('UPDATE sheets SET updated_at = ? WHERE id = ?').run(now, target.id)
    this.touchTopic(target.topicId, now)
  }

  private touchTopic(topicId: string, now: string) {
    this.db.prepare('UPDATE topics SET updated_at = ? WHERE id = ?').run(now, topicId)
  }
}
