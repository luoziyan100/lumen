/**
 * [INPUT]: studio/db connections and transactions; the canvas contract of studio/content (limits, element id, skeleton and patch shapes); StudioError
 * [OUTPUT]: CanvasStore: one sheet's scene (elements with tombstones, pending AI ops, open erasures, viewport, changed since the last snapshot); the user's save
 *           (merge by id, the higher version wins, the service records the author); AI draw/update queued as ops; an op's commit by the app (AI authorship,
 *           no revive, the user's elements gain bindings only); AI erase (own elements deleted, the user's strokes soft-deleted into a recycle record, the user's
 *           text refused); restore/dismiss; viewport; image files; the glance (the app's latest PNG and the scene version it shows); per-run snapshots (R7) and the sheets a conversation changed; liveElements for the board tools; locate (which sheet of a topic holds an element, never across topics)
 * [POS]: the canvas's only write path (R4), beside BoardStore, which keeps sheets, the selection and run targets. The service has no text measurement
 *        (phase-0 P7), so it never builds an AI element itself: the app converts skeletons with real fonts and commits them back. Every AI path refuses the
 *        user's text (R5), and no AI path revives a tombstone
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { createHash, randomBytes, randomInt } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { CANVAS_LIMITS, elementId, type ElementPatch, type Skeleton } from './content.ts'
import { imageInfo } from '../ingestion/images.ts'
import { transaction } from './db.ts'
import { StudioError } from './errors.ts'
import type { Author, CanvasElement, CanvasErasure, CanvasOp, CanvasScene, Sheet, Viewport, WriteOrigin } from './types.ts'

type Row = Record<string, SQLOutputValue>
interface Stored { element: CanvasElement; author: Author; deletedBy: Author | null }
export interface CanvasFile { id: string; mimeType: string; dataURL: string }
/** The app's latest PNG of a sheet and the scene version it shows (Q6) */
export interface Glance { sceneVersion: number; png: Uint8Array; width: number; height: number; updatedAt: string }
const GLANCE_BYTES = 2 * 1024 * 1024

const stamp = () => new Date().toISOString()
const opId = () => `o${randomBytes(5).toString('hex')}`
/** Ids the service hands out for AI elements the model left unnamed: short, so the model can copy them back */
const newElementId = () => `a${randomBytes(4).toString('hex')}`
/** Shapes an arrow may bind to; the same set Excalidraw binds to, minus frames */
const BINDABLE = new Set(['rectangle', 'ellipse', 'diamond', 'text', 'image'])

/** Excalidraw's own rule for a changed element: a higher version, a fresh nonce, the edit time. */
function bumped(element: CanvasElement, change: Partial<CanvasElement>): CanvasElement {
  return { ...element, ...change, version: element.version + 1, versionNonce: randomInt(2 ** 31), updated: Date.now() }
}

function stored(row: Row): Stored {
  return { element: JSON.parse(String(row.element)) as CanvasElement, author: row.author as Author, deletedBy: row.deleted_by === null ? null : row.deleted_by as Author }
}

function op(row: Row): CanvasOp {
  const payload = JSON.parse(String(row.payload)) as { title: string; skeletons?: unknown[]; patches?: unknown[]; ids: string[] }
  return { id: String(row.id), kind: row.kind as CanvasOp['kind'], title: payload.title, skeletons: payload.skeletons ?? [], patches: payload.patches ?? [], ids: payload.ids,
    threadId: row.thread_id === null ? null : String(row.thread_id), runId: row.run_id === null ? null : String(row.run_id), createdAt: String(row.created_at) }
}

/** The user's text: a text element the user wrote, standing alone or as the label of a shape or arrow. */
const userText = (row: Stored) => row.author === 'you' && row.element.type === 'text'

/** A save from the app: an Excalidraw element needs an id, a type and a positive version; everything else is kept verbatim. */
function checkElement(value: unknown): CanvasElement {
  const element = value as CanvasElement
  if (typeof element !== 'object' || element === null || !elementId.safeParse(element.id).success || typeof element.type !== 'string' || element.type.length > 32
    || !Number.isSafeInteger(element.version) || element.version < 1) throw new StudioError('画布元素缺 id、type 或 version', 400, 'board.element_invalid', { issues: 'id/type/version' })
  if (Buffer.byteLength(JSON.stringify(element)) > CANVAS_LIMITS.elementBytes) throw new StudioError('单个画布元素超过 256KB', 413, 'board.element_too_large', { id: element.id })
  return element
}

