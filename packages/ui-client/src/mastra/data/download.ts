/**
 * [INPUT]: 已经由认证文件 API 读取的 Blob、Tauri 原生保存命令
 * [OUTPUT]: saveWorkspaceFile：用户选择目标后的有界本机保存
 * [POS]: 桌面使用系统对话框；浏览器保留标准下载，不向原生层传任意路径或网络地址
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { invoke, isTauri } from '@tauri-apps/api/core'

export async function saveWorkspaceFile(name: string, blob: Blob): Promise<string | null> {
  if (blob.size > 25 * 1024 * 1024) throw new Error('文件超过 25 MiB，请在工作区中处理后导出。')
  if (isTauri()) {
    const encoded = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
      reader.onerror = () => reject(new Error('无法准备导出文件'))
      reader.readAsDataURL(blob)
    })
    return invoke<string | null>('save_workspace_file', { name, contentBase64: encoded })
  }
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}
