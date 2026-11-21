/**
 * [INPUT]: 完整应用 Controller、项目内建角色与模型 HTTP 夹具
 * [OUTPUT]: 主 Agent 实际请求中的每个工具都有权限类别或单独放行的证据（含只读的 reading_widget_guide 与编辑类的 reading_patch）
 * [POS]: 防止新增工具因漏登记落入 other 而在正式会话中触发人工审批
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApplication } from '../src/application.ts'
import { ALWAYS_ALLOWED_TOOLS, toolCategory } from '../src/permissions.ts'
import { fixtureProvider, textReply } from './provider-fixture.ts'

test('主 Agent 暴露给模型的每个工具都有权限类别或单独放行', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-permissions-'))
  const fixture = fixtureProvider(() => textReply('完成'))
  const application = await createApplication({ dataRoot: root,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch },
  })
  try {
    const session = await application.session('p', 'task')
    await session.sendMessage({ content: '列出工具' })
    const names = fixture.requests[0]?.tools?.map(tool => tool.function.name) ?? []
    for (const expected of ['read_file', 'run_code', 'search_papers', 'look_at_image', 'agent-reader', 'ask_user', 'reading_widget_guide', 'reading_patch']) assert.ok(names.includes(expected), expected)
    const allowed = new Set<string>(ALWAYS_ALLOWED_TOOLS)
    const unclassified = names.filter(name => toolCategory(name) === 'other' && !allowed.has(name))
    assert.deepEqual(unclassified, [], `未登记权限类别的工具：${unclassified.join('、')}`)
  } finally { await application.close(); await rm(root, { recursive: true, force: true }) }
})
