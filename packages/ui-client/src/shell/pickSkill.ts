/**
 * [INPUT]: 用户原生文件选择、浏览器目录选择提供的 File
 * [OUTPUT]: SkillFile、pickSkillPackage/browserSkillFiles：保持完整相对结构的上传文件
 * [POS]: 桌面读取权限来自选择框，浏览器来自 File；服务再次核对大小、路径和包完整性
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { invoke } from '@tauri-apps/api/core'

export interface SkillFile { path: string; file?: File; executable?: boolean; directory?: boolean }
interface NativeFile { path: string; contentBase64: string; executable: boolean; directory: boolean }

export async function pickSkillPackage(directory: boolean): Promise<SkillFile[] | null> {
  const files = await invoke<NativeFile[] | null>('pick_skill_package', { directory })
  return files?.map(item => {
    if (item.directory) return { path: item.path, directory: true }
    const bytes = Uint8Array.from(atob(item.contentBase64), value => value.charCodeAt(0))
    return { path: item.path, executable: item.executable, file: new File([bytes], item.path.split('/').pop()!) }
  }) ?? null
}

export function browserSkillFiles(files: File[], directory: boolean): SkillFile[] {
  if (directory) return files.map(file => ({ path: file.webkitRelativePath, file }))
  const file = files[0]
  if (!file) return []
  const name = file.name.replace(/\.md$/i, '')
  return [{ path: `${name.toLowerCase() === 'skill' ? 'local-skill' : name}/SKILL.md`, file }]
}
