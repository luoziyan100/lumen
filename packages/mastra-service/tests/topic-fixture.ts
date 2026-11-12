/**
 * [INPUT]: 真实 HTTP 服务或其 studio 存储
 * [OUTPUT]: ensureTopic：按指定 id 建好主题（已存在则直接返回），供以主题身份开会话的测试复用
 * [POS]: 测试夹具；只经 TopicStore 写真实 catalog.sqlite，不伪造主题行
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { Studio } from '../src/studio/studio.ts'

export function ensureTopic(owner: { studio: Studio } | { application: { studio: Studio } }, id: string, title = id) {
  const studio = 'studio' in owner ? owner.studio : owner.application.studio
  try { return studio.topics.get(id) } catch { return studio.topics.create(title, id) }
}
