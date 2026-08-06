/**
 * [INPUT]: node:fs;types 的 SkillMeta
 * [OUTPUT]: parseSkillMarkdown / applySkillSubstitutions —— frontmatter + 变量替换
 * [POS]: skills/ 解析器;v1 只用 name/description/when_to_use 等子集
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { SkillMeta } from './types.ts'

const NAME_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/i

export function normalizeSkillName(raw: string): string | null {
  const n = raw.trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-')
  if (!NAME_RE.test(n)) return null
  return n
}

function stripQuotes(s: string): string {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}

function parseBool(v: string): boolean {
  const s = stripQuotes(v).toLowerCase()
  return s === 'true' || s === 'yes' || s === '1'
}

/** 极简 YAML 行解析(仅顶层 key: value);不引 yaml 依赖 */
export function parseFrontmatter(raw: string): { meta: Partial<SkillMeta>; body: string } {
  const text = raw.replace(/^\uFEFF/, '')
  if (!text.startsWith('---')) {
    return { meta: {}, body: text }
  }
  const end = text.indexOf('\n---', 3)
  if (end < 0) return { meta: {}, body: text }
  const fm = text.slice(3, end).replace(/^\r?\n/, '')
  const body = text.slice(end + 4).replace(/^\r?\n/, '')
  const meta: Partial<SkillMeta> = {}
  for (const line of fm.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const key = m[1].toLowerCase().replace(/_/g, '-')
    const val = stripQuotes(m[2] ?? '')
    if (key === 'name') meta.name = val
    else if (key === 'description') meta.description = val
    else if (key === 'when-to-use') meta.whenToUse = val
    else if (key === 'argument-hint') meta.argumentHint = val
    else if (key === 'disable-model-invocation') meta.disableModelInvocation = parseBool(val)
  }
  return { meta, body }
}

export function parseSkillMarkdown(
  raw: string,
  opts: { dirName: string },
): { meta: SkillMeta; body: string } | { error: string } {
  const { meta: fm, body } = parseFrontmatter(raw)
  const name = normalizeSkillName(fm.name ?? opts.dirName)
  if (!name) return { error: `非法 skill 名:${fm.name ?? opts.dirName}` }
  let description = (fm.description ?? '').trim()
  if (!description) {
    const first = body.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#'))
    description = first ? first.slice(0, 200) : name
  }
  return {
    meta: {
      name,
      description: description.slice(0, 1024),
      whenToUse: fm.whenToUse?.slice(0, 1024),
      argumentHint: fm.argumentHint,
      disableModelInvocation: fm.disableModelInvocation === true,
    },
    body,
  }
}

/** 激活时替换;$ARGUMENTS / $0.. / ${LUMEN_SKILL_DIR} / Claude 别名 */
export function applySkillSubstitutions(
  body: string,
  opts: { baseDir: string; args?: string },
): string {
  const args = opts.args ?? ''
  const parts = args.trim() === '' ? [] : args.trim().split(/\s+/)
  let out = body
  out = out.replace(/\$\{LUMEN_SKILL_DIR\}/g, opts.baseDir)
  out = out.replace(/\$\{CLAUDE_SKILL_DIR\}/g, opts.baseDir)
  out = out.replace(/\$\{SKILL_DIR\}/g, opts.baseDir)
  out = out.replace(/\$ARGUMENTS\b/g, args)
  out = out.replace(/\$(\d+)\b/g, (_, n: string) => parts[Number(n)] ?? '')
  return out
}
