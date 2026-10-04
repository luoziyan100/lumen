/**
 * [INPUT]: 任意诊断负载与应用显式提供的已知凭证
 * [OUTPUT]: redactPayload：有界、无原对象修改的 JSON 安全内容及脱敏/裁剪标志
 * [POS]: 采集、查询、标注、导出共用边界；裸编码二进制也省略，异常时不退回原始负载
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const REDACTED = '[REDACTED]'
const OMITTED = '[OMITTED]'
const SECRET = /^(?:key|token|auth|authorization|bearer|bearertoken|cookie|setcookie|password|passwd|secret|credential|credentials|privatekey|clientsecret|refresh|ssn|query)$|(?:apikey|accesstoken|refreshtoken|authtoken|sessiontoken|clientsecret|privatekey|securitytoken)$/i
const BINARY = /base64|encoded|binary|imagedata/i
const LIMIT = { depth: 12, nodes: 16000, entries: 200, string: 32768 }
export interface Redaction { value: unknown; redacted: boolean; truncated: boolean }

function encodedPayload(value: string): boolean {
  if (value.length < 16 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) return false
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64').replace(/=+$/, '') !== normalized) return false
  const decoded = bytes.toString('utf8')
  const media = /^(?:\x89PNG\r\n\x1a\n|\xff\xd8\xff|GIF8[79]a|RIFF[\s\S]{4}WEBP|%PDF-|PK\x03\x04|\x1f\x8b|II\x2a\x00|MM\x00\x2a)/.test(bytes.toString('latin1'))
  return media || /bearer\s|api[-_]?key|password|authorization/i.test(decoded) || /=+$/.test(value) && /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(decoded)
}

export function redactPayload(input: unknown, secrets: readonly string[] = []): Redaction {
  let redacted = false, truncated = false, nodes = 0
  const seen = new WeakSet<object>(), known = secrets.filter(value => value.length >= 8)
  const hide = () => { redacted = true; return REDACTED }
  const omit = () => { truncated = true; return OMITTED }
  function text(value: string): string {
    if (value.length > LIMIT.string) return omit()
    let output = value.replace(/data:[^\s;,]+(?:;[^,\s]+)*;base64,[A-Za-z0-9+/=_-]+/gi, hide)
    output = output.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+={0,2}/gi, hide)
    output = output.replace(/\b(?:api[_-]?key|authorization|password|secret|access[_-]?token)\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi, hide)
    output = output.replace(/https?:\/\/[^\s<>"']+/gi, address => {
      try { const url = new URL(address); if (url.username || url.password || url.search || url.hash) { redacted = true; url.username = ''; url.password = ''; url.search = ''; url.hash = '' }; return url.href }
      catch { return hide() }
    })
    for (const secret of known) {
      for (const encoded of [secret, encodeURIComponent(secret), Buffer.from(secret).toString('base64')]) {
        if (output.includes(encoded)) { redacted = true; output = output.split(encoded).join(REDACTED) }
      }
    }
    if (/^[A-Za-z0-9+/=_-]{128,}$/.test(output)) return hide()
    if (encodedPayload(output)) return hide()
    return output
  }
  function walk(value: unknown, depth: number): unknown {
    if (++nodes > LIMIT.nodes || depth > LIMIT.depth) return omit()
    if (typeof value === 'string') {
      if (value.length > LIMIT.string) return omit()
      const trimmed = value.trim()
      if (/^[{[]/.test(trimmed)) { try { return JSON.stringify(walk(JSON.parse(value), depth + 1)) } catch { /* 非 JSON 正文继续按字符串脱敏。 */ } }
      return text(value)
    }
    if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value ?? null
    if (value instanceof Date) return value.toISOString()
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) return hide()
    if (typeof value !== 'object') return omit()
    if (seen.has(value)) return omit()
    seen.add(value)
    if (Array.isArray(value)) { if (value.length > LIMIT.entries) truncated = true; return value.slice(0, LIMIT.entries).map(item => walk(item, depth + 1)) }
    const entries = Object.entries(value), output: Record<string, unknown> = Object.create(null)
    if (entries.length > LIMIT.entries) truncated = true
    for (const [key, field] of entries.slice(0, LIMIT.entries)) {
      const normalized = key.replace(/[^a-z0-9]/gi, '')
      output[text(key)] = SECRET.test(normalized) || BINARY.test(normalized) ? hide() : walk(field, depth + 1)
    }
    return output
  }
  try { return { value: walk(input, 0), redacted, truncated } }
  catch { return { value: OMITTED, redacted: true, truncated: true } }
}
