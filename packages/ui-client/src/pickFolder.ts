/**
 * [INPUT]: Tauri invoke(可选)
 * [OUTPUT]: pickFolder —— 选本机目录;非桌面或取消返回 null
 * [POS]: 新建项目弹框的源文件夹入口
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 桌面壳:原生选目录;浏览器开发态返回 null(弹框可粘贴路径) */
export async function pickFolder(): Promise<string | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const path = await invoke<string | null>('pick_folder')
    return path?.trim() || null
  } catch {
    return null
  }
}
