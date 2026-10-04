/**
 * [INPUT]: 原生委派身份、角色工具白名单与应用解析的父任务 contained LocalFilesystem
 * [OUTPUT]: createSpecialistWorkspaces / specialistDirectory：每次委派的文件权限边界，受信继续操作复用原独立目录
 * [POS]: 只管理 Workspace 生命周期，不登记/调度子任务；身份只取受信 Controller 和原生 run/toolCall
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { LocalFilesystem, Workspace } from '@mastra/core/workspace'
import type { DelegationStartContext } from '@mastra/core/agent'
import type { AgentControllerRequestContext } from '@mastra/core/agent-controller'
import type { RequestContext } from '@mastra/core/request-context'
import type { SpecialistRole, SpecialistId } from './roles.ts'

export type TaskFilesystemResolver = (resourceId: string) => LocalFilesystem | Promise<LocalFilesystem>
interface SpecialistScope { resourceId: string; role: SpecialistId; directory: string }
const SCOPE_KEY = 'lumen.specialist'

export function specialistDirectory(role: SpecialistId, runId: string, toolCallId: string): string {
  return `workers/${role}-${createHash('sha256').update(JSON.stringify([runId, toolCallId])).digest('hex').slice(0, 24)}`
}

export function createSpecialistWorkspaces(resolveTask: TaskFilesystemResolver) {
  const workspaces = new Map<string, Promise<Workspace>>()
  const sources = new Map<string, Promise<LocalFilesystem>>()
  const scopeFor = (requestContext: RequestContext, role?: SpecialistId) => {
    const scope = requestContext.get<typeof SCOPE_KEY, SpecialistScope>(SCOPE_KEY)
    const owner = requestContext.get<'controller', AgentControllerRequestContext>('controller')
    if (!scope || scope.resourceId !== owner?.resourceId || (role && role !== scope.role)) throw new Error('Specialist delegation scope is required')
    return scope
  }
  const parent = async (requestContext: RequestContext) => {
    const { resourceId } = scopeFor(requestContext)
    let pending = sources.get(resourceId)
    if (!pending) {
      pending = (async () => {
        const filesystem = await resolveTask(resourceId)
        if (!filesystem.contained) throw new Error('Parent task filesystem must be contained')
        const source = new LocalFilesystem({ basePath: filesystem.basePath, contained: true, readOnly: true })
        await source.init()
        return source
      })()
      sources.set(resourceId, pending)
      void pending.catch(() => sources.delete(resourceId))
    }
    return pending
  }
  const resolve = async (requestContext: RequestContext, role: SpecialistRole) => {
    const scope = scopeFor(requestContext, role.id)
    const key = `${scope.resourceId}:${role.id}:${role.writable ? scope.directory : 'read'}`
    let pending = workspaces.get(key)
    if (!pending) {
      pending = (async () => {
        const filesystem = await resolveTask(scope.resourceId)
        if (!filesystem.contained) throw new Error('Parent task filesystem must be contained')
        if (role.writable) await filesystem.mkdir(scope.directory, { recursive: true })
        return new Workspace({ id: `specialist-${key}`, filesystem: new LocalFilesystem({
          basePath: role.writable ? join(filesystem.basePath, scope.directory) : filesystem.basePath, contained: true, readOnly: !role.writable,
        }), tools: { enabled: false,
          mastra_workspace_read_file: { enabled: role.tools.includes('read_file'), name: 'read_file' },
          mastra_workspace_list_files: { enabled: role.tools.includes('list_files'), name: 'list_files' },
          mastra_workspace_grep: { enabled: role.tools.includes('grep'), name: 'grep' },
          mastra_workspace_write_file: { enabled: role.writable && role.tools.includes('write_file'), name: 'write_file' },
          mastra_workspace_edit_file: { enabled: role.writable && role.tools.includes('edit_file'), name: 'edit_file' },
        } })
      })()
      workspaces.set(key, pending)
      void pending.catch(() => workspaces.delete(key))
    }
    return pending
  }
  return {
    resolve, parent,
    async bind(context: DelegationStartContext, role: SpecialistRole, continuedDirectory?: string) {
      const owner = context.requestContext.get<'controller', AgentControllerRequestContext>('controller')
      if (!owner?.resourceId || owner.resourceId !== context.resourceId) throw new Error('Trusted parent task is required for delegation')
      const directory = continuedDirectory ?? specialistDirectory(role.id, context.runId, context.toolCallId)
      context.requestContext.set(SCOPE_KEY, { resourceId: owner.resourceId, role: role.id, directory } satisfies SpecialistScope)
      await resolve(context.requestContext, role)
      return directory
    },
    async close() {
      const pending = await Promise.allSettled([...workspaces.values(), ...sources.values()])
      await Promise.all(pending.flatMap(item => item.status === 'fulfilled' ? [item.value.destroy()] : []))
      workspaces.clear(); sources.clear()
    },
  }
}
