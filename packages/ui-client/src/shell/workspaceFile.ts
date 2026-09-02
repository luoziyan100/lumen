/**
 * [INPUT]: 项目/会话 id + 工作区相对路径;与 runtime/workspace-factory 定根同构
 * [OUTPUT]: sanitizeWorkspaceId / resolveWorkspaceAbsPath / readerCanCopy / readerCopyText
 * [POS]: shell/ 阅读器打开本地文件的路径合同;Tauri open_workspace_file 必须同构,禁各写一套
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export function sanitizeWorkspaceId(id: string): string {
  const clean = (id ?? '').replace(/[^\w-]/g, '_').slice(0, 64)
  return clean || 'default'
}

function isSafeRelPath(relPath: string): boolean {
  const n = relPath.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!n || n.startsWith('/') || n.includes('\0') || n.includes('..')) return false
  return true
}

/** `lumenRoot` = `~/.lumen`。shared/* 走项目根,其余走 sessions/<tid>。 */
export function resolveWorkspaceAbsPath(
  lumenRoot: string,
  projectId: string,
  relPath: string,
  taskId?: string | null,
): string | null {
  if (!isSafeRelPath(relPath)) return null
  const pid = sanitizeWorkspaceId(projectId)
  const n = relPath.replace(/\\/g, '/').replace(/^\.\//, '')
  const base = n.startsWith('shared/') || !taskId
    ? `${lumenRoot}/workspaces/${pid}`
    : `${lumenRoot}/workspaces/${pid}/sessions/${sanitizeWorkspaceId(taskId)}`
  return `${base}/${n}`
}

export function readerCanCopy(kind: 'pdf' | 'doc' | 'html'): boolean {
  return kind === 'doc' || kind === 'html'
}

export function readerCopyText(kind: 'pdf' | 'doc' | 'html', content?: string): string | null {
  if (!readerCanCopy(kind)) return null
  return content ?? ''
}