export class CanvasStore {
  private readonly db: DatabaseSync

  constructor(db: DatabaseSync) { this.db = db }

  // -------------------------------------------------------------------------
  // Reads: the app's scene and the board tools' live view
  // -------------------------------------------------------------------------
  scene(sheet: Sheet): CanvasScene {
    const elements = this.rows(sheet.id).map(row => row.element)
    return { sheet, elements, ops: this.ops(sheet.id), erasures: this.erasures(sheet.id), viewport: this.viewport(sheet.id), changed: this.changed(sheet.id) }
  }

  /** Live elements with their authors, in paint order (Excalidraw's fractional index, else insertion order). */
  liveElements(sheetId: string): { element: CanvasElement; author: Author }[] {
    return this.rows(sheetId).filter(row => !row.element.isDeleted)
      .sort((a, b) => String(a.element.index ?? '').localeCompare(String(b.element.index ?? '')))
  }

  ops(sheetId: string): CanvasOp[] {
    return this.db.prepare('SELECT * FROM canvas_ops WHERE sheet_id = ? ORDER BY created_at, rowid').all(sheetId).map(op)
  }

  erasures(sheetId: string): CanvasErasure[] {
    return this.db.prepare(`SELECT * FROM canvas_erasures WHERE sheet_id = ? AND state = 'open' ORDER BY created_at, rowid`).all(sheetId).map(row => ({
      id: String(row.id), elementIds: JSON.parse(String(row.element_ids)) as string[], reason: String(row.reason),
      threadId: row.thread_id === null ? null : String(row.thread_id), createdAt: String(row.created_at) }))
  }

  viewport(sheetId: string): Viewport | null {
    const row = this.db.prepare('SELECT x, y, width, height FROM canvas_viewports WHERE sheet_id = ?').get(sheetId)
    return row ? { x: Number(row.x), y: Number(row.y), width: Number(row.width), height: Number(row.height) } : null
  }

  /** Content for the R17 confirmation: live elements plus the elements AI ops still wait to lay out. */
  count(sheetId: string): number {
    return this.liveElements(sheetId).length + this.ops(sheetId).reduce((n, pending) => n + pending.ids.length, 0)
  }

  /** Which of the topic's sheets holds a live element: a conversation card jumps there. Ids are random within a canvas, never a global key, so the topic bounds the lookup. */
  locate(topicId: string, id: string): string | null {
    const row = this.db.prepare(`SELECT e.sheet_id FROM canvas_elements e JOIN sheets s ON s.id = e.sheet_id
      WHERE s.topic_id = ? AND e.id = ? AND json_extract(e.element, '$.isDeleted') IS NOT 1 ORDER BY s.ord LIMIT 1`).get(topicId, id)
    return row ? String(row.sheet_id) : null
  }

  file(sheetId: string, fileId: string): CanvasFile {
    const row = this.db.prepare('SELECT id, mime_type, data_url FROM canvas_files WHERE sheet_id = ? AND id = ?').get(sheetId, fileId)
    if (!row) throw new StudioError('这张白板上没有这张图片', 404, 'board.file_missing', { fileId })
    return { id: String(row.id), mimeType: String(row.mime_type), dataURL: String(row.data_url) }
  }

