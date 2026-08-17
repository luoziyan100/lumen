/**
 * [INPUT]: FsWorkspace.glob/readFile/readBytes
 * [OUTPUT]: listWorkspaceAssets / readWorkspaceAsset / readWorkspaceAssetBytes / WorkspaceAsset
 * [POS]: runtime/ 资产视图。无 taskId 仅 shared/;有 taskId = shared + 会话(滤 cache/)。
 *        从 agent-runtime 切出以满足单文件 ≤800;查询语义不变。
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

function classifyAssets(paths: string[], scope: 'shared' | 'session'): WorkspaceAsset[] {
  const base = (p: string): string => p.split('/').pop() ?? p
  const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif']
  const inDocs = (p: string): boolean => p.startsWith('docs/') || p.includes('/docs/')
  const assets: WorkspaceAsset[] = []
  for (const p of paths) {
    const ext = (p.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
    if (ext === 'pdf') assets.push({ path: p, kind: 'pdf', name: base(p), scope })
    else if (ext === 'md') {
      if (!/(^|\/)search-/.test(p)) assets.push({ path: p, kind: 'doc', name: base(p), scope })
    }
    else if (ext === 'html' || ext === 'htm') assets.push({ path: p, kind: 'html', name: base(p), scope })
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
  const shared = classifyAssets(sharedRaw, 'shared')
  if (!opts.taskId || !opts.session) return shared
  const sessionRaw = (await opts.session.glob('**/*').catch(() => [] as string[]))
    .filter((p) => !p.startsWith('cache/') && !p.startsWith('shared/'))
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
