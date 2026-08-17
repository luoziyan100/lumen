/**
 * [INPUT]: FsWorkspace;project-store.ensureProjectDirs;sanitizeWorkspaceId
 * [OUTPUT]: makeProjectRootWorkspace / makeSessionWorkspace / workspaceForAssetPath
 * [POS]: runtime/ 工作区定根。带 taskId = sessions/<tid>(只读挂 shared/);不带 = 项目根。
 *        从 agent-runtime 切出以满足单文件 ≤800;定根语义不变。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { ensureProjectDirs } from '../storage/project-store.ts'
import { sanitizeWorkspaceId } from '../storage/workspace-id.ts'
import { FsWorkspace } from '../workspace/fs-workspace.ts'

export interface WorkspaceFactoryDeps {
  workspacesDir: string
  libraryRoot?: string
  sourcePath: (projectId: string) => string | undefined
}

/** 项目根工作区(shared/ 写入、无会话时的资产查询) */
export function makeProjectRootWorkspace(deps: WorkspaceFactoryDeps, projectId: string): FsWorkspace {
  const pid = sanitizeWorkspaceId(projectId)
  ensureProjectDirs(deps.workspacesDir, pid)
  return new FsWorkspace({
    root: `${deps.workspacesDir}/${pid}`,
    libraryRoot: deps.libraryRoot,
  })
}

/** 带 taskId = 会话独立目录;不带 = 项目根(兼容旧语义/旧数据) */
export function makeSessionWorkspace(deps: WorkspaceFactoryDeps, projectId: string, taskId?: string): FsWorkspace {
  const pid = sanitizeWorkspaceId(projectId)
  const tid = taskId ? sanitizeWorkspaceId(taskId) : undefined
  if (!tid) return makeProjectRootWorkspace(deps, pid)
  ensureProjectDirs(deps.workspacesDir, pid)
  const sharedRoot = `${deps.workspacesDir}/${pid}/shared`
  const source = deps.sourcePath(pid)
  const libraryRoot = (source && source.trim()) || deps.libraryRoot
  return new FsWorkspace({
    root: `${deps.workspacesDir}/${pid}/sessions/${tid}`,
    libraryRoot,
    sharedRoot,
  })
}

/** shared/* 走项目根;其余走会话(或项目根)工作区 */
export function workspaceForAssetPath(
  deps: WorkspaceFactoryDeps,
  projectId: string,
  assetPath: string,
  taskId?: string,
): FsWorkspace {
  if (assetPath.startsWith('shared/')) return makeProjectRootWorkspace(deps, projectId)
  return makeSessionWorkspace(deps, projectId, taskId)
}