  // -------------------------------------------------------------------------
  // The user's save (debounced in the app, only changed elements): merge by id, the higher version wins.
  // A tombstone comes back only from a user save that is newer than it (the user's own undo); no AI path revives one
  // -------------------------------------------------------------------------
  save(sheetId: string, elements: unknown[], files: CanvasFile[] = []): { saved: number; kept: CanvasElement[] } {
    if (elements.length > CANVAS_LIMITS.save) throw new StudioError(`一次最多保存 ${CANVAS_LIMITS.save} 个元素`, 413, 'board.element_too_large', { id: '' })
    const incoming = elements.map(checkElement)
    return transaction(this.db, () => {
      this.storeFiles(sheetId, files)
      const kept: CanvasElement[] = []
      let saved = 0
      const now = stamp()
      for (const element of incoming) {
        const current = this.row(sheetId, element.id)
        if (current && element.version <= current.element.version) { kept.push(current.element); continue }
        // An AI erase is undone only through restore: a newer save of a still-erased stroke means the user drew on it, so the recycle loses it
        const deletedBy = element.isDeleted ? (current?.deletedBy && current.element.isDeleted ? current.deletedBy : 'you') : null
        this.write(sheetId, element, current?.author ?? 'you', deletedBy, { threadId: null, runId: null }, now)
        saved++
      }
      if (saved) this.touch(sheetId, now)
      return { saved, kept }
    })
  }

  // -------------------------------------------------------------------------
  // AI writes (board tools). Draw and update wait as ops; the app measures and commits them
  // -------------------------------------------------------------------------
  queueDraw(sheetId: string, title: string, skeletons: Skeleton[], origin: WriteOrigin): CanvasOp {
    if (!skeletons.length || skeletons.length > CANVAS_LIMITS.draw) throw new StudioError(`一次画 1–${CANVAS_LIMITS.draw} 个元素`, 400, 'board.element_invalid', { issues: 'elements' })
    return transaction(this.db, () => {
      const taken = this.takenIds(sheetId)
      const named = skeletons.map(skeleton => ({ ...skeleton, id: skeleton.id ?? newElementId() }))
      const batch = new Map(named.map(skeleton => [skeleton.id, skeleton]))
      if (batch.size !== named.length) throw new StudioError('这次画的元素里有重复的 id', 400, 'board.element_exists', { id: named.find((s, i) => named.findIndex(o => o.id === s.id) !== i)!.id })
      for (const skeleton of named) {
        if (taken.has(skeleton.id)) throw new StudioError(`白板上已经有 id 为 ${skeleton.id} 的元素（或它刚被删掉，不能复用）；换个 id，或不给 id 让系统分配`, 409, 'board.element_exists', { id: skeleton.id })
        for (const end of [skeleton.start, skeleton.end]) if (end) this.bindable(sheetId, end.id, batch)
        for (const child of skeleton.children ?? []) this.ownChild(sheetId, child, batch)
        if (skeleton.fileId) this.file(sheetId, skeleton.fileId)
      }
      return this.insertOp(sheetId, 'draw', { title, skeletons: named, ids: named.map(skeleton => skeleton.id) }, origin)
    })
  }

  queueUpdate(sheetId: string, title: string, patches: ElementPatch[], origin: WriteOrigin): CanvasOp {
    if (!patches.length || patches.length > CANVAS_LIMITS.draw) throw new StudioError(`一次改 1–${CANVAS_LIMITS.draw} 个元素`, 400, 'board.element_invalid', { issues: 'elements' })
    return transaction(this.db, () => {
      for (const patch of patches) {
        const current = this.live(sheetId, patch.id)
        if (current.author !== 'ai') throw new StudioError(`${patch.id} 是用户画的，你不改用户的元素（R2）；要补充就在旁边画新的，画废的笔画用 board_erase`, 409, 'board.not_yours', { id: patch.id })
        if (patch.text !== undefined && current.element.type !== 'text') throw new StudioError(`${patch.id} 是 ${current.element.type}，不是文字；改形状里的字就改它的标签文字元素`, 400, 'board.element_invalid', { issues: `${patch.id}.text` })
      }
      return this.insertOp(sheetId, 'update', { title, patches, ids: patches.map(patch => patch.id) }, origin)
    })
  }

