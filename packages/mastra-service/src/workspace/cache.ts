/**
 * [INPUT]: 应用持有的项目文件系统 Promise 缓存与已校验项目身份
 * [OUTPUT]: invalidateProjectSourceCache：移除并释放该项目两个 source 访问视图
 * [POS]: 资料重绑后的资源生命周期；先移除旧引用，再等待初始化与清理，不删除外部原件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { projectFilesystem } from './workspace.ts'

export async function invalidateProjectSourceCache(cache: Map<string, ReturnType<typeof projectFilesystem>>, projectId: string) {
  const old = [false, true].flatMap(readOnly => {
    const key = `${projectId}:source:${readOnly}`, filesystem = cache.get(key)
    cache.delete(key)
    return filesystem ? [filesystem] : []
  })
  const resolved = await Promise.allSettled(old)
  await Promise.all(resolved.flatMap(result => result.status === 'fulfilled' ? [result.value.destroy()] : []))
}
