/**
 * [INPUT]: 旧内建六类专家的职责与当前已实现原生工具名
 * [OUTPUT]: SPECIALIST_ROLES / SpecialistRole / BuiltinSpecialistId / SpecialistId
 * [POS]: 专家能力白名单真源；写作与计算由 general-purpose 承担，不增加平行调度概念
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const referenceTools = ['list_skills', 'run_skill', 'read_skill_file', 'read_memory', 'list_project_files', 'read_project_file']
const researchTools = ['search_papers', 'get_citations', 'search_web', 'fetch_url', 'extract_pdf']
const localTools = ['read_file', 'list_files', 'grep', 'extract_docx', 'look_at_image']
const writableTools = ['write_file', 'edit_file', 'copy_project_file', 'list_task_files', 'read_task_file', 'copy_task_file']

export const SPECIALIST_ROLES = [
  { id: 'reader', name: '论文阅读专家', writable: false, execute: false, maxSteps: 12,
    description: '只读精读论文正文，分析方法、论证与局限，向主研究者返回可核对证据。',
    instructions: '只读材料，返回有出处的分析，不修改任何文件。检查正文与后半部分，区分作者主张、观察和你的判断。回报要点、方法、局限与页码或章节。',
    tools: [...localTools, ...referenceTools, 'search_papers', 'get_citations', 'fetch_url', 'extract_pdf'] },
  { id: 'searcher', name: '文献检索专家', writable: true, execute: false, maxSteps: 8,
    description: '按明确范围检索论文和网页，在独立目录记录候选材料、原始出处与筛选依据。',
    instructions: '围绕给定研究范围检索原始来源，交叉核对题名、作者和链接；记录命中、排除依据及未解决空白。只把已检索到的事实写入笔记。',
    tools: [...localTools, ...referenceTools, ...researchTools, ...writableTools] },
  { id: 'verifier', name: '证据审阅专家', writable: false, execute: false, maxSteps: 6,
    description: '审阅主张与报告，寻找原始证据、反例、引用错误和证据缺口；只读返回判定。',
    instructions: '默认保持怀疑，对每项主张返回成立、存疑或反驳，并附原始证据。检查断章取义、方法限制和引用是否支持结论；不修改被审阅产物。',
    tools: [...localTools, ...referenceTools, ...researchTools] },
  { id: 'explore', name: '材料勘察专家', writable: false, execute: false, maxSteps: 12,
    description: '快速只读勘察工作区与参考资料，定位相关文件、结构和已有事实。',
    instructions: '用读取、列举、文本搜索和资料检索建立事实地图，返回相关文件、结构与待核实事项；不执行代码，不写文件。',
    tools: [...localTools, ...referenceTools, ...researchTools] },
  { id: 'plan', name: '研究规划专家', writable: false, execute: false, maxSteps: 10,
    description: '只读拆解研究范围、依赖、执行步骤和完成标准，供主研究者维护任务清单。',
    instructions: '基于已有材料提出可执行研究计划，列出依赖、需要的证据、可并行工作与完成标准。不操作主任务清单，不写业务文件或执行代码。',
    tools: [...localTools, ...referenceTools, ...researchTools] },
  { id: 'general-purpose', name: '研究执行专家', writable: true, execute: true, maxSteps: 24,
    description: '在独立目录完成多步分析、代码计算、笔记与报告草稿；回报可审阅产物与限制。',
    instructions: '在给定范围内完成分析、计算或写作，用工具验证可验证的结论。报告草稿只引用已读证据；执行失败如实处理。完成后返回结论、实际文件路径与剩余限制，不扩大任务范围。',
    tools: [...localTools, ...referenceTools, ...researchTools, ...writableTools, 'run_code'] },
] as const

export type BuiltinSpecialistId = typeof SPECIALIST_ROLES[number]['id']
export type SpecialistId = string
export interface SpecialistRole {
  id: SpecialistId
  name: string
  writable: boolean
  execute: boolean
  maxSteps: number
  description: string
  instructions: string
  tools: readonly string[]
}
