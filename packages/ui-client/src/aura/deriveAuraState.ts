import type { AuraState } from './states'

type AuraSignalItem =
  | { kind: 'msg'; role?: string }
  | { kind: 'process'; running?: boolean; steps?: Array<{ name?: string }> }

export interface AuraSignal {
  connected: boolean
  running: boolean
  items: AuraSignalItem[]
}

const RESEARCH_TOOLS = new Set([
  'search_papers',
  'openalex_search',
  'web_search',
  'search_web',
  'fetch_url',
  'read_url',
  'extract_pdf',
  'read_file',
  'list_files',
  'grep',
])

const WRITING_TOOLS = new Set(['write_file', 'edit_file'])

function lastItem(items: AuraSignalItem[]): AuraSignalItem | undefined {
  return items[items.length - 1]
}

function lastStep(item: AuraSignalItem | undefined): { name?: string } | undefined {
  if (!item || item.kind !== 'process') return undefined
  return item.steps?.[item.steps.length - 1]
}

export function deriveAuraState({ connected, running, items }: AuraSignal): AuraState {
  const last = lastItem(items)
  if (!connected && items.length === 0) return 'idle'
  if (last?.kind === 'msg' && last.role === 'error') return 'blocked'

  if (!running) {
    if (last?.kind === 'msg' && last.role === 'assistant') return 'done'
    return 'idle'
  }

  if (last?.kind === 'msg' && last.role === 'assistant') return 'writing'

  const tool = lastStep(last)?.name
  if (tool && WRITING_TOOLS.has(tool)) return 'writing'
  if (tool && RESEARCH_TOOLS.has(tool)) return 'researching'

  return 'thinking'
}