  /**
   * The app laid an op out and sends the resulting elements. New ids of a draw become AI elements; the AI's existing elements take a newer version
   * unless they are tombstones; the user's elements only take their bound-element list (an AI arrow attached to them). The first commit consumes the op.
   */
  commit(sheetId: string, id: string, elements: unknown[], files: CanvasFile[] = []): { committed: number } {
    const incoming = elements.map(checkElement)
    return transaction(this.db, () => {
      const row = this.db.prepare('SELECT * FROM canvas_ops WHERE id = ? AND sheet_id = ?').get(id, sheetId)
      if (!row) throw new StudioError('这一笔已经落到白板上了', 409, 'board.op_done', { id })
      const pending = op(row), created = new Set(pending.kind === 'draw' ? pending.ids : []), now = stamp()
      const origin = { threadId: pending.threadId, runId: pending.runId }
      this.storeFiles(sheetId, files)
      let committed = 0
      for (const element of incoming) {
        const current = this.row(sheetId, element.id)
        const tagged = { ...element, customData: { ...element.customData, author: 'ai' } }
        if (!current) {
          // Labels of new shapes get their ids in the app; anything else unknown is not this op's business
          if (created.has(element.id) || (element.containerId && created.has(element.containerId))) { this.write(sheetId, tagged, 'ai', null, origin, now); committed++ }
          continue
        }
        if (current.element.isDeleted) continue
        if (current.author === 'ai') {
          if (element.version > current.element.version && !element.isDeleted) { this.write(sheetId, tagged, 'ai', null, origin, now); committed++ }
          continue
        }
        // The user's element: never its text or shape, only the arrows bound to it
        const bound = element.boundElements ?? null
        if (JSON.stringify(bound) !== JSON.stringify(current.element.boundElements ?? null)) {
          this.write(sheetId, bumped(current.element, { boundElements: bound }), 'you', null, { threadId: null, runId: null }, now)
          committed++
        }
      }
      this.db.prepare('DELETE FROM canvas_ops WHERE id = ?').run(id)
      this.touch(sheetId, now)
      return { committed }
    })
  }

