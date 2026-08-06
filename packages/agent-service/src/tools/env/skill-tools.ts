/**
 * [INPUT]: core 的 Tool;skills 的 activateSkill / SkillPackage
 * [OUTPUT]: createSkillTools —— run_skill(启动工作流,非读记忆)
 * [POS]: §环境工具旁支;由 runtime 按项目注入,不在 ENV_TOOLS 常量里
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Tool, ToolResult } from '../../core/tool.ts'
import { activateSkill } from '../../skills/discovery.ts'
import type { SkillPackage } from '../../skills/types.ts'

export function createSkillTools(skills: SkillPackage[]): Tool[] {
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
  return [runSkill]
}
