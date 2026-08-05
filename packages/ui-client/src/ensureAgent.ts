/**
 * [INPUT]: @tauri-apps/api/core.invoke(可选)
 * [OUTPUT]: ensureAgentService / launchdStatus / launchdInstall / launchdUninstall
 * [POS]: 桌面壳自愈与 LaunchAgent 开关;非 Tauri 环境失败即 false/null
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export interface LaunchdStatus {
  plistInstalled: boolean
  portfileAlive: boolean
  port?: number
  label: string
}

export async function ensureAgentService(): Promise<boolean> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<boolean>('ensure_agent_service')
  } catch {
    return false
  }
}

export async function launchdStatus(): Promise<LaunchdStatus | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<LaunchdStatus>('launchd_status')
  } catch {
    return null
  }
}

export async function launchdInstall(): Promise<LaunchdStatus> {
  const { invoke } = await import('@tauri-apps/api/core')
  return await invoke<LaunchdStatus>('launchd_install')
}

export async function launchdUninstall(): Promise<LaunchdStatus> {
  const { invoke } = await import('@tauri-apps/api/core')
  return await invoke<LaunchdStatus>('launchd_uninstall')
}

/** 是否在 Tauri 壳内(可管 LaunchAgent) */
export function isTauriShell(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