  /** R5: the AI's own elements are deleted; the user's lines and shapes are soft-deleted into one recycle record; the user's text refuses the whole call. */
  erase(sheetId: string, ids: string[], reason: string, origin: WriteOrigin): { removed: string[]; recycled: string[]; erasureId: string | null } {
    return transaction(this.db, () => {
      const rows = [...new Set(ids)].map(id => this.live(sheetId, id))
      for (const row of rows) {
        if (userText(row)) throw new StudioError(`${row.element.id} 是用户写的字，AI 不改也不删用户的字（R5）；什么都没擦`, 409, 'board.user_text', { id: row.element.id })
        const label = (row.element.boundElements ?? []).map(bound => bound.type === 'text' ? this.row(sheetId, bound.id) : null).find(bound => bound && !bound.element.isDeleted && userText(bound))
        if (label) throw new StudioError(`${row.element.id} 带着用户写的字（${label.element.id}），擦它会连字一起擦掉；什么都没擦`, 409, 'board.user_text', { id: label.element.id })
      }
      const now = stamp(), removed: string[] = [], recycled: string[] = []
      for (const row of rows) {
        // The AI's own shape takes its own label with it, as Excalidraw does
        const labels = row.author === 'ai' ? (row.element.boundElements ?? []).filter(bound => bound.type === 'text').map(bound => this.row(sheetId, bound.id)).filter(label => label && !label.element.isDeleted) as Stored[] : []
        for (const target of [row, ...labels]) {
          this.write(sheetId, bumped(target.element, { isDeleted: true }), target.author, 'ai', origin, now)
          ;(target.author === 'ai' ? removed : recycled).push(target.element.id)
        }
      }
      let erasureId: string | null = null
      if (recycled.length) {
        erasureId = `e${randomBytes(5).toString('hex')}`
        this.db.prepare('INSERT INTO canvas_erasures (id, sheet_id, element_ids, reason, thread_id, run_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(erasureId, sheetId, JSON.stringify(recycled), reason, origin.threadId, origin.runId, now)
      }
      this.touch(sheetId, now)
      return { removed, recycled, erasureId }
    })
  }

  /** The user's one click: every open erasure of the sheet comes back (strokes the user touched since stay as they are). */
  restore(sheetId: string): { restored: number } {
    return transaction(this.db, () => {
      const now = stamp()
      let restored = 0
      for (const erasure of this.erasures(sheetId)) {
        for (const id of erasure.elementIds) {
          const current = this.row(sheetId, id)
          if (!current?.element.isDeleted || current.deletedBy !== 'ai') continue
          this.write(sheetId, bumped(current.element, { isDeleted: false }), current.author, null, { threadId: null, runId: null }, now)
          restored++
        }
        this.db.prepare(`UPDATE canvas_erasures SET state = 'restored' WHERE id = ?`).run(erasure.id)
      }
      this.touch(sheetId, now)
      return { restored }
    })
  }

  /** The user keeps the erase: the notice goes, the strokes stay deleted. */
  dismiss(sheetId: string): void {
    this.db.prepare(`UPDATE canvas_erasures SET state = 'dismissed' WHERE sheet_id = ? AND state = 'open'`).run(sheetId)
  }

  /** One row per sheet, overwritten; never a version. */
  setViewport(sheetId: string, viewport: Viewport): void {
    this.db.prepare(`INSERT INTO canvas_viewports (sheet_id, x, y, width, height, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (sheet_id) DO UPDATE SET x = excluded.x, y = excluded.y, width = excluded.width, height = excluded.height, updated_at = excluded.updated_at`)
      .run(sheetId, viewport.x, viewport.y, viewport.width, viewport.height, stamp())
  }

  // -------------------------------------------------------------------------
  // Glance (Q6): what the AI sees. The scene version is the sum of element versions, as Excalidraw counts it: it only grows,
  // so a glance at or above the stored sum shows every write the service has
  // -------------------------------------------------------------------------
  sceneVersion(sheetId: string): number {
    return Number(this.db.prepare('SELECT COALESCE(SUM(version), 0) AS v FROM canvas_elements WHERE sheet_id = ?').get(sheetId)!.v)
  }

  setGlance(sheetId: string, sceneVersion: number, png: Uint8Array): void {
    if (png.length > GLANCE_BYTES) throw new StudioError('白板画面超过 2MB', 413, 'board.element_too_large', { id: 'glance' })
    let info
    try { info = imageInfo(Buffer.from(png)) } catch { info = null }
    if (info?.mediaType !== 'image/png') throw new StudioError('白板画面要是 PNG', 400, 'board.element_invalid', { issues: 'glance' })
    this.db.prepare(`INSERT INTO canvas_glances (sheet_id, scene_version, png, width, height, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (sheet_id) DO UPDATE SET scene_version = excluded.scene_version, png = excluded.png, width = excluded.width, height = excluded.height, updated_at = excluded.updated_at`)
      .run(sheetId, sceneVersion, png, info.width, info.height, stamp())
  }

  glance(sheetId: string): Glance | null {
    const row = this.db.prepare('SELECT * FROM canvas_glances WHERE sheet_id = ?').get(sheetId)
    return row ? { sceneVersion: Number(row.scene_version), png: new Uint8Array(row.png as Uint8Array), width: Number(row.width), height: Number(row.height), updatedAt: String(row.updated_at) } : null
  }

  /** The glance shows everything the service holds: no op waits for the app, and its scene version reached the stored one. */
  glanceCurrent(sheetId: string): boolean {
    const glance = this.glance(sheetId)
    return !!glance && !this.ops(sheetId).length && glance.sceneVersion >= this.sceneVersion(sheetId)
  }

  // -------------------------------------------------------------------------
  // R7: a run that leaves the scene different from the last snapshot gets one; user autosaves alone never make a version
  // -------------------------------------------------------------------------
  /** Sheets this conversation wrote, erased or queued on since its last snapshot (a resumed suspension keeps its thread, so this survives restarts). */
  changedBy(threadId: string): string[] {
    const since = String(this.db.prepare('SELECT COALESCE(MAX(created_at), \'\') AS at FROM canvas_snapshots WHERE thread_id = ?').get(threadId)!.at)
    return this.db.prepare(`SELECT sheet_id FROM canvas_elements WHERE thread_id = ? AND updated_at > ?
      UNION SELECT sheet_id FROM canvas_ops WHERE thread_id = ? UNION SELECT sheet_id FROM canvas_erasures WHERE thread_id = ? AND created_at > ? ORDER BY sheet_id`)
      .all(threadId, since, threadId, threadId, since).map(row => String(row.sheet_id))
  }

  /** null: the scene equals the last snapshot. Pending ops ride along, so a run whose drawing the app has not laid out yet still records it. */
  snapshot(sheetId: string, origin: WriteOrigin): { version: number; createdAt: string } | null {
    return transaction(this.db, () => {
      const hash = this.hash(sheetId)
      const last = this.db.prepare('SELECT hash FROM canvas_snapshots WHERE sheet_id = ? ORDER BY version DESC LIMIT 1').get(sheetId)
      if ((last && String(last.hash) === hash) || (!last && !this.liveElements(sheetId).length && !this.ops(sheetId).length)) return null
      const version = Number(this.db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM canvas_snapshots WHERE sheet_id = ?').get(sheetId)!.v), createdAt = stamp()
      const body = JSON.stringify({ elements: this.liveElements(sheetId), ops: this.ops(sheetId) })
      this.db.prepare('INSERT INTO canvas_snapshots (sheet_id, version, hash, elements, thread_id, run_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(sheetId, version, hash, body, origin.threadId, origin.runId, createdAt)
      return { version, createdAt }
    })
  }

  snapshots(sheetId: string): { version: number; threadId: string | null; runId: string | null; elements: { element: CanvasElement; author: Author }[]; ops: CanvasOp[]; createdAt: string }[] {
    return this.db.prepare('SELECT * FROM canvas_snapshots WHERE sheet_id = ? ORDER BY version').all(sheetId).map(row => ({
      version: Number(row.version), threadId: row.thread_id === null ? null : String(row.thread_id), runId: row.run_id === null ? null : String(row.run_id),
      ...JSON.parse(String(row.elements)) as { elements: { element: CanvasElement; author: Author }[]; ops: CanvasOp[] }, createdAt: String(row.created_at) }))
  }

  /** Has the scene moved since the last snapshot (or is there something and no snapshot yet)? */
  changed(sheetId: string): boolean {
    const last = this.db.prepare('SELECT hash FROM canvas_snapshots WHERE sheet_id = ? ORDER BY version DESC LIMIT 1').get(sheetId)
    return last ? String(last.hash) !== this.hash(sheetId) : this.liveElements(sheetId).length > 0 || this.ops(sheetId).length > 0
  }

  /** R17: the sheet's canvas goes with it, in the caller's transaction. */
  deleteSheet(sheetId: string): void {
    for (const table of ['canvas_elements', 'canvas_files', 'canvas_ops', 'canvas_erasures', 'canvas_snapshots', 'canvas_viewports', 'canvas_glances']) this.db.prepare(`DELETE FROM ${table} WHERE sheet_id = ?`).run(sheetId)
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------
  private rows(sheetId: string): Stored[] {
    return this.db.prepare('SELECT element, author, deleted_by FROM canvas_elements WHERE sheet_id = ? ORDER BY rowid').all(sheetId).map(stored)
  }

  private row(sheetId: string, id: string): Stored | undefined {
    const row = this.db.prepare('SELECT element, author, deleted_by FROM canvas_elements WHERE sheet_id = ? AND id = ?').get(sheetId, id)
    return row ? stored(row) : undefined
  }

  private live(sheetId: string, id: string): Stored {
    const row = this.row(sheetId, id)
    if (!row || row.element.isDeleted) throw new StudioError(`这张白板上没有 ${id}（或它已经被删了）；用 board_view 看现有元素`, 404, 'board.element_missing', { id })
    return row
  }

  /** Every id ever used on the sheet, tombstones included, plus ids still waiting in ops: an AI draw never reuses one (no revive). */
  private takenIds(sheetId: string): Set<string> {
    const ids = new Set(this.db.prepare('SELECT id FROM canvas_elements WHERE sheet_id = ?').all(sheetId).map(row => String(row.id)))
    for (const pending of this.ops(sheetId)) for (const id of pending.ids) ids.add(id)
    return ids
  }

  private bindable(sheetId: string, id: string, batch: Map<string, Skeleton>) {
    const type = batch.get(id)?.type ?? this.pendingType(sheetId, id) ?? this.live(sheetId, id).element.type
    if (!BINDABLE.has(type)) throw new StudioError(`箭头只能连到 rectangle/ellipse/diamond/text/image 上，${id} 是 ${type}`, 400, 'board.element_invalid', { issues: `${id}: ${type}` })
  }

  /** A frame of the AI only holds the AI's elements: framing the user's would change them (R2). */
  private ownChild(sheetId: string, id: string, batch: Map<string, Skeleton>) {
    if (batch.has(id) || this.pendingType(sheetId, id)) return
    if (this.live(sheetId, id).author !== 'ai') throw new StudioError(`${id} 是用户画的，不能框进你的 frame（会改到用户的元素）`, 409, 'board.not_yours', { id })
  }

  private pendingType(sheetId: string, id: string): string | undefined {
    for (const pending of this.ops(sheetId)) for (const skeleton of pending.skeletons as Skeleton[]) if (skeleton.id === id) return skeleton.type
    return undefined
  }

  private insertOp(sheetId: string, kind: CanvasOp['kind'], payload: { title: string; skeletons?: unknown[]; patches?: unknown[]; ids: string[] }, origin: WriteOrigin): CanvasOp {
    const id = opId(), now = stamp()
    this.db.prepare('INSERT INTO canvas_ops (id, sheet_id, kind, payload, thread_id, run_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, sheetId, kind, JSON.stringify(payload), origin.threadId, origin.runId, now)
    this.touch(sheetId, now)
    return op(this.db.prepare('SELECT * FROM canvas_ops WHERE id = ?').get(id)!)
  }

  private write(sheetId: string, element: CanvasElement, author: Author, deletedBy: Author | null, origin: WriteOrigin, now: string) {
    this.db.prepare(`INSERT INTO canvas_elements (sheet_id, id, author, type, version, deleted_by, element, thread_id, run_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (sheet_id, id) DO UPDATE SET type = excluded.type, version = excluded.version, deleted_by = excluded.deleted_by, element = excluded.element,
        thread_id = excluded.thread_id, run_id = excluded.run_id, updated_at = excluded.updated_at`)
      .run(sheetId, element.id, author, element.type, element.version, element.isDeleted ? deletedBy : null, JSON.stringify(element), origin.threadId, origin.runId, now)
  }

  private storeFiles(sheetId: string, files: CanvasFile[]) {
    if (files.length > CANVAS_LIMITS.files) throw new StudioError(`一次最多存 ${CANVAS_LIMITS.files} 张图片`, 413, 'board.element_too_large', { id: '' })
    for (const file of files) {
      if (!elementId.safeParse(file.id).success && !/^[A-Za-z0-9_-]{1,128}$/.test(String(file.id))) throw new StudioError('图片 id 不对', 400, 'board.element_invalid', { issues: 'file.id' })
      if (!/^image\/[a-z0-9.+-]+$/.test(file.mimeType) || !file.dataURL.startsWith(`data:${file.mimeType};base64,`)) throw new StudioError('只收图片的 data URL', 400, 'board.element_invalid', { issues: 'file.dataURL' })
      if (file.dataURL.length > CANVAS_LIMITS.fileBytes * 4 / 3 + 64) throw new StudioError('单张图片超过 4MB', 413, 'board.element_too_large', { id: file.id })
      this.db.prepare('INSERT OR IGNORE INTO canvas_files (sheet_id, id, mime_type, data_url, created_at) VALUES (?, ?, ?, ?, ?)').run(sheetId, file.id, file.mimeType, file.dataURL, stamp())
    }
  }

  /** The scene's identity: live element ids and versions, plus pending ops. */
  private hash(sheetId: string): string {
    const parts = this.liveElements(sheetId).map(row => `${row.element.id}:${row.element.version}`).sort()
    for (const pending of this.ops(sheetId)) parts.push(`op:${pending.id}`)
    return createHash('sha256').update(parts.join('\n')).digest('hex')
  }

  private touch(sheetId: string, now: string) {
    this.db.prepare('UPDATE sheets SET updated_at = ? WHERE id = ?').run(now, sheetId)
    this.db.prepare('UPDATE topics SET updated_at = ? WHERE id = (SELECT topic_id FROM sheets WHERE id = ?)').run(now, sheetId)
  }
}
