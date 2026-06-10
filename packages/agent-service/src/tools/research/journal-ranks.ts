/**
 * [OUTPUT]: journalRank —— 期刊分级（用于检索结果排序）
 * [POS]: §5.3 可移植数据资产。对应 old_lumen search.rs 的期刊排名表（此处为代表性子集，可扩充）
 *
 * 数据即资产：rank 越高越靠前。venue 名做小写包含匹配，容忍缩写差异。
 */
interface RankRule {
  match: string[]
  rank: number
}

const RULES: RankRule[] = [
  { rank: 100, match: ['nature', 'science', 'cell'] },
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
  const v = venue.toLowerCase()
  for (const rule of RULES) {
    if (rule.match.some((m) => v.includes(m))) return rule.rank
  }
  return 30 // 已知期刊但不在表内
}
