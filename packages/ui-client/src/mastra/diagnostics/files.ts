/**
 * [INPUT]: 已脱敏诊断导出 DTO、用户选中文件与可选 Tauri 保存命令
 * [OUTPUT]: saveDiagnostic/readDiagnosticFile：有界本地保存与读取
 * [POS]: 用户显式文件操作边界；取消不落盘，浏览器下载与桌面原生保存共用 8 MiB 限制
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { DiagnosticExport } from '../data/client.ts'

const MAX_BYTES = 8 * 1024 * 1024
function limited(content: string) {
  if (new TextEncoder().encode(content).byteLength > MAX_BYTES) throw new Error('诊断包超过 8 MiB')
  return content
}

export async function readDiagnosticFile(file: File) {
  if (file.size > MAX_BYTES) throw new Error('诊断包超过 8 MiB')
  return limited(await file.text())
}

export async function saveDiagnostic(pack: DiagnosticExport): Promise<string | null> {
  const content = limited(pack.content), name = pack.fileName.split(/[/\\]/).pop() || 'lumen-diagnostic.json'
  const { isTauri, invoke } = await import('@tauri-apps/api/core')
  if (isTauri()) return invoke<string | null>('save_diagnostic_file', { name, content })
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' })), anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}
