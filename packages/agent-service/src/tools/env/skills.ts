/**
 * [INPUT]: core 的 Tool;skills 的 activateSkill / SkillPackage;可选安装回调
 * [OUTPUT]: createSkillTools —— run_skill(启动工作流) + install_skill(会话包装进发现根)
 * [POS]: §环境工具旁支;由 runtime 按项目注入,不在 ENV_TOOLS 常量里
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Tool, ToolContext, ToolResult } from '../../core/tool.ts'
import { activateSkill } from '../../skills/discovery.ts'
import type { InstallScope } from '../../skills/install.ts'
import type { SkillPackage } from '../../skills/types.ts'

export type InstallSkillFn = (scope: InstallScope, absPath: string) => { name: string; layer: string; baseDir: string }

export function createSkillTools(skills: SkillPackage[], installSkill?: InstallSkillFn): Tool[] {
  const runSkill: Tool = {
    spec: {
      name: 'run_skill',
      description:
        '启动一个可运行的 Skill 工作流(不是读记忆)。系统提示词「可运行的 Skills」列出了 name;' +
        '匹配当前任务时调用本工具,返回 playbook 后按步骤执行;' +
        '包内脚本用 run_code 在沙箱中跑,产物写入工作区。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill 名(目录名 / frontmatter name)' },
          args: { type: 'string', description: '可选参数,替换 playbook 中 $ARGUMENTS / $0…' },
        },
        required: ['name'],
      },
    },
    run: async (args): Promise<ToolResult> => {
      const name = String((args as { name?: unknown }).name ?? '')
      const skillArgs = (args as { args?: unknown }).args
      const argStr = skillArgs == null ? undefined : String(skillArgs)
      const result = activateSkill(skills, name, argStr)
      return { llmContent: result.llmContent, data: result.ok ? { skill: result.pkg.name, baseDir: result.pkg.baseDir } : { error: true } }
    },
  }

  const install: Tool = {
    spec: {
      name: 'install_skill',
      description:
        '把工作区里刚写好的 Skill 包装进可发现目录(全局 user 或本项目 project)。' +
        'path 必须是工作区相对路径:含 SKILL.md 的文件夹,或单个 SKILL.md。' +
        '用户说「做成 skill 并安装」时:先 write/edit 包,再调本工具。不要说没有安装权限,也不要甩 sandbox: 链接。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '工作区相对路径,如 prompt-graph 或 prompt-graph/SKILL.md' },
          scope: { type: 'string', enum: ['user', 'project'], description: '默认 user(全局 ~/.lumen/skills)' },
        },
        required: ['path'],
      },
    },
    run: async (args, ctx: ToolContext): Promise<ToolResult> => {
      if (!installSkill) return { llmContent: 'error: 当前运行时未注入 install_skill' }
      const rel = String((args as { path?: unknown }).path ?? '').trim()
      if (!rel) return { llmContent: 'error: 缺少 path(工作区相对路径)' }
      const scopeRaw = String((args as { scope?: unknown }).scope ?? 'user')
      const scope: InstallScope = scopeRaw === 'project' ? 'project' : 'user'
      const ws = ctx.workspace
      if (!ws?.resolvePath) return { llmContent: 'error: workspace 未注入,无法解析安装路径' }
      try {
        const abs = await ws.resolvePath(rel)
        const r = installSkill(scope, abs)
        return {
          llmContent:
            `Skill installed: ${r.name} (${r.layer})\n` +
            `Destination: ${r.baseDir}\n` +
            `下一回合目录会刷新;用户可用 /${r.name} 启动。`,
          data: { name: r.name, layer: r.layer, baseDir: r.baseDir, scope },
        }
      } catch (error) {
        return { llmContent: `error: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  }

  return [runSkill, install]
}
