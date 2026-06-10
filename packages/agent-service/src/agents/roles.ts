/**
 * [INPUT]: core 的 Tool/RoleDef/ModelPort
 * [OUTPUT]: WORKER_ROLE_SPECS / buildRoles —— worker 角色定义与受限工具装配
 * [POS]: §6 Agent Graph。worker 是 runAgent 的递归调用；受限来自"只注册子集工具"，工程层硬约束
 *
 * 主 agent 配齐全部工具、自己能干活；spawn 只是可选的扇出/隔离手段。
 */
import type { Tool } from '../core/tool.ts'
import type { RoleDef } from '../core/spawn.ts'
import type { ModelPort } from '../core/model-port.ts'

export interface RoleSpec {
  name: string
  systemPrompt: string
  allowedTools: string[]
  maxSteps: number
}

export const WORKER_ROLE_SPECS: RoleSpec[] = [
  {
    name: 'searcher',
    systemPrompt:
      '你是检索 worker。用研究工具按 scope 找论文/网页，把要点写进工作区文件，最后用一段结构化文本回报（Scope / 命中 / 备注）。只回报结论，不回报过程。',
    allowedTools: ['search_papers', 'search_web', 'get_citations', 'read_file', 'write_file', 'grep', 'glob'],
    maxSteps: 8,
  },
  {
    name: 'reader',
    systemPrompt:
      '你是精读 worker。读取指定论文/链接的正文，产出结构化笔记写入工作区，回报一段摘要（要点 / 方法 / 局限）。',
    allowedTools: ['read_file', 'fetch_paper', 'extract_pdf', 'write_file', 'grep'],
    maxSteps: 8,
  },
  {
    name: 'verifier',
    systemPrompt:
      '你是校验 worker。针对给定主张找原始证据或反例，回报判断（成立 / 存疑 / 反驳 + 依据）。默认怀疑。',
    allowedTools: ['search_papers', 'get_citations', 'read_file', 'grep'],
    maxSteps: 6,
  },
]

export function buildRoles(allTools: Tool[], options: { model?: ModelPort; maxDepth?: number } = {}): Record<string, RoleDef> {
  const byName = new Map(allTools.map((tool) => [tool.spec.name, tool]))
  const maxDepth = options.maxDepth ?? 3
  const roles: Record<string, RoleDef> = {}
  for (const spec of WORKER_ROLE_SPECS) {
    const tools = spec.allowedTools.map((name) => byName.get(name)).filter((t): t is Tool => Boolean(t))
    roles[spec.name] = {
      systemPrompt: spec.systemPrompt,
      tools,
      limits: { maxSteps: spec.maxSteps, maxDepth },
      ...(options.model ? { model: options.model } : {}),
    }
  }
  return roles
}
