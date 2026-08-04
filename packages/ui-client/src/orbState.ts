/**
 * [INPUT]: ProcessRow / ThinkingIndicator 的工具名或等待态
 * [OUTPUT]: orbStateFromTool —— 映射 thinking-orbs 的 OrbState
 * [POS]: 对话过程指示器状态表;与 VERB 工具名同族,只负责视觉态不负责文案
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { OrbState } from 'thinking-orbs'

/** 检索类工具 → 扫描球 */
const SEARCHING = new Set([
  'search_papers',
  'openalex_search',
  'search_web',
  'web_search',
  'grep',
])

/** 写盘 → 编织/起草感 */
const COMPOSING = new Set(['write_file', 'edit_file'])

/** 抓取/抽 PDF → 编织 */
const WEAVING = new Set(['fetch_url', 'read_url', 'extract_pdf'])

/** 读盘/列目录 → 通用工作轨 */
const WORKING = new Set(['read_file', 'list_files', 'list_dir', 'glob'])

/**
 * 把 agent tool 名映到 thinking-orbs 九态之一。
 * 未知工具落 working;空串同 default。
 */
export function orbStateFromTool(name: string): OrbState {
  const n = name.trim()
  if (!n) return 'working'
  if (SEARCHING.has(n)) return 'searching'
  if (n === 'run_code') return 'solving'
  if (n === 'ask_user') return 'listening'
  if (COMPOSING.has(n)) return 'composing'
  if (WEAVING.has(n)) return 'weaving'
  if (WORKING.has(n)) return 'working'
  return 'working'
}

/** 尚无 tool_call 的模型等待态 */
export const ORB_THINKING: OrbState = 'breathing'
