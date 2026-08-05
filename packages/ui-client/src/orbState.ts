/**
 * [INPUT]: ProcessRow / ThinkingIndicator 的工具名或等待态
 * [OUTPUT]: orbStateFromTool / orbStateFromSteps —— 映射 thinking-orbs 九态
 * [POS]: 对话过程指示器状态表;与 VERB 工具名同族,只负责视觉态不负责文案
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { OrbState } from 'thinking-orbs'

/** 检索/扫描 → searching(子午线扫球) */
const SEARCHING = new Set([
  'search_papers',
  'openalex_search',
  'search_web',
  'web_search',
  'grep',
  'glob',
  'get_citations',
])

/** 写盘 / 写记忆 → composing(缎带) */
const COMPOSING = new Set(['write_file', 'edit_file', 'write_memory'])

/** 抓取/抽 PDF → weaving(三股辫) */
const WEAVING = new Set(['fetch_url', 'read_url', 'extract_pdf'])

/** 读盘/列目录 → working(轨道粒子) */
const WORKING = new Set(['read_file', 'list_files', 'list_dir'])

/** 读记忆 / 拉上下文 → connecting(星座连线) */
const CONNECTING = new Set(['read_memory'])

/** 感知输入 → listening(纬波) */
const LISTENING = new Set(['ask_user', 'look_at_image'])

/**
 * 把 agent tool 名映到 thinking-orbs 九态之一。
 * 未知工具落 working;空串同 default。
 */
export function orbStateFromTool(name: string): OrbState {
  const n = name.trim()
  if (!n) return 'working'
  if (SEARCHING.has(n)) return 'searching'
  if (n === 'run_code') return 'solving'
  if (LISTENING.has(n)) return 'listening'
  if (COMPOSING.has(n)) return 'composing'
  if (WEAVING.has(n)) return 'weaving'
  if (CONNECTING.has(n)) return 'connecting'
  if (WORKING.has(n)) return 'working'
  return 'working'
}

/** 焦点步:最后一个未完成;全完成则取末步 */
export function orbStateFromSteps(steps: ReadonlyArray<{ name: string; done: boolean }>): OrbState {
  if (steps.length === 0) return 'working'
  for (let i = steps.length - 1; i >= 0; i--) {
    if (!steps[i].done) return orbStateFromTool(steps[i].name)
  }
  return orbStateFromTool(steps[steps.length - 1].name)
}

/** 尚无 tool_call 的模型等待态(与过程块工具态分离:环 vs 轨道/扫描/…) */
export const ORB_THINKING: OrbState = 'breathing'
