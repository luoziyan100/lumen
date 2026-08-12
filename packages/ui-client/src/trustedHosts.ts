/**
 * [INPUT]: hostname
 * [OUTPUT]: 外链确认「这个域名不再问」localStorage
 * [POS]: ExternalLinkDialog
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

const KEY = 'lumen:trustedLinkHosts'

function readList(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function isTrustedHost(host: string): boolean {
  if (!host) return false
  const h = host.replace(/^www\./, '').toLowerCase()
  return readList().some((x) => x.replace(/^www\./, '').toLowerCase() === h)
}

export function trustHost(host: string): void {
  const h = host.replace(/^www\./, '').toLowerCase()
  if (!h) return
  const next = new Set(readList().map((x) => x.replace(/^www\./, '').toLowerCase()))
  next.add(h)
  localStorage.setItem(KEY, JSON.stringify([...next]))
}
