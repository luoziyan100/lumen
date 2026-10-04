/**
 * [INPUT]: 显式域名字符串与调用方网络清单
 * [OUTPUT]: RESEARCH_DOMAINS / hostAllowed / normalizeHost
 * [POS]: run_code 箱外代理的纯域名策略；列出默认研究来源但不授予网络权限
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const RESEARCH_DOMAINS = [
  'pypi.org', 'files.pythonhosted.org', 'registry.npmjs.org', 'arxiv.org',
  'export.arxiv.org', 'api.crossref.org', 'api.semanticscholar.org', 'doi.org',
] as const

export function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
}

export function hostAllowed(host: string, domains: readonly string[]): boolean {
  const name = normalizeHost(host)
  return domains.some(domain => {
    const wildcard = domain.startsWith('*.')
    const base = normalizeHost(wildcard ? domain.slice(2) : domain)
    return !!base && ((!wildcard && name === base) || name.endsWith(`.${base}`))
  })
}
