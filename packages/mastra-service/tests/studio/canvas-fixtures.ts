/**
 * [INPUT]: the studio's catalog connection; the canvas types
 * [OUTPUT]: element (a minimal Excalidraw element), layOut (what the app sends back for an op, without real fonts), png (a valid 1×1 PNG for glances), legacyBlock (an old blocks row written directly)
 * [POS]: test fixtures of studio/: the service never measures or converts, so tests stand in for the app; legacyBlock keeps old-data paths (takeaway links,
 *        deletion counts) testable after the block writers retired
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { randomBytes } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'
import type { DatabaseSync } from 'node:sqlite'
import type { CanvasElement, CanvasOp } from '../../src/studio/types.ts'

export function element(id: string, type = 'rectangle', extra: Partial<CanvasElement> = {}): CanvasElement {
  return { id, type, version: 1, versionNonce: 1, isDeleted: false, x: 0, y: 0, width: 100, height: 60, boundElements: null, ...extra }
}

/** The app's side of a draw op: each skeleton becomes an element at version 1, a label becomes a bound text element `<id>-label`. */
export function layOut(op: CanvasOp): CanvasElement[] {
  if (op.kind === 'update') return []
  return (op.skeletons as (Record<string, unknown> & { id: string; type: string; label?: { text: string } })[]).flatMap(skeleton => {
    const { label, start, end, ...rest } = skeleton
    const shape = element(skeleton.id, skeleton.type, { ...rest, version: 1, boundElements: label ? [{ id: `${skeleton.id}-label`, type: 'text' }] : null,
      ...(start ? { startBinding: { elementId: (start as { id: string }).id } } : {}), ...(end ? { endBinding: { elementId: (end as { id: string }).id } } : {}) })
    return label ? [shape, element(`${skeleton.id}-label`, 'text', { text: label.text, containerId: skeleton.id })] : [shape]
  })
}

export function legacyBlock(db: DatabaseSync, sheetId: string, block: { id?: string; title: string; state?: 'current' | 'superseded' | 'settled'; sources?: unknown[] }): string {
  const id = block.id ?? `b${randomBytes(5).toString('hex')}`, now = new Date().toISOString()
  db.prepare(`INSERT INTO blocks (id, sheet_id, kind, title, content, x, y, w, h, state, superseded_by, rev, sources, thread_id, run_id, created_at, updated_at)
    VALUES (?, ?, 'text', ?, ?, 0, 0, 400, 120, ?, NULL, 1, ?, NULL, NULL, ?, ?)`)
    .run(id, sheetId, block.title, JSON.stringify({ markdown: block.title }), block.state ?? 'current', JSON.stringify(block.sources ?? []), now, now)
  return id
}

/** A valid 1×1 PNG (CRCs included), enough for the glance's header check */
export function png(): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4), check = Buffer.alloc(4)
    length.writeUInt32BE(data.length); check.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])))
    return Buffer.concat([length, Buffer.from(type), data, check])
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0]))), chunk('IEND', Buffer.alloc(0))])
}
