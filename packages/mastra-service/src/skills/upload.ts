/**
 * [INPUT]: 用户上传的相对文件路径/字节、显式任务根和技能安装回调
 * [OUTPUT]: installUploadedSkill：保留目录结构与执行位的完整技能包安装
 * [POS]: 上传只进入任务内私有临时目录，校验完整包后复用既有原子安装，结束即清理
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { PACKAGE_BYTES } from './files.ts'

export interface SkillUploadFile { path: string; bytes: Uint8Array; executable?: boolean; directory?: boolean }

function packageRoot(files: SkillUploadFile[]): string {
  if (!files.length || files.length > 4096) throw new Error('技能包必须包含 1–4096 个文件')
  let total = 0
  const paths = new Set<string>(), roots = new Set<string>()
  for (const file of files) {
    const parts = file.path.split('/')
    if (parts.length < 2 || parts.length > 33 || parts.some(part => !part || part === '.' || part === '..' || /[\\\u0000-\u001f]/u.test(part))) throw new Error('技能包包含无效相对路径')
    const key = file.path.normalize('NFC').toLowerCase()
    if (paths.has(key)) throw new Error('技能包包含重复文件路径')
    paths.add(key); roots.add(parts[0]!)
    total += file.bytes.byteLength
    if (total > PACKAGE_BYTES) throw new Error('技能包超过 32 MiB')
  }
  if (roots.size !== 1) throw new Error('请选择一个完整技能目录')
  const root = [...roots][0]!
  if (!files.some(file => file.path === `${root}/SKILL.md` && !file.directory)) throw new Error('所选技能目录根部缺少 SKILL.md')
  return root
}

export async function installUploadedSkill<T>(workspace: string, files: SkillUploadFile[], install: (path: string) => Promise<T>): Promise<T> {
  const name = packageRoot(files)
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  const root = await realpath(workspace), stage = await mkdtemp(join(root, '.skill-upload-'))
  try {
    for (const file of files) {
      const path = join(stage, file.path)
      if (file.directory) { await mkdir(path, { recursive: true, mode: 0o700 }); continue }
      await mkdir(dirname(path), { recursive: true, mode: 0o700 })
      await writeFile(path, file.bytes, { flag: 'wx', mode: file.executable ? 0o700 : 0o600 })
    }
    return await install(join(stage.slice(root.length + 1), name))
  } finally { await rm(stage, { recursive: true, force: true }) }
}
