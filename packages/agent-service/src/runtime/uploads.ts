/**
 * [INPUT]: workspace 工厂、docx 抽取、project-store.ensureProjectDirs
 * [OUTPUT]: saveUploadedFile / UploadReceipt / uploadFolderForExt
 * [POS]: runtime/ 上传落盘。按表示归位(pdf→papers/ 文本→docs/ 图→images/ 其余 uploads/);
 *        docx 另抽 docs/<stem>.md。知情附言在 upload-awareness.ts,本文件只管写盘。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { extractDocxText, docxExtractMarkdown } from '../tools/ingest/docx.ts'
import { ensureProjectDirs } from '../storage/project-store.ts'
import type { FsWorkspace } from '../workspace/fs-workspace.ts'

/** saveUpload 回执:路径 + 可选抽出稿(知情附言用) */
export interface UploadReceipt {
  path: string
  name: string
  extractPath?: string
}

const UPLOAD_DOCS_EXT = new Set([
  'md', 'markdown', 'txt', 'tex', 'csv', 'tsv', 'json', 'jsonl', 'html', 'htm',
  'xml', 'yaml', 'yml', 'toml', 'css', 'svg', 'log', 'ini', 'conf',
  'py', 'sh', 'bash', 'zsh', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'hpp', 'cs',
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'php', 'sql', 'r',
])
const UPLOAD_IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

/** 表示分类:可渲染/可文本读 → papers|docs|images;其余 opaque → uploads */
export function uploadFolderForExt(ext: string): 'papers' | 'docs' | 'images' | 'uploads' {
  if (ext === 'pdf') return 'papers'
  if (UPLOAD_DOCS_EXT.has(ext)) return 'docs'
  if (UPLOAD_IMAGE_EXT.has(ext)) return 'images'
  return 'uploads'
}

export async function saveUploadedFile(opts: {
  workspacesDir: string
  projectId: string
  name: string
  bytes: Uint8Array
  taskId?: string
  scope: 'shared' | 'session'
  projectRoot: (projectId: string) => FsWorkspace
  session: (projectId: string, taskId?: string) => FsWorkspace
}): Promise<UploadReceipt> {
  ensureProjectDirs(opts.workspacesDir, opts.projectId)
  const safe = (opts.name.split(/[/\\]/).pop() || 'upload').replace(/[^\w.\-一-鿿]/g, '_')
  const ext = (safe.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
  const kind = uploadFolderForExt(ext)
  const ws = opts.scope === 'shared'
    ? opts.projectRoot(opts.projectId)
    : opts.session(opts.projectId, opts.taskId)
  const file = opts.scope === 'shared' ? `shared/${kind}/${safe}` : `${kind}/${safe}`
  await ws.writeBytes(file, opts.bytes)

  let extractPath: string | undefined
  if (ext === 'docx') {
    try {
      const text = extractDocxText(opts.bytes)
      const stem = safe.replace(/\.docx$/i, '')
      const mdPath = opts.scope === 'shared' ? `shared/docs/${stem}.md` : `docs/${stem}.md`
      await ws.writeFile(mdPath, docxExtractMarkdown(safe, text))
      extractPath = mdPath
    } catch {
      // 抽取失败不阻断原件落盘
    }
  }

  return { path: file, name: safe, ...(extractPath ? { extractPath } : {}) }
}
