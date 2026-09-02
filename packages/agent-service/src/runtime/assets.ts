/**
 * [INPUT]: FsWorkspace.glob/readFile/readBytes
 * [OUTPUT]: listWorkspaceAssets / readWorkspaceAsset / readWorkspaceAssetBytes / isWorkspaceSurfacePath / WorkspaceAsset
 * [POS]: runtime/ 工作区展示面。目录即声明:只收根级交付 + notes/papers/drafts/docs/uploads/images
 *        + 根级 *.skill + 一层 <name>/SKILL.md(会话里刚写的 skill 包);
 *        任意深度排除 cache/ 段与 workers/scratch/library/Library 前缀、drafts/todo.md、search-*。
 *        无 taskId 仅 shared/;有 taskId = shared + 会话。分类函数签名不变。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { FsWorkspace } from '../workspace/fs-workspace.ts'

/** 侧栏要显示的"会话资产":论文 PDF / 文档 / 图片 / 其它上传件 */
export interface WorkspaceAsset {
  path: string
  kind: 'pdf' | 'doc' | 'html' | 'image' | 'file'
  name: string
  /** shared = 项目共享区;session = 当前会话(默认) */
  scope?: 'shared' | 'session'
}

const SURFACE_DIRS = new Set(['notes', 'papers', 'drafts', 'docs', 'uploads', 'images'])
const ROOT_DELIVERY_EXT = new Set(['md', 'pdf', 'html', 'htm', 'png', 'jpg', 'jpeg', 'webp', 'gif'])
const HIDDEN_PREFIX = new Set(['workers', 'scratch', 'library', 'Library'])

function extOf(p: string): string {
  return (p.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
}

/** 剥 shared/ 后再判。images/ 是上传落点(brief 漏写,taxonomy 已有)。 */
export function isWorkspaceSurfacePath(virtualPath: string): boolean {
  const n = virtualPath.replace(/\\/g, '/').replace(/^\.\//, '')
  const rel = n.startsWith('shared/') ? n.slice('shared/'.length) : n
  if (!rel || rel.endsWith('/')) return false
  const segs = rel.split('/').filter(Boolean)
  if (segs.includes('cache')) return false
  if (HIDDEN_PREFIX.has(segs[0] ?? '')) return false
  if (rel === 'drafts/todo.md') return false
  if (segs.some((s) => s.startsWith('search-'))) return false
  if (segs.length === 1) {
    const ext = extOf(rel)
    return ROOT_DELIVERY_EXT.has(ext) || ext === 'skill'
  }
  if (segs.length === 2 && segs[1] === 'SKILL.md') return true
  return SURFACE_DIRS.has(segs[0] ?? '')
}

function classifyAssets(paths: string[], scope: 'shared' | 'session'): WorkspaceAsset[] {
  const base = (p: string): string => p.split('/').pop() ?? p
  const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif']
  const inDocs = (p: string): boolean => p.startsWith('docs/') || p.includes('/docs/')
  const assets: WorkspaceAsset[] = []
  for (const p of paths) {
    const ext = extOf(p)
    if (ext === 'pdf') assets.push({ path: p, kind: 'pdf', name: base(p), scope })
    else if (ext === 'md') {
      if (!/(^|\/)search-/.test(p)) assets.push({ path: p, kind: 'doc', name: base(p), scope })
    }
    else if (ext === 'html' || ext === 'htm') assets.push({ path: p, kind: 'html', name: base(p), scope })
    else if (ext === 'skill') assets.push({ path: p, kind: 'file', name: base(p), scope })
    else if (inDocs(p)) assets.push({ path: p, kind: 'doc', name: base(p), scope })
    else if (IMAGE_EXT.includes(ext)) assets.push({ path: p, kind: 'image', name: base(p), scope })
    else if (p.includes('uploads/')) assets.push({ path: p, kind: 'file', name: base(p), scope })
  }
  return assets
}

export async function listWorkspaceAssets(opts: {
  taskId?: string
  projectRoot: FsWorkspace
  session?: FsWorkspace
}): Promise<WorkspaceAsset[]> {
  const sharedRaw = (await opts.projectRoot.glob('shared/**/*').catch(() => [] as string[]))
    .filter(isWorkspaceSurfacePath)
  const shared = classifyAssets(sharedRaw, 'shared')
  if (!opts.taskId || !opts.session) return shared
  const sessionRaw = (await opts.session.glob('**/*').catch(() => [] as string[]))
    .filter((p) => !p.startsWith('shared/') && isWorkspaceSurfacePath(p))
  return [...shared, ...classifyAssets(sessionRaw, 'session')]
}

export async function readWorkspaceAsset(ws: FsWorkspace, path: string): Promise<string | null> {
  try {
    return await ws.readFile(path)
  } catch {
    return null
  }
}

export async function readWorkspaceAssetBytes(ws: FsWorkspace, path: string): Promise<Uint8Array | null> {
  try {
    return await ws.readBytes(path)
  } catch {
    return null
  }
}
