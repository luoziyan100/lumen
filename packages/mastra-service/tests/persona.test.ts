/**
 * [INPUT]: 完整应用 Controller 与模型 HTTP 夹具
 * [OUTPUT]: 主 Agent 实际 system 提示携带完整画图合同(闭合/分支/subgraph-end/sequence/规模/语义 class、不写颜色)
 * [POS]: 画图规则与界面宿主颜色裁决(ui-client mermaidTheme)的镜像回归;规则只劝说,渲染侧仍兜底
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApplication } from '../src/application.ts'
import { fixtureProvider, textReply } from './provider-fixture.ts'

test('主 Agent 实际请求的 system 提示包含完整画图规则', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-persona-'))
  const fixture = fixtureProvider(() => textReply('完成'))
  const application = await createApplication({ dataRoot: root,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch },
  })
  try {
    const session = await application.session('p', 'task')
    await session.sendMessage({ content: '画一张流程图' })
    const system = (fixture.requests[0]?.messages ?? []).filter(message => message.role === 'system').map(message => String(message.content)).join('\n')
    for (const rule of ['先闭合节点再写边', 'flowchart TD', '-- "是" -->', 'subgraph 与 end 成对', 'A->>B: 消息', '15 个节点', '不写颜色、style 或 init', 'ok/warn/danger/accent/muted']) {
      assert.ok(system.includes(rule), rule)
    }
  } finally { await application.close(); await rm(root, { recursive: true, force: true }) }
})
