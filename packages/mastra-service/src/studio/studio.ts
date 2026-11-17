/**
 * [INPUT]: an explicit data root; studio/db, topics, board, sediment, readings, library
 * [OUTPUT]: openStudio / Studio: topic, board, sediment, reading and library stores over one shared catalog.sqlite connection (db) plus close; schema=false only opens and never changes the schema
 * [POS]: the studio module's composition entry; the server assembles HTTP and board tools read/write the same instance from S3 on — no second connection
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { BoardStore } from './board.ts'
import { openStudioDb } from './db.ts'
import { LibraryStore } from './library.ts'
import { ReadingStore } from './reading.ts'
import { SedimentStore } from './sediment.ts'
import { TopicStore } from './topics.ts'

/** schema=false: only open a library the service already built; no tables, no columns (for data-only tools such as backfill) */
export function openStudio(dataRoot: string, options: { schema?: boolean } = {}) {
  const db = openStudioDb(dataRoot, options)
  let closed = false
  return {
    /** The same connection; the backfill command uses it for its VACUUM INTO backup */
    db,
    topics: new TopicStore(db),
    board: new BoardStore(db),
    sediment: new SedimentStore(db),
    readings: new ReadingStore(db),
    library: new LibraryStore(db, dataRoot),
    close() {
      if (closed) return
      closed = true
      db.close()
    },
  }
}

export type Studio = ReturnType<typeof openStudio>
