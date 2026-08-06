/**
 * [INPUT]: node:fs;parse;types
 * [OUTPUT]: discoverSkills / skillReadRoots / activateSkill / formatSkillCatalog
 * [POS]: skills/ 发现与激活;优先级 source > workspace > user
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import * as path from 'node:path'
import { applySkillSubstitutions, normalizeSkillName, parseSkillMarkdown } from './parse.ts'
import type { DiscoverRoots, SkillLayer, SkillPackage } from './types.ts'

const BODY_MAX = 80_000
const CATALOG_MAX_CHARS = 6_000

export function defaultUserSkillsDir(home = homedir()): string {
  return path.join(home, '.lumen', 'skills')
}

export function workspaceSkillsDir(workspacesDir: string, projectId: string): string {
  return path.join(workspacesDir, projectId, 'skills')
}

export function sourceSkillsDir(sourcePath: string | null | undefined): string | null {
  if (!sourcePath?.trim()) return null
  return path.join(sourcePath.trim(), '.lumen', 'skills')
}

export function buildDiscoverRoots(opts: {
  workspacesDir: string
  projectId: string
  sourcePath?: string | null
  userSkillsDir?: string
}): DiscoverRoots {
  return {
    userSkillsDir: opts.userSkillsDir ?? defaultUserSkillsDir(),
    workspaceSkillsDir: workspaceSkillsDir(opts.workspacesDir, opts.projectId),
    sourceSkillsDir: sourceSkillsDir(opts.sourcePath),
  }
}

/** Seatbelt 只读放行:各层 skills 根(非整个 ~/.lumen) */
export function skillReadRoots(roots: DiscoverRoots): string[] {
  const out: string[] = [roots.userSkillsDir, roots.workspaceSkillsDir]
  if (roots.sourceSkillsDir) out.push(roots.sourceSkillsDir)
  return out
}

function listSkillDirs(root: string): string[] {
  try {
    const st = statSync(root)
    if (!st.isDirectory()) return []
  } catch {
    return []
  }
  const names = readdirSync(root, { withFileTypes: true })
  const dirs: string[] = []
  for (const ent of names) {
    if (!ent.isDirectory() && !ent.isSymbolicLink()) continue
    if (ent.name.startsWith('.')) continue
    dirs.push(path.join(root, ent.name))
  }
  return dirs
}

function loadPackage(dir: string, layer: SkillLayer): SkillPackage | null {
  const skillFile = path.join(dir, 'SKILL.md')
  let raw: string
  try {
    raw = readFileSync(skillFile, 'utf8')
  } catch {
    return null
  }
  if (raw.length > BODY_MAX) raw = raw.slice(0, BODY_MAX)
  const dirName = path.basename(dir)
  const parsed = parseSkillMarkdown(raw, { dirName })
  if ('error' in parsed) return null
  let baseDir: string
  try {
    baseDir = realpathSync(dir)
  } catch {
    baseDir = path.resolve(dir)
  }
  return {
    ...parsed.meta,
    baseDir,
    skillFile: path.join(baseDir, 'SKILL.md'),
    layer,
  }
}

/**
 * 发现并合并;高优先级覆盖同名。
 * 顺序扫描 user → workspace → source,后者覆盖前者。
 */
export function discoverSkills(roots: DiscoverRoots): SkillPackage[] {
  const byName = new Map<string, SkillPackage>()
  const layers: Array<{ root: string | null | undefined; layer: SkillLayer }> = [
    { root: roots.userSkillsDir, layer: 'user' },
    { root: roots.workspaceSkillsDir, layer: 'workspace' },
    { root: roots.sourceSkillsDir, layer: 'source' },
  ]
  for (const { root, layer } of layers) {
    if (!root) continue
    for (const dir of listSkillDirs(root)) {
      const pkg = loadPackage(dir, layer)
      if (!pkg) continue
      byName.set(pkg.name, pkg)
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function formatSkillCatalog(skills: SkillPackage[]): string {
  const visible = skills.filter((s) => !s.disableModelInvocation)
  if (!visible.length) return ''
  const lines = [
    '# 可运行的 Skills',
    '以下是可调用的研究工作流(不是记忆)。任务匹配时用 run_skill(name=…) **启动**;',
    '启动后按 playbook 执行,包内脚本经 run_code 在沙箱中跑,产物写入工作区。',
    '',
  ]
  for (const s of visible) {
    const when = s.whenToUse ? ` — Use when: ${s.whenToUse}` : ''
    lines.push(`- ${s.name}: ${s.description}${when}`)
  }
  let text = lines.join('\n')
  if (text.length > CATALOG_MAX_CHARS) {
    text = text.slice(0, CATALOG_MAX_CHARS) + '\n…(catalog 已截断)'
  }
  return text
}

export function activateSkill(
  skills: SkillPackage[],
  name: string,
  args?: string,
): { ok: true; llmContent: string; pkg: SkillPackage } | { ok: false; llmContent: string } {
  const key = normalizeSkillName(name)
  if (!key) {
    return { ok: false, llmContent: `error: 非法 skill 名:${name}` }
  }
  const pkg = skills.find((s) => s.name === key)
  if (!pkg) {
    const known = skills.map((s) => s.name).join(', ') || '(无)'
    return { ok: false, llmContent: `error: 未知 skill:${key}。已知:${known}` }
  }
  let raw: string
  try {
    raw = readFileSync(pkg.skillFile, 'utf8')
  } catch {
    return { ok: false, llmContent: `error: 无法读取 ${pkg.skillFile}` }
  }
  if (raw.length > BODY_MAX) raw = raw.slice(0, BODY_MAX)
  const parsed = parseSkillMarkdown(raw, { dirName: pkg.name })
  if ('error' in parsed) {
    return { ok: false, llmContent: `error: ${parsed.error}` }
  }
  const body = applySkillSubstitutions(parsed.body, { baseDir: pkg.baseDir, args })
  const argLine = args?.trim() ? `Args: ${args.trim()}\n` : ''
  const llmContent = [
    `Skill activated: ${pkg.name}`,
    'Status: running playbook — follow until the goal of this skill is met or you explicitly abort.',
    argLine + `Skill directory: ${pkg.baseDir}`,
    '---',
    body.trim(),
  ].join('\n')
  return { ok: true, llmContent, pkg }
}
