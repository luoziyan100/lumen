/**
 * [INPUT]: env / research 各单元工厂、withGuard;任务域依赖(memoryDir / skills / waiter / coordinator)
 * [OUTPUT]: buildStaticTools / buildTaskTools —— 工具存在性唯一真源
 * [POS]: tools/ 的目录。service 与 runtime.execute 只调用这里,不再各自拼装。
 *        withResultPersist / 旧 spawnTool 是可用性装饰,留在 runtime。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 全量工具名(模型能干什么,读完本文件即可):
 *   静态(进程启动一次,withGuard):
 *     read_file write_file edit_file list_dir grep glob
 *     todo_write update_plan
 *     look_at_image
 *     search_web fetch_url search_papers get_citations extract_pdf
 *     run_code          ← 非 demo;空 skill 根,供 roles/child 占位;主任务由任务域重绑
 *   任务域(每次 execute,ask_user 不套 withGuard):
 *     read_memory write_memory
 *     run_skill
 *     ask_user
 *     spawn_subagent get_subagent_output kill_subagent wait_subagents
 *     run_code          ← 非 demo;构造时喂 skillReadRoots
 */
import type { Tool } from '../core/tool.ts'
import { withGuard } from '../core/guard.ts'
import { ENV_TOOLS } from './env/fs/index.ts'
import { createTodoTools } from './env/todo.ts'
import { createRunCodeTool } from './env/run-code/index.ts'
import { createMemoryTools } from './env/memory.ts'
import { createSkillTools } from './env/skills.ts'
import { createAskUserTools, type AskUserWaiter } from './env/ask-user.ts'
import { createSubagentTools } from './env/subagent.ts'
import { fetchHttp, type HttpClient } from './research/http.ts'
import { createPaperTools } from './research/papers.ts'
import { createFetchUrlTool } from './research/fetch-url.ts'
import { createSearchWebTool, createTavilyWebSearch } from './research/search-web.ts'
import { createPdfTools, type PdfTextEngine } from './research/pdf.ts'
import type { SkillPackage } from '../skills/index.ts'
import type { SubagentCoordinator } from '../subagent/coordinator.ts'
import type { ChildRunner } from '../subagent/runner.ts'

export interface StaticToolsOptions {
  demo: boolean
  lookAtImage: Tool
  tavilyKey?: string
  pdfEngine?: PdfTextEngine
  http?: HttpClient
}

export interface TaskToolDeps {
  memoryDir: string
  skills: SkillPackage[]
  skillReadRoots: string[]
  askUser: AskUserWaiter
  subagents: SubagentCoordinator
  childRunner: ChildRunner
  demo: boolean
}

/** 进程启动构造一次。demo 剔除 run_code(云上无 Seatbelt=RCE)。 */
export function buildStaticTools(opts: StaticToolsOptions): Tool[] {
  const http = opts.http ?? fetchHttp()
  const raw: Tool[] = [
    ...ENV_TOOLS,
    ...createTodoTools(),
    ...createPaperTools({ http }),
    createFetchUrlTool({ http }),
    createSearchWebTool({
      webSearch: opts.tavilyKey ? createTavilyWebSearch({ apiKey: opts.tavilyKey, http }) : undefined,
    }),
    ...createPdfTools({ engine: opts.pdfEngine, http }),
    opts.lookAtImage,
  ]
  if (!opts.demo) raw.push(createRunCodeTool({ skillReadRoots: [] }))
  return raw.map((t) => withGuard(t))
}

/** 每次 execute 按任务构造。ask_user 不套 150s guard。 */
export function buildTaskTools(deps: TaskToolDeps): Tool[] {
  const out: Tool[] = [
    ...createMemoryTools(deps.memoryDir),
    ...createSkillTools(deps.skills),
    ...createAskUserTools({ waiter: deps.askUser }),
    ...createSubagentTools({ subagents: deps.subagents, childRunner: deps.childRunner }),
  ]
  if (!deps.demo) {
    out.push(withGuard(createRunCodeTool({ skillReadRoots: deps.skillReadRoots })))
  }
  return out
}

/** 同名以任务域为准(主路径用带 skill 根的 run_code,不用静态占位)。 */
export function mergeToolUniverse(staticTools: Tool[], taskTools: Tool[]): Tool[] {
  const taskNames = new Set(taskTools.map((t) => t.spec.name))
  return [...staticTools.filter((t) => !taskNames.has(t.spec.name)), ...taskTools]
}
