/**
 * [INPUT]: 期刊名称
 * [OUTPUT]: journalRank：规范化标题后的期刊分级
 * [POS]: 论文排序的领域规则；旗舰名称精确匹配，子刊和家族关键词独立匹配，不让泛名称遮蔽细分项
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
interface RankRule {
  match: string[]
  rank: number
}

const EXACT_RANKS = new Map([['nature', 100], ['science', 100], ['cell', 100]])
const FAMILY_RULES: RankRule[] = [
  { rank: 95, match: ['nature neuroscience', 'nature human behaviour', 'nature methods', 'nature medicine'] },
  { rank: 90, match: ['neuron', 'pnas', 'proceedings of the national academy'] },
  { rank: 85, match: ['nature communications', 'science advances', 'elife'] },
  { rank: 80, match: ['journal of neuroscience', 'trends in cognitive', 'psychological science', 'current biology'] },
  { rank: 75, match: ['neuroimage', 'cerebral cortex', 'cognition'] },
  { rank: 60, match: ['plos', 'frontiers in', 'scientific reports'] },
  { rank: 50, match: ['arxiv', 'biorxiv', 'preprint'] },
]

export function journalRank(venue: string | undefined): number {
  if (!venue) return 0
  const v = venue.trim().toLowerCase().replace(/\s+/g, ' ')
  const exact = EXACT_RANKS.get(v)
  if (exact !== undefined) return exact
  for (const rule of FAMILY_RULES) {
    if (rule.match.some(name => v.includes(name))) return rule.rank
  }
  return 30 // 已知期刊但不在表内
}
