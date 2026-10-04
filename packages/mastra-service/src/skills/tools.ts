/**
 * [INPUT]: Mastra createTool 与请求上下文；应用提供的当前任务 SkillRegistry
 * [OUTPUT]: createSkillTools：list_skills/run_skill/read_skill_file/install_skill
 * [POS]: 原生工具适配面；动态解析 registry 隔离任务，不复制产品逻辑或会话状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createTool } from '@mastra/core/tools'
import type { ToolExecutionContext } from '@mastra/core/tools'
import { z } from 'zod'
import type { SkillRegistry } from './registry.ts'

export type SkillRegistryResolver = (context: ToolExecutionContext | undefined) => SkillRegistry | Promise<SkillRegistry>

export function createSkillTools(resolveRegistry: SkillRegistryResolver) {
  return {
    list_skills: createTool({
      id: 'list_skills', description: '列出当前项目可运行的技能工作流。技能安装后目录立即刷新。',
      inputSchema: z.object({}),
      execute: async (_, context) => ({ skills: (await (await resolveRegistry(context)).list()).filter(skill => !skill.disableModelInvocation) }),
    }),
    run_skill: createTool({
      id: 'run_skill', description: '显式启动技能，返回工作流正文并替换参数；按照正文执行。该工具本身不执行包内脚本。',
      inputSchema: z.object({ name: z.string().min(1).max(128), args: z.string().max(20_000).optional() }),
      execute: async ({ name, args }, context) => (await resolveRegistry(context)).activate(name, args),
    }),
    read_skill_file: createTool({
      id: 'read_skill_file', description: '读取某个技能包内的脚本或参考文本。path 必须相对技能根；仅允许读取包内文件。',
      inputSchema: z.object({ name: z.string().min(1).max(128), path: z.string().min(1).max(4096) }),
      execute: async ({ name, path }, context) => (await resolveRegistry(context)).readFile(name, path),
    }),
    install_skill: createTool({
      id: 'install_skill', description: '将当前任务工作区里的技能目录或 Markdown 技能文件安装到用户或项目技能目录。安装后立即可用。',
      inputSchema: z.object({ path: z.string().min(1).max(4096), scope: z.enum(['user', 'project']).default('user') }),
      execute: async (input, context) => (await resolveRegistry(context)).install(input),
    }),
  }
}
