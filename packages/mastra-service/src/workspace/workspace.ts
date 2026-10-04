/**
 * [INPUT]: 显式数据根、固定项目/任务身份、Mastra 原生本地文件系统
 * [OUTPUT]: taskWorkspace/projectFilesystem：任务与项目范围的独立文件边界
 * [POS]: 任务根保持相对路径；项目范围经显式工具/API访问，禁止软链扩权
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { LocalFilesystem, Workspace } from '@mastra/core/workspace'
import { sourcePath } from './source.ts'

export type ProjectFileScope = 'shared' | 'memory' | 'source'
export async function projectFilesystem(root: string, projectId: string, scope: ProjectFileScope, readOnly = false) {
  const project = join(root, 'projects', projectId)
  const basePath = scope === 'source' ? await sourcePath(project) : join(project, scope)
  if (scope !== 'source') await mkdir(basePath, { recursive: true, mode: 0o700 })
  const filesystem = new LocalFilesystem({ basePath, contained: true, readOnly: scope === 'source' || readOnly })
  await filesystem.init()
  return filesystem
}

export async function taskWorkspace(root: string, projectId: string, taskId: string, readOnly = false): Promise<Workspace> {
  const project = join(root, 'projects', projectId)
  return new Workspace({
    id: `workspace-${projectId}-${taskId}-${readOnly ? 'reader' : 'owner'}`,
    filesystem: new LocalFilesystem({ basePath: join(project, 'tasks', taskId), contained: true, readOnly }),
    tools: { enabled: false,
      mastra_workspace_read_file: { enabled: true, name: 'read_file' },
      mastra_workspace_write_file: { enabled: !readOnly, name: 'write_file' },
      mastra_workspace_list_files: { enabled: true, name: 'list_files' },
      mastra_workspace_edit_file: { enabled: !readOnly, name: 'edit_file' },
      mastra_workspace_grep: { enabled: true, name: 'grep' },
    },
  })
}
