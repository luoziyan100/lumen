/**
 * [INPUT]: 完成迁移后的只读 archive 清单、原数据库及其 WAL/SHM
 * [OUTPUT]: openArchive / withArchiveDatabase / archiveBytes；仅临时副本 SQLite 查询
 * [POS]: 旧证据读取边界；拒绝链接、无清单来源和字节篡改，绝不打开原档案数据库
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { constants } from 'node:fs'
import { open, lstat, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { DiagnosticsError } from '../../diagnostics/types.ts'

const file = z.object({ path: z.string(), kind: z.enum(['file', 'directory']), size: z.number().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/).optional() })
const manifestSchema = z.object({ version: z.literal(1), ready: z.literal(true), dryRun: z.literal(false), sourceFingerprint: z.string().min(1),
  sessions: z.array(z.object({ sourceId: z.string().min(1), sourceProjectId: z.string().min(1), projectId: z.string(), taskId: z.string(), threadId: z.string() })).max(100000),
  files: z.array(file).max(100000) })
export interface Archive { root: string; manifest: z.infer<typeof manifestSchema> }
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

export async function archiveBytes(root: string, path: string, maximum: number) {
  const destination = join(root, path), canonical = await realpath(destination)
  const rel = relative(root, canonical)
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || canonical !== destination) throw new DiagnosticsError('旧证据路径无效', 503)
  const before = await lstat(destination)
  if (!before.isFile() || before.isSymbolicLink() || before.size > maximum) throw new DiagnosticsError(before.size > maximum ? '旧证据超过读取上限' : '旧证据文件类型无效', 413)
  const handle = await open(destination, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const held = await handle.stat()
    if (held.dev !== before.dev || held.ino !== before.ino || !held.isFile() || held.size > maximum) throw new DiagnosticsError('旧证据读取时已变化', 503)
    const bytes = await handle.readFile()
    if (bytes.length > maximum) throw new DiagnosticsError('旧证据超过读取上限', 413)
    return bytes
  } finally { await handle.close() }
}

export async function openArchive(dataRoot: string): Promise<Archive | null> {
  const root = join(await realpath(dataRoot), 'archive', 'legacy-v1')
  try {
    if (await realpath(root) !== root) throw new DiagnosticsError('旧档案路径无效', 503)
    const bytes = await archiveBytes(root, 'manifest.json', 16 * 1024 * 1024)
    const parsed = manifestSchema.safeParse(JSON.parse(bytes.toString('utf8')))
    if (!parsed.success) throw new DiagnosticsError('旧档案清单损坏', 503)
    return { root, manifest: parsed.data }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    if (error instanceof DiagnosticsError) throw error
    throw new DiagnosticsError('旧档案清单无法读取', 503)
  }
}

export async function withArchiveDatabase<T>(archive: Archive, read: (db: DatabaseSync) => T): Promise<T> {
  const temporary = await mkdtemp(join(tmpdir(), 'lumen-legacy-evidence-'))
  let db: DatabaseSync | undefined
  try {
    const names = ['lumen.sqlite', 'lumen.sqlite-wal', 'lumen.sqlite-shm']
    if (!archive.manifest.files.some(item => item.path === names[0] && item.kind === 'file')) throw new DiagnosticsError('旧档案缺少数据库', 503)
    for (const name of names) {
      const item = archive.manifest.files.find(candidate => candidate.path === name && candidate.kind === 'file')
      if (!item) continue
      const bytes = await archiveBytes(archive.root, `source/${name}`, 256 * 1024 * 1024)
      if (bytes.length !== item.size || hash(bytes) !== item.sha256) throw new DiagnosticsError('旧档案数据库校验失败', 503)
      await writeFile(join(temporary, name), bytes, { mode: 0o600 })
    }
    db = new DatabaseSync(join(temporary, 'lumen.sqlite'), { readOnly: true })
    if (db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') throw new DiagnosticsError('旧档案数据库损坏', 503)
    return read(db)
  } catch (error) {
    if (error instanceof DiagnosticsError) throw error
    throw new DiagnosticsError('旧证据数据库无法读取', 503)
  } finally { db?.close(); await rm(temporary, { recursive: true, force: true }) }
}
