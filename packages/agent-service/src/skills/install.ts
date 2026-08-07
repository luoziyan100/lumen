/**
 * [INPUT]: node:fs;parse normalizeSkillName / parseSkillMarkdown;discovery 路径助手
 * [OUTPUT]: installSkillFromPath / uninstallSkill —— 拷贝进用户/项目 skills 根
 * [POS]: skills/ 安装面;对齐 OpenClaw「本地路径拷贝进根」,非挂外部路径
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { normalizeSkillName, parseSkillMarkdown } from './parse.ts'
import { defaultUserSkillsDir, workspaceSkillsDir } from './discovery.ts'
import type { SkillLayer } from './types.ts'

export type InstallScope = 'user' | 'project'

export interface InstallSkillOpts {
  scope: InstallScope
  /** 本机绝对路径:技能目录或单个 SKILL.md */
  path: string
  workspacesDir: string
  projectId: string
  userSkillsDir?: string
}

export interface InstallSkillResult {
  name: string
  layer: SkillLayer
  baseDir: string
}

function resolveInstallRoot(opts: InstallSkillOpts): { root: string; layer: SkillLayer } {
  if (opts.scope === 'user') {
    return { root: opts.userSkillsDir ?? defaultUserSkillsDir(), layer: 'user' }
  }
  return {
    root: workspaceSkillsDir(opts.workspacesDir, opts.projectId),
    layer: 'workspace',
  }
}

function readSkillMd(file: string): string {
  return readFileSync(file, 'utf8')
}

/**
 * 从本机路径安装。
 * - 目录:须含 SKILL.md,整树拷进 <root>/<name>/
 * - 单文件:仅接受名为 SKILL.md(或可解析 frontmatter)的 .md,包成目录后拷入
 */
export function installSkillFromPath(opts: InstallSkillOpts): InstallSkillResult {
  const src = path.resolve(opts.path)
  if (!existsSync(src)) throw new Error(`路径不存在:${src}`)

  const { root, layer } = resolveInstallRoot(opts)
  mkdirSync(root, { recursive: true })

  const st = statSync(src)
  let stagingDir: string | null = null
  let packageDir: string
  let skillFile: string

  try {
    if (st.isDirectory()) {
      skillFile = path.join(src, 'SKILL.md')
      if (!existsSync(skillFile)) throw new Error('技能文件夹须含 SKILL.md')
      packageDir = src
    } else if (st.isFile()) {
      const base = path.basename(src)
      if (!/\.md$/i.test(base)) throw new Error('单文件安装仅支持 SKILL.md(或 .md 技能正文)')
      const raw = readSkillMd(src)
      const dirHint = base.replace(/\.md$/i, '') === 'SKILL' || base.toLowerCase() === 'skill.md'
        ? 'skill'
        : base.replace(/\.md$/i, '')
      const parsed = parseSkillMarkdown(raw, { dirName: dirHint })
      if ('error' in parsed) throw new Error(parsed.error)
      // 临时目录组装成标准包再拷贝
      stagingDir = mkdtempSync(path.join(tmpdir(), 'lumen-skill-'))
      packageDir = stagingDir
      skillFile = path.join(stagingDir, 'SKILL.md')
      writeFileSync(skillFile, raw, 'utf8')
    } else {
      throw new Error('不支持的路径类型')
    }

    const raw = readSkillMd(skillFile)
    const dirName = path.basename(packageDir)
    const parsed = parseSkillMarkdown(raw, { dirName })
    if ('error' in parsed) throw new Error(parsed.error)
    const name = parsed.meta.name
    const normalized = normalizeSkillName(name)
    if (!normalized) throw new Error(`非法 skill 名:${name}`)

    const dest = path.join(root, normalized)
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    cpSync(packageDir, dest, { recursive: true })
    return { name: normalized, layer, baseDir: dest }
  } finally {
    if (stagingDir) rmSync(stagingDir, { recursive: true, force: true })
  }
}

/** 仅删 user/workspace 根下的包;source 树不可经此卸载 */
export function uninstallSkill(opts: {
  scope: InstallScope
  name: string
  workspacesDir: string
  projectId: string
  userSkillsDir?: string
}): void {
  const key = normalizeSkillName(opts.name)
  if (!key) throw new Error(`非法 skill 名:${opts.name}`)
  const { root } = resolveInstallRoot({
    scope: opts.scope,
    path: '.',
    workspacesDir: opts.workspacesDir,
    projectId: opts.projectId,
    userSkillsDir: opts.userSkillsDir,
  })
  const dest = path.join(root, key)
  if (!existsSync(dest)) throw new Error(`未找到可卸载的 skill:${key}(${opts.scope})`)
  // 防穿越:realpath 必须仍在 root 下
  const resolved = path.resolve(dest)
  if (!resolved.startsWith(path.resolve(root) + path.sep) && resolved !== path.resolve(root)) {
    throw new Error('拒绝卸载:路径越界')
  }
  rmSync(resolved, { recursive: true, force: true })
}
