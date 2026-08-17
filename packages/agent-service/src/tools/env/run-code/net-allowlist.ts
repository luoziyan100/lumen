/**
 * [INPUT]: 无(纯函数)
 * [OUTPUT]: DEFAULT_ALLOWED_DOMAINS / hostAllowed
 * [POS]: run_code 网络白名单单源。匹配在箱外代理里做;空清单=全拒。
 *        精确域默认含其子域;显式 `*.example.com` 同义。不验 TLS 内容。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 研究场景保守起步:装包 + 公开学术源。设置 UI / 每项目覆盖是 P1。 */
export const DEFAULT_ALLOWED_DOMAINS: readonly string[] = [
  'pypi.org',
  'files.pythonhosted.org',
  'registry.npmjs.org',
  'arxiv.org',
  'export.arxiv.org',
  'api.crossref.org',
  'api.semanticscholar.org',
  'doi.org',
]

/** 剥端口 / 尾点 / 大小写,得到要比对的主机名。IPv6 只认 `[addr]` 形式。 */
export function normalizeHost(host: string): string {
  let h = host.trim().toLowerCase()
  if (h.startsWith('[')) {
    const end = h.indexOf(']')
    if (end > 0) return h.slice(1, end)
  }
  const colon = h.lastIndexOf(':')
  if (colon > 0 && /^\d+$/.test(h.slice(colon + 1))) h = h.slice(0, colon)
  if (h.endsWith('.')) h = h.slice(0, -1)
  return h
}

/** 空清单全拒。`example.com` 与 `*.example.com` 都放行自身及子域。 */
export function hostAllowed(host: string, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return false
  const h = normalizeHost(host)
  if (!h) return false
  for (const raw of allowed) {
    const a = normalizeHost(raw)
    if (!a) continue
    const base = a.startsWith('*.') ? a.slice(2) : a
    if (!base) continue
    if (h === base || h.endsWith(`.${base}`)) return true
  }
  return false
}
