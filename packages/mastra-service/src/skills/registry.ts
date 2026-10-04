/**
 * [INPUT]: 显式技能根、任务工作区、纯解析、完整目录上传与受限文件操作
 * [OUTPUT]: createSkillRegistry/SkillRegistry：实时发现、激活、资源读取、工作区/完整包安装和卸载
 * [POS]: 工具与产品 API 共用的技能服务；source > project > user，不保存会话执行状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { lstat, mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { applySkillSubstitutions, normalizeSkillName, parseSkillMarkdown } from './parse.ts'
import { containedPath, copyPackage, inside, publishPackage, readText, serializeRoot } from './files.ts'
import type { InstallScope, SkillLayer, SkillPackage, SkillRegistryOptions } from './types.ts'
import { installUploadedSkill, type SkillUploadFile } from './upload.ts'

async function packagesAt(root: string, layer: SkillLayer): Promise<SkillPackage[]> {
  let base: string
  try { base = await realpath(root) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  const packages: SkillPackage[] = []
  for (const entry of (await readdir(base, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || (!entry.isDirectory() && !entry.isSymbolicLink())) continue
    try {
      const baseDir = await containedPath(base, entry.name)
      const text = await readText(await containedPath(baseDir, 'SKILL.md'))
      packages.push({ ...parseSkillMarkdown(text, entry.name).meta, baseDir, layer })
    } catch { /* 非技能目录、损坏包与越界链接不进入可调用目录。 */ }
  }
  return packages
}

function configuredRoots(options: SkillRegistryOptions): Array<[SkillLayer, string]> {
  const layers: Array<[SkillLayer, string]> = [['user', options.roots.userSkillsDir], ['project', options.roots.projectSkillsDir]]
  if (options.roots.sourceSkillsDir) layers.push(['source', options.roots.sourceSkillsDir])
  for (const root of [options.workspaceDir, ...layers.map(([, root]) => root)]) {
    if (!isAbsolute(root)) throw new Error('技能与工作区根必须是显式绝对路径')
  }
  return layers
}

async function writableDestination(root: string, name: string): Promise<string> {
  const destination = join(root, name)
  try {
    const stat = await lstat(destination)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('安装目标必须是技能目录，不得为符号链接')
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  return destination
}

async function installAt(root: string, layer: InstallScope, source: string): Promise<SkillPackage> {
  const stat = await lstat(source)
  const directory = stat.isDirectory()
  if (!directory && (!stat.isFile() || !/\.md$/i.test(source))) throw new Error('安装来源须为技能目录或 Markdown 文件')
  const skillFile = directory ? await containedPath(source, 'SKILL.md') : source
  const hint = directory ? basename(source) : basename(source).toLowerCase() === 'skill.md' ? basename(dirname(source)) : basename(source).replace(/\.md$/i, '')
  const raw = await readText(skillFile)
  const { meta } = parseSkillMarkdown(raw, hint)
  if (directory && inside(source, root)) throw new Error('安装目标不得位于来源目录内')
  const destination = await writableDestination(root, meta.name)
  if (directory && (inside(destination, source) || inside(source, destination))) throw new Error('安装来源与目标重叠')
  const stage = await mkdtemp(join(root, '.install-'))
  try {
    const payload = join(stage, 'package')
    if (directory) await copyPackage(source, payload)
    else { await mkdir(payload, { mode: 0o700 }); await writeFile(join(payload, 'SKILL.md'), raw, { mode: 0o600 }) }
    await publishPackage(payload, destination)
    return { ...meta, baseDir: destination, layer }
  } finally { await rm(stage, { recursive: true, force: true }) }
}

export function createSkillRegistry(options: SkillRegistryOptions) {
  const roots = configuredRoots(options)
  const list = async (): Promise<SkillPackage[]> => {
    const byName = new Map<string, SkillPackage>()
    for (const [layer, root] of roots) for (const skill of await packagesAt(root, layer)) byName.set(skill.name, skill)
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
  }
  const find = async (input: string): Promise<SkillPackage> => {
    const name = normalizeSkillName(input)
    const skill = (await list()).find(skill => skill.name === name)
    if (!skill) throw new Error(`未知 skill: ${name}`)
    return skill
  }
  const installRoot = (scope: InstallScope): string => {
    if (scope !== 'user' && scope !== 'project') throw new Error('安装范围仅支持 user 或 project')
    const root = roots.find(([layer]) => layer === scope)![1]
    return resolve(root)
  }
  return {
    list,
    async catalog(): Promise<string> {
      const entries = (await list()).filter(skill => !skill.disableModelInvocation)
      if (!entries.length) return ''
      const lines = ['# 可运行的 Skills', '用 run_skill 显式启动工作流；包内资料用 read_skill_file 读取。']
      for (const skill of entries) {
        const line = `- ${skill.name}: ${skill.description}${skill.whenToUse ? ` — ${skill.whenToUse}` : ''}`
        if (lines.join('\n').length + line.length > 6000) { lines.push('其余技能用 list_skills 查询。'); break }
        lines.push(line)
      }
      return lines.join('\n')
    },
    async activate(name: string, args?: string) {
      const skill = await find(name)
      const raw = await readText(await containedPath(skill.baseDir, 'SKILL.md'))
      const parsed = parseSkillMarkdown(raw, skill.name)
      if (parsed.meta.name !== skill.name) throw new Error('技能在读取期间改变，请重试')
      const body = applySkillSubstitutions(parsed.body, { baseDir: skill.baseDir, args })
      return { skill, content: `Skill activated: ${skill.name}\nSkill directory: ${skill.baseDir}\n包内文件用 read_skill_file 读取，执行脚本需另经任务沙箱。\n---\n${body.trim()}` }
    },
    async readFile(name: string, path: string) {
      const skill = await find(name)
      return { name: skill.name, path, content: await readText(await containedPath(skill.baseDir, path), 128_000) }
    },
    async install(input: { path: string; scope?: InstallScope }) {
      const scope = input.scope ?? 'user'
      const configuredRoot = installRoot(scope)
      const source = await containedPath(options.workspaceDir, input.path)
      await mkdir(configuredRoot, { recursive: true, mode: 0o700 })
      const root = await realpath(configuredRoot)
      return serializeRoot(root, () => installAt(root, scope, source))
    },
    async installFiles(files: SkillUploadFile[], scope: InstallScope = 'project') {
      const configuredRoot = installRoot(scope)
      await mkdir(configuredRoot, { recursive: true, mode: 0o700 })
      const root = await realpath(configuredRoot)
      return installUploadedSkill(options.workspaceDir, files, async path => {
        const source = await containedPath(options.workspaceDir, path)
        return serializeRoot(root, () => installAt(root, scope, source))
      })
    },
    async uninstall(input: { name: string; scope: InstallScope }) {
      const root = await realpath(installRoot(input.scope))
      const name = normalizeSkillName(input.name)
      return serializeRoot(root, async () => {
        const destination = await writableDestination(root, name)
        await lstat(destination)
        await rm(destination, { recursive: true })
      })
    },
  }
}

export type SkillRegistry = ReturnType<typeof createSkillRegistry>
