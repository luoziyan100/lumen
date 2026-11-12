/**
 * [INPUT]: 显式数据根、受信主题身份、Mastra 原生本地文件系统
 * [OUTPUT]: topicWorkspace/memoryFilesystem/MemoryScope：主题可写工作区与两层事实记忆的独立文件边界
 * [POS]: 同一主题的所有对话共用 topics/<id>/work；记忆分「这个主题」与「关于用户」两个根，各自 contained，禁止软链扩权
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { LocalFilesystem, Workspace } from '@mastra/core/workspace'

export type MemoryScope = 'topic' | 'you'

export async function memoryFilesystem(root: string, scope: MemoryScope, topicId: string) {
  const basePath = scope === 'you' ? join(root, 'memory') : join(root, 'topics', topicId, 'memory')
  await mkdir(basePath, { recursive: true, mode: 0o700 })
  const filesystem = new LocalFilesystem({ basePath, contained: true })
  await filesystem.init()
  return filesystem
}

export async function topicWorkspace(root: string, topicId: string): Promise<Workspace> {
  const basePath = join(root, 'topics', topicId, 'work')
  await mkdir(basePath, { recursive: true, mode: 0o700 })
  return new Workspace({
    id: `workspace-topic-${topicId}`,
    filesystem: new LocalFilesystem({ basePath, contained: true }),
    tools: { enabled: false,
      mastra_workspace_read_file: { enabled: true, name: 'read_file' },
      mastra_workspace_write_file: { enabled: true, name: 'write_file' },
      mastra_workspace_list_files: { enabled: true, name: 'list_files' },
      mastra_workspace_edit_file: { enabled: true, name: 'edit_file' },
      mastra_workspace_grep: { enabled: true, name: 'grep' },
    },
  })
}
