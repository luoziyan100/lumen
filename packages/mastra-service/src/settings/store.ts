/**
 * [INPUT]: 显式应用数据根、Node 文件系统、设置领域转换
 * [OUTPUT]: openSettingsStore：串行更新、原子保存、受控导入与公开/内部读取接口
 * [POS]: 设置唯一持久化边界；不读取环境默认值或正式 ~/.lumen
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import { applyPatch, publicSettings } from './profile.ts'
import { emptySettings, importDocument, parsePatch, parseStored, SettingsError, type StoredSettings } from './schema.ts'
import { effectiveSettings, gatewaySettings } from './runtime.ts'
import type { LegacySettingsSource, SettingsPatch } from './types.ts'

export { SettingsError } from './schema.ts'

async function load(file: string): Promise<StoredSettings | undefined> {
  let content: string
  try { content = await readFile(file, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new SettingsError('Could not read settings', 500)
  }
  try { return parseStored(JSON.parse(content)) }
  catch { throw new SettingsError('Invalid settings document') }
}

async function save(file: string, data: StoredSettings): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    const handle = await open(temporary, 'wx', 0o600)
    try { await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`); await handle.sync() }
    finally { await handle.close() }
    await rename(temporary, file)
  } catch { throw new SettingsError('Could not save settings', 500) }
  finally { await rm(temporary, { force: true }).catch(() => {}) }
}

async function legacyInput(source: LegacySettingsSource): Promise<unknown> {
  if ('data' in source) return source.data
  if (!isAbsolute(source.path)) throw new SettingsError('Settings import requires an absolute path')
  try { return JSON.parse(await readFile(source.path, 'utf8')) }
  catch { throw new SettingsError('Could not read legacy settings') }
}

export async function openSettingsStore({ dataRoot }: { dataRoot: string }) {
  if (!isAbsolute(dataRoot)) throw new SettingsError('Settings data root must be absolute')
  await mkdir(dataRoot, { recursive: true, mode: 0o700 })
  const file = join(dataRoot, 'settings.json')
  const loaded = await load(file)
  let data = loaded ?? emptySettings()
  let initialized = !!loaded
  let pending = Promise.resolve()
  let closing = false

  function change<T>(work: () => Promise<T>): Promise<T> {
    if (closing) return Promise.reject(new SettingsError('Settings store is closed', 409))
    const result = pending.then(work)
    pending = result.then(() => {}, () => {})
    return result
  }

  async function commit(next: StoredSettings) {
    await save(file, next)
    data = next
    initialized = true
    return publicSettings(data)
  }

  return {
    toPublic: () => publicSettings(data),
    effective: () => effectiveSettings(data),
    secrets: () => data.profiles.map(profile => profile.apiKey).filter(Boolean),
    modelSettings: () => gatewaySettings(data),
    isInitialized: () => initialized,
    async update(input: SettingsPatch) {
      const patch = parsePatch(input)
      return change(() => commit(applyPatch(data, patch)))
    },
    importLegacy(source: LegacySettingsSource) {
      return change(async () => {
        if (initialized) throw new SettingsError('Settings already initialized', 409)
        return commit(importDocument(await legacyInput(source)))
      })
    },
    close() { closing = true; return pending },
  }
}

export type SettingsStore = Awaited<ReturnType<typeof openSettingsStore>>
