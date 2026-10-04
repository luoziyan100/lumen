/**
 * [INPUT]: 技能 Markdown 与显式参数；types 的元数据契约
 * [OUTPUT]: normalizeSkillName/parseSkillMarkdown/applySkillSubstitutions
 * [POS]: 技能纯解析层；支持现有顶层字段和多行描述，不执行模板或 YAML 标签
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { SkillMeta } from './types.ts'

export function normalizeSkillName(raw: string): string {
  const name = raw.trim().toLowerCase().replace(/[_\s]+/g, '-')
  if (!/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/.test(name)) throw new Error(`非法 skill 名: ${raw}`)
  return name
}

function scalar(value: string): string {
  const text = value.trim()
  if (text.startsWith('"') && text.endsWith('"')) {
    try { return JSON.parse(text) as string } catch { throw new Error('技能 frontmatter 的双引号字符串无效') }
  }
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'")
  return text.replace(/\s+#.*$/, '').trim()
}

function metadata(lines: string[]): Map<string, string> {
  const fields = new Map<string, string>()
  for (let i = 0; i < lines.length; i++) {
    const match = /^([\w-]+)\s*:\s*(.*)$/.exec(lines[i])
    if (!match) continue
    const key = match[1].toLowerCase().replace(/_/g, '-')
    let value = match[2]
    if (/^[|>][-+]?\s*$/.test(value)) {
      const block: string[] = []
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || !lines[i + 1])) block.push(lines[++i].trim())
      value = block.join(value.startsWith('>') ? ' ' : '\n').trim()
    } else value = scalar(value)
    fields.set(key, value)
  }
  return fields
}

export function parseSkillMarkdown(raw: string, directoryName: string): { meta: SkillMeta; body: string } {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const end = lines[0] === '---' ? lines.findIndex((line, i) => i > 0 && line === '---') : -1
  if (lines[0] === '---' && end < 0) throw new Error('技能 frontmatter 缺少结束分隔符')
  const fields = metadata(end >= 0 ? lines.slice(1, end) : [])
  const body = end >= 0 ? lines.slice(end + 1).join('\n') : text
  const name = normalizeSkillName(fields.get('name') ?? directoryName)
  const fallback = body.split('\n').map(line => line.trim()).find(line => line && !line.startsWith('#'))
  return { body, meta: { name, description: (fields.get('description') || fallback || name).slice(0, 1024),
    whenToUse: fields.get('when-to-use')?.slice(0, 1024), argumentHint: fields.get('argument-hint'),
    disableModelInvocation: /^(true|yes|1)$/i.test(fields.get('disable-model-invocation') ?? '') } }
}

export function applySkillSubstitutions(body: string, options: { baseDir: string; args?: string }): string {
  const args = options.args ?? ''
  const parts = args.trim() ? args.trim().split(/\s+/) : []
  return body.replace(/\$\{(?:LUMEN_SKILL_DIR|CLAUDE_SKILL_DIR|SKILL_DIR)\}|\$ARGUMENTS\b|\$(\d+)\b/g,
    (token, index: string | undefined) => index !== undefined ? parts[Number(index)] ?? '' : token === '$ARGUMENTS' ? args : options.baseDir)
}
