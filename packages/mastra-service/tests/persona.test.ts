/**
 * [INPUT]: the full application Controller and the model HTTP fixture
 * [OUTPUT]: the main agent's actual system prompt carries the full drawing contract (closed nodes first/branching/subgraph-end/sequence/scale/semantic classes, no colors) and the board-scratch-paper beliefs plus the board and sediment tools (P1-1: stop when full, delete tics only, settled stays untouched), the reading belief (short answers about one sentence, no board unless asked, no quizzing, quotes are not the user's words) and reading_write titles without ordinals; the persona always says 「用户」
 * [POS]: a mirror regression of the drawing rules and the UI host's color decisions (ui-client mermaidTheme); the rules only persuade — rendering still has its own guardrails
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApplication } from '../src/application.ts'
import { RESEARCH_PERSONA } from '../src/agents/persona.ts'
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
    // ---- The board as the pair's scratch paper: both the belief layer and the tool layer must reach the model ----
    // ---- Sediment (P1-1, the S7 approved draft): beliefs and tools arrive together ----
    for (const belief of ['白板：你们俩的草稿纸', '先画，再说', '一块只讲一件事', '断在哪一级', '先收进资料库', 'board_draw', 'board_supersede', 'to_library: true',
      '沉淀是用户自己的话，字只能是用户的', '用 sediment_invite 指出这张里值得留下的几块', '除了口癖一个不动', '宁可少删，让用户自己划', 'sediment_invite({ blockIds, question })', 'sediment_quote({ text, blockIds? })', '已沉淀（settled）的块是用户留作证据的']) {
      assert.ok(system.includes(belief), belief)
    }
    // ---- Readings (P1-2, the S4 approved draft with the manager's two edits): beliefs and tools arrive together ----
    for (const belief of ['## 写一份解读', '写好一节就落一节', '第一节写它为什么值得读', '引文保留原文的语言，不翻译；解读本身用用户的语言写', '就标成推断',
      '最后写边界和判断', '就那一句和用户的问题回答，两三句，最多一小段', '不画白板，除非用户要你画', '不出题考用户', '引文是解读里的句子，不是用户的话，不要当作用户的话递回沉淀', 'title 不带序号', 'quote 会显示在这段下面', 'reading_view({ itemId })', 'reading_write({ itemId, sectionId?, title, paragraphs })']) {
      assert.ok(system.includes(belief), belief)
    }
  } finally { await application.close(); await rm(root, { recursive: true, force: true }) }
})

test('人格对用户一律称「用户」，不替用户假定性别（负责人决定 2026-11-12）', () => {
  assert.doesNotMatch(RESEARCH_PERSONA, /(?<!其)[他她]/)
  assert.match(RESEARCH_PERSONA, /# 你和用户/)
})
