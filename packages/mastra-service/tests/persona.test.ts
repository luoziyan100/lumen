/**
 * [INPUT]: the full application Controller and the model HTTP fixture
 * [OUTPUT]: the main agent's actual system prompt carries the full drawing contract (closed nodes first/branching/subgraph-end/sequence/scale/semantic classes, no colors) and the board-scratch-paper beliefs plus the board and sediment tools (2026-11-19 co-drawn canvas: the AI judges what to draw, erasing the user's strokes is explained and restorable, the retired block rules are gone; delete tics only), the reading belief (short answers about one sentence, no board unless asked, no quizzing, quotes are not the user's words) and reading_write titles without ordinals; the widget beliefs (one core mechanism, own section after section 1, guess first / look directly) stay while how to write a widget is only 「先调 reading_widget_guide」; the persona always says 「用户」
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
    for (const belief of ['白板：你们俩的草稿纸', '先画，再说', '画什么、画多大、画在哪，由你判断', '断在哪一级', '先收进资料库', 'board_draw', 'board_erase', 'to_library: true',
      '沉淀是用户自己的话，字只能是用户的', '问出一个锚点问题', '除了口癖一个不动', '宁可少删，让用户自己划', 'sediment_invite({ question, elementIds? })', 'sediment_quote({ text, elementIds? })', '用户的字是用户的，原样留着']) {
      assert.ok(system.includes(belief), belief)
    }
    // ---- Readings (living reading: prose + 2D explorable widget + inline reading_insert): beliefs and tools arrive together ----
    for (const belief of ['## 写一份解读', '写好一节就落一节', '第一节要快', '第一节写它为什么值得读', '由你自主决定每一处用文字还是用画面补助', '活结构图', '单独成节', '先猜一下', '直接看', 'reading_widget_guide', '引文保留原文的语言，不翻译；解读本身用用户的语言写', '就标成推断',
      '最后写边界和判断', '就那一句和用户的问题回答，两三句，最多一小段', '不画白板，除非用户要你画', '不出题考用户', 'reading_insert', '引文是解读里的句子，不是用户的话，不要当作用户的话递回沉淀', 'title 不带序号', 'quote 会显示在这段下面', 'reading_view({ itemId })', 'reading_write({ itemId, sectionId?, title, paragraphs })', 'reading_insert({ itemId, sectionId, afterId?, block })']) {
      assert.ok(system.includes(belief), belief)
    }
  } finally { await application.close(); await rm(root, { recursive: true, force: true }) }
})

test('小实验的写法不常驻人格：只留信念与「先调 reading_widget_guide」（2026-11-20）', () => {
  for (const belief of ['光靠文字说不清的那一个核心机制', '放在第一节文字落地之后单独成节', '先猜一下', '直接看', "widget（{ kind: 'widget', title?, html, params?, caption?, source }，写之前先调 reading_widget_guide"]) {
    assert.ok(RESEARCH_PERSONA.includes(belief), belief)
  }
  for (const moved of ['__widgetSendMessage', 'lumenParams', '64KB']) assert.ok(!RESEARCH_PERSONA.includes(moved), moved)
})

test('人格对用户一律称「用户」，不替用户假定性别（负责人决定 2026-11-12）', () => {
  assert.doesNotMatch(RESEARCH_PERSONA, /(?<!其)[他她]/)
  assert.match(RESEARCH_PERSONA, /# 你和用户/)
})

test('白板段按共画的草稿纸写：AI 判断画什么、擦了要说明，旧区块规则不再出现（2026-11-19）', () => {
  for (const belief of ['你们俩都在上面画', '用户正看着的那块地方，就是你们此刻的桌面', '要在回复里说清擦了什么、为什么', '用户一键就能恢复',
    'board_view：这一轮白板的结构', 'board_draw({ title, elements })', 'ElementSkeleton', 'board_update({ title, elements })', 'board_erase({ ids, reason })', 'board_look']) {
    assert.ok(RESEARCH_PERSONA.includes(belief), belief)
  }
  for (const retired of ['board_supersede', '一块只讲一件事', '白板满了', '容量', 'baseRev', 'blockIds']) assert.ok(!RESEARCH_PERSONA.includes(retired), retired)
})
