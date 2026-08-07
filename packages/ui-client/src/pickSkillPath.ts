/**
 * [INPUT]: Tauri invoke(可选)
 * [OUTPUT]: pickSkillFolder / pickSkillFile —— 安装 Skills 用的本机路径
 * [POS]: Manage Skills 弹窗的添加入口;非桌面返回 null
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export async function pickSkillFolder(): Promise<string | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const path = await invoke<string | null>('pick_skill_folder')
    return path?.trim() || null
  } catch {
    return null
  }
}

export async function pickSkillFile(): Promise<string | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const path = await invoke<string | null>('pick_skill_file')
    return path?.trim() || null
  } catch {
    return null
  }
}
