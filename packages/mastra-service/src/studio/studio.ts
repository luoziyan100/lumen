/**
 * [INPUT]: 显式数据根；studio/db、topics、board、library
 * [OUTPUT]: openStudio / Studio：共用一条 catalog.sqlite 连接的主题、白板、资料库存储与关闭
 * [POS]: studio 模块的组合入口；server 组装 HTTP，S3 起白板工具从同一实例读写，不另开连接
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { BoardStore } from './board.ts'
import { openStudioDb } from './db.ts'
import { LibraryStore } from './library.ts'
import { TopicStore } from './topics.ts'

export function openStudio(dataRoot: string) {
  const db = openStudioDb(dataRoot)
  let closed = false
  return {
    topics: new TopicStore(db),
    board: new BoardStore(db),
    library: new LibraryStore(db, dataRoot),
    close() {
      if (closed) return
      closed = true
      db.close()
    },
  }
}

export type Studio = ReturnType<typeof openStudio>
