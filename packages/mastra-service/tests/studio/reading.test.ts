/**
 * [INPUT]: the real HTTP service and application root, the Mastra Controller tool loop, catalog.sqlite and library files, a deterministic model network, multi-page PDF fixtures
 * [OUTPUT]: evidence for P1-2 S1/S2/S3 and G1: a reading written through reading_write reads back over HTTP in order with ETag; replace by section id (an unknown id is refused);
 *           an unreferenced item is refused with read_material's sentence; quotes are checked on the cited page (wrong page refused, whitespace differences pass, too short refused,
 *           page past the end refused); a material without pages takes no page; the three caps; reading_view; R1's readable 409 on a second conversation's message while the topic runs;
 *           G1: sediment_quote refuses a reading question's quote (whole or part) and accepts the person's words from the same message, bound to it, original = the words only;
 *           widget params: an old widget without params reads back unchanged, declared params are stored and shown by reading_view without the html, param and script refusals
 *           through reading_write / reading_insert name the block and store nothing, and reading_widget_guide answers the model
 * [POS]: the reading mechanism's end-to-end proof; the controllable model proves mechanism only and never stands in for real-model acceptance
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHttpService } from '../../src/server.ts'
import { topicState } from '../../src/studio/board-tools.ts'
import { fixtureProvider, textReply, toolReply, type ProviderRequest } from '../provider-fixture.ts'
import { ensureTopic } from '../topic-fixture.ts'
import { pagedPdf } from './library-fixtures.ts'

const PAGE_1 = ['Free energy bounds surprise in the cortex', 'Forward connections carry prediction error']
const PAGE_2 = ['Backward connections carry predictions', 'Repetition suppression reflects perceptual learning']
const token = 'reading-token-at-least-24-characters'
const headers = { Authorization: `Bearer ${token}` }

const said = (request: ProviderRequest) => {
  const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
  return { text: JSON.stringify(request.messages[lastUser]), answered: request.messages.slice(lastUser).some(message => message.role === 'tool') }
}
const paper = (text: string, page: number | undefined, quote: string) => ({ text, source: { kind: 'paper' as const, ...(page ? { page } : {}), quote } })
const inference = (text: string) => ({ text, source: { kind: 'inference' as const } })

test('reading_write: appends and replaces read back over HTTP in order; R15, quote, page and cap refusals name what to fix', { timeout: 90000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-reading-'))
  const ids = { pdf: '', text: '', foreign: '', first: '' }
  // The test sets the next call; the model makes it once and then answers in text
  let next: { name: string; args: unknown } | null = null, calls = 0
  const fixture = fixtureProvider(request => {
    const { answered } = said(request)
    if (answered || !next) return textReply('写好了')
    return toolReply(next.name, next.args, `call-${++calls}`)
  })
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const upload = async (name: string, bytes: Uint8Array<ArrayBuffer>, topicId: string) => {
    const form = new FormData()
    form.set('file', new File([bytes], name))
    form.set('topicId', topicId)
    return (await (await service.app.request('/lumen/library', { method: 'POST', headers, body: form })).json()).item.id as string
  }
  const lastTool = () => String(fixture.requests.at(-1)!.messages.filter(message => message.role === 'tool').at(-1)?.content ?? '')
  try {
    ensureTopic(service, 'p'); ensureTopic(service, 'q')
    await service.catalog.createSession('p', 'a')
    const session = await service.application.session('p', 'a')
    ids.pdf = await upload('cortex.pdf', new Uint8Array(pagedPdf([PAGE_1, PAGE_2])), 'p')
    ids.text = await upload('notes.md', new TextEncoder().encode('# Notes\n\nThe brain   minimises\nfree energy over time.'), 'p')
    ids.foreign = await upload('other.pdf', new Uint8Array(pagedPdf([['Foreign topic page with a secret line']])), 'q')
    const call = async (name: string, args: unknown) => { next = { name, args }; await session.sendMessage({ content: `call ${name} ${++calls}` }); next = null; return lastTool() }
    const write = (args: Record<string, unknown>) => call('reading_write', { itemId: ids.pdf, ...args })
    const read = async () => service.app.request(`/lumen/topics/p/readings/${ids.pdf}`, { headers })

    // ---- No reading yet: 404 with a code; the list is empty ----
    assert.equal((await read()).status, 404)
    assert.deepEqual(await (await service.app.request('/lumen/topics/p/readings', { headers })).json(), { items: [] })

    // ---- Two appends come back in order, with the AI's own inference kept apart from paper quotes ----
    assert.match(await write({ title: '为什么值得读', paragraphs: [paper('自由能是惊讶的上界。', 1, 'Free energy bounds surprise in the cortex'), inference('这是一个统一理论的野心。')] }), /"sectionId":"s[0-9a-f]{10}"/)
    assert.match(await write({ title: '证据', paragraphs: [paper('重复抑制是学习的签名。', 2, 'Repetition suppression reflects perceptual learning')] }), /"sections":2/)
    let response = await read()
    assert.equal(response.status, 200)
    const etag = response.headers.get('ETag')!
    let reading = await response.json()
    assert.deepEqual(reading.sections.map((section: { ord: number; title: string }) => [section.ord, section.title]), [[1, '为什么值得读'], [2, '证据']])
    assert.deepEqual(reading.sections[0].paragraphs.map((paragraph: { source: unknown }) => paragraph.source), [{ kind: 'paper', page: 1, quote: 'Free energy bounds surprise in the cortex' }, { kind: 'inference' }])
    assert.match(reading.sections[0].paragraphs[0].id, /^p[0-9a-f]{10}$/)
    assert.match(reading.itemTitle, /^Free energy bounds surprise/)
    assert.equal((await service.app.request(`/lumen/topics/p/readings/${ids.pdf}`, { headers: { ...headers, 'If-None-Match': etag } })).status, 304)
    const listed = await (await service.app.request('/lumen/topics/p/readings', { headers })).json()
    assert.deepEqual(listed.items.map((item: { itemId: string; sections: number }) => [item.itemId, item.sections]), [[ids.pdf, 2]])
    ids.first = reading.sections[0].id

    // ---- Replace by id keeps the place; an unknown id is refused with the next step ----
    await write({ sectionId: ids.first, title: '为什么值得读（改）', paragraphs: [paper('前馈传误差。', 1, 'Forward connections carry prediction error')] })
    reading = await (await read()).json()
    assert.deepEqual(reading.sections.map((section: { id: string; title: string }) => [section.id, section.title]), [[ids.first, '为什么值得读（改）'], [reading.sections[1].id, '证据']])
    assert.equal(reading.sections[0].paragraphs.length, 1)
    assert.notEqual((await (await service.app.request(`/lumen/topics/p/readings/${ids.pdf}`, { headers: { ...headers, 'If-None-Match': etag } }))).status, 304)
    assert.match(await write({ sectionId: 's0000000000', title: '不存在', paragraphs: [inference('x')] }), /没有一节的 id 是 s0000000000.*reading_view/)

    // ---- reading_view gives the model ids, titles and sources ----
    const viewed = await call('reading_view', { itemId: ids.pdf })
    assert.match(viewed, new RegExp(ids.first))
    assert.match(viewed, /Forward connections carry prediction error/)

    // ---- R15: an item of another topic gets read_material's sentence and nothing is stored ----
    assert.match(await call('reading_write', { itemId: ids.foreign, title: '越界', paragraphs: [inference('x')] }), /不在这个主题的引用清单里/)
    assert.match(await call('reading_view', { itemId: ids.foreign }), /不在这个主题的引用清单里/)
    assert.equal((await service.app.request(`/lumen/topics/p/readings/${ids.foreign}`, { headers })).status, 404)

    // ---- Quotes: a page-2 sentence cited on page 1 is refused; whitespace may differ; too short and past the end are refused ----
    assert.match(await write({ title: '错页', paragraphs: [paper('x', 1, 'Backward connections carry predictions')] }), /第 1 段的引文不在第 1 页上.*read_material/)
    assert.match(await write({ title: '空白', paragraphs: [inference('先说一句。'), paper('反馈传预测。', 2, '  Backward   connections\ncarry predictions ')] }), /"sections":3/)
    reading = await (await read()).json()
    assert.equal(reading.sections[2].paragraphs[1].source.quote, 'Backward connections carry predictions')
    assert.match(await write({ title: '太短', paragraphs: [paper('x', 1, 'Free  en')] }), /第 1 段的引文只有 7 字，至少 8 字/)
    assert.match(await write({ title: '没页', paragraphs: [paper('x', undefined, 'Free energy bounds surprise')] }), /要写 page/)
    assert.match(await write({ title: '超页', paragraphs: [paper('x', 3, 'Free energy bounds surprise')] }), /只有 2 页/)

    // ---- A material without pages: the quote is found anywhere, and a page is refused ----
    assert.match(await call('reading_write', { itemId: ids.text, title: '笔记', paragraphs: [paper('大脑最小化自由能。', undefined, 'The brain minimises free energy')] }), /"sections":1/)
    assert.match(await call('reading_write', { itemId: ids.text, title: '笔记', paragraphs: [paper('x', 1, 'The brain minimises free energy')] }), /没有页码；省掉 page/)
    assert.match(await call('reading_write', { itemId: ids.text, title: '笔记', paragraphs: [paper('x', undefined, 'The brain maximises free energy')] }), /找不到/)

    // ---- Caps: 9 paragraphs, 601 characters, a 13th section ----
    assert.match(await write({ title: '九段', paragraphs: Array.from({ length: 9 }, (_, i) => inference(`第 ${i + 1} 段`)) }), /一节最多 8 段/)
    assert.match(await write({ title: '长段', paragraphs: [inference('长'.repeat(601))] }), /第 1 段有 601 字，一段最多 600 字/)
    assert.match(await write({ title: '刚好', paragraphs: [inference('满'.repeat(600))] }), /"sections":4/)
    for (let i = 5; i <= 12; i++) service.application.studio.readings.write('p', ids.pdf, { title: `第 ${i} 节`, paragraphs: [inference('x')] }, { threadId: null, runId: null })
    assert.match(await write({ title: '第 13 节', paragraphs: [inference('x')] }), /最多 12 节，已经写满.*sectionId/)
    reading = await (await read()).json()
    assert.equal(reading.sections.length, 12)
    assert.deepEqual(reading.sections.map((section: { ord: number }) => section.ord), Array.from({ length: 12 }, (_, i) => i + 1))
    // Refused calls never wrote: no stray titles
    assert.ok(!reading.sections.some((section: { title: string }) => ['错页', '太短', '九段', '长段', '越界'].includes(section.title)))
    // The conversation and run that wrote a section are stamped on it
    const stamp = service.application.studio.db.prepare('SELECT thread_id, run_id FROM reading_sections WHERE id = ?').get(ids.first)!
    assert.equal(stamp.thread_id, 'p:a')
    assert.ok(stamp.run_id)
  } finally {
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

test('R1: while one conversation of the topic runs, a second conversation\'s message is refused with the readable 409 and nothing is stored', { timeout: 60000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-reading-busy-'))
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const fixture = fixtureProvider(async request => {
    if (said(request).text.includes('hold')) await held
    return textReply('ok')
  })
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const post = (task: string, message: string) => service.app.request(`/api/agent-controller/lumen/sessions/${encodeURIComponent(`p:${task}`)}/messages`,
    { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) })
  try {
    ensureTopic(service, 'p')
    await service.catalog.createSession('p', 'a'); await service.catalog.createSession('p', 'b')
    const running = (await service.application.session('p', 'a')).sendMessage({ content: 'hold' })
    const limit = Date.now() + 10000
    while (!fixture.requests.length && Date.now() < limit) await new Promise(resolve => setTimeout(resolve, 20))
    const refused = await post('b', '请为《cortex.pdf》写一份解读。（材料 id：x）')
    assert.equal(refused.status, 409)
    const body = await refused.json()
    assert.equal(body.code, 'topic.busy')
    assert.match(body.error, /一个主题同一时刻只跑一段对话/)
    release(); await running
    const stored = await service.app.request(`/api/agent-controller/lumen/sessions/${encodeURIComponent('p:b')}/threads/${encodeURIComponent('p:b')}/messages`, { headers })
    assert.equal(stored.status, 200)
    assert.deepEqual((await stored.json()).messages, [])
  } finally {
    release()
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

test('G1 (R13): a reading question\'s quote is the reading\'s, not the user\'s — sediment_quote refuses it, accepts the person\'s own words from the same message, binds that message and keeps only the words as the original', { timeout: 90000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-reading-quote-'))
  const QUOTE = '遮挡不是细节，是一个无法反推的信息损失'
  const WORDS = '我还是不懂为什么遮挡就反推不了'
  // The exact shape the desktop sends (MODEL_TEXT.askReading); ui-client/tests/reading.test.ts binds that builder to this service's parser
  const QUESTION = `> ${QUOTE}\n— 解读《A theory of cortical responses》· 3. 关键的一步\n\n${WORDS}`
  let calls = 0
  const fixture = fixtureProvider(request => {
    const { text, answered } = said(request)
    if (answered) return textReply('好')
    if (text.includes('递回引文')) return toolReply('sediment_quote', { text: QUOTE }, `call-${++calls}`)
    if (text.includes('递回半句引文')) return toolReply('sediment_quote', { text: '是一个无法反推的信息损失' }, `call-${++calls}`)
    if (text.includes('递回我的话')) return toolReply('sediment_quote', { text: '我不懂为什么遮挡就反推不了' }, `call-${++calls}`)
    return textReply('就这一句：遮挡丢掉的信息没法从输入里找回来。')
  })
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const lastTool = () => String(fixture.requests.at(-1)!.messages.filter(message => message.role === 'tool').at(-1)?.content ?? '')
  const offers = async () => (await (await service.app.request('/lumen/topics/p/sediment', { headers })).json()).offers as { text: string; original: string; fragments: { text: string }[] }[]
  try {
    ensureTopic(service, 'p')
    await service.catalog.createSession('p', 'a')
    const session = await service.application.session('p', 'a')
    await session.sendMessage({ content: QUESTION })
    // ---- The quoted reading sentence, whole or in part, is not the user's: refused, nothing offered ----
    await session.sendMessage({ content: '递回引文' })
    assert.match(lastTool(), /递回的不是原话/)
    await session.sendMessage({ content: '递回半句引文' })
    assert.match(lastTool(), /递回的不是原话/)
    assert.deepEqual(await offers(), [])
    // ---- The person's own words from the same message pass, bound to that message, and the original is the words only ----
    await session.sendMessage({ content: '递回我的话' })
    assert.match(lastTool(), /"offered":"我不懂为什么遮挡就反推不了"/)
    const [offer] = await offers()
    assert.ok(offer, 'no offer stored')
    assert.equal(offer.original, WORDS)
    assert.deepEqual(offer.fragments.map(fragment => fragment.text.trim()), ['还是'])
    const stored = service.application.studio.db.prepare('SELECT message_id FROM sediment_offers').get()!
    const history = await (await service.app.request(`/api/agent-controller/lumen/sessions/${encodeURIComponent('p:a')}/threads/${encodeURIComponent('p:a')}/messages`, { headers })).json()
    const question = (history.messages as { id: string; content: { parts: { type: string; text?: string }[] } }[])
      .find(message => message.content.parts.some(part => part.type === 'text' && part.text?.startsWith(`> ${QUOTE}`)))
    assert.ok(question, 'the question is in the stored history')
    assert.equal(stored.message_id, question.id, 'the offer binds the question message itself')
  } finally {
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

test('living reading: reading_write mixes prose/table/diagram/widget with quote checks; reading_insert adds in place after afterId; topicState lists existing readings', { timeout: 90000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-reading-visual-'))
  let next: { name: string; args: unknown } | null = null, calls = 0
  const fixture = fixtureProvider(request => {
    const { answered } = said(request)
    if (answered || !next) return textReply('写好了')
    return toolReply(next.name, next.args, `call-${++calls}`)
  })
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const lastTool = () => String(fixture.requests.at(-1)!.messages.filter(message => message.role === 'tool').at(-1)?.content ?? '')
  try {
    ensureTopic(service, 'p')
    await service.catalog.createSession('p', 'a')
    const session = await service.application.session('p', 'a')
    const form = new FormData()
    form.set('file', new File([new Uint8Array(pagedPdf([PAGE_1, PAGE_2]))], 'cortex.pdf'))
    form.set('topicId', 'p')
    const itemId = (await (await service.app.request('/lumen/library', { method: 'POST', headers, body: form })).json()).item.id as string
    const call = async (name: string, args: unknown) => { next = { name, args }; await session.sendMessage({ content: `call ${name} ${++calls}` }); next = null; return lastTool() }
    const read = async () => (await service.app.request(`/lumen/topics/p/readings/${itemId}`, { headers })).json()

    // Before any reading exists, topicState stays quiet about readings
    assert.ok(!topicState(service.application.studio, 'p').includes('已有解读'))

    // ---- Mixed section: prose + table (paper quote verified) + diagram (inference) + widget (inference) ----
    const res = await call('reading_write', {
      itemId,
      title: '核心机制',
      paragraphs: [
        paper('自由能是惊讶的上界。', 1, 'Free energy bounds surprise in the cortex'),
        { kind: 'table', title: '前馈与反馈', columns: ['方向', '传什么'], rows: [['前馈', '预测误差'], ['反馈', '预测']], caption: '双向通路', source: { kind: 'paper', page: 1, quote: 'Forward connections carry prediction error' } },
        { kind: 'diagram', title: '误差闭环', mermaid: 'flowchart LR\n  A["预测"] --> B["比较"]\n  B --> C["误差"]', source: { kind: 'inference' } },
        { kind: 'widget', title: '门控小实验', html: '<div><button onclick="window.__widgetSendMessage(\'试了一次\')">试</button></div>', caption: '亲手拨一下', source: { kind: 'inference' } },
      ],
    })
    assert.match(res, /"sections":1/)
    assert.match(topicState(service.application.studio, 'p'), /已有解读[\s\S]*1 节/)

    let reading = await read()
    const section = reading.sections[0]
    assert.equal(section.paragraphs.length, 4)
    assert.equal(section.paragraphs[1].kind, 'table')
    assert.equal(section.paragraphs[2].kind, 'diagram')
    assert.equal(section.paragraphs[3].kind, 'widget')

    // ---- reading_view summarizes widget HTML without dumping raw bytes ----
    const viewed = await call('reading_view', { itemId })
    assert.match(viewed, /"kind":"widget"/)
    assert.match(viewed, /"htmlBytes":/)
    assert.ok(!viewed.includes('__widgetSendMessage'))
    assert.equal(section.paragraphs[3].html, '<div><button onclick="window.__widgetSendMessage(\'试了一次\')">试</button></div>')
    assert.ok(!('params' in section.paragraphs[3]), '没有 params 的旧写法原样写入、原样读出')

    // ---- P1/P4 through the tool: declared params are stored and shown by reading_view (never the html); refusals name the block, the parameter or the script ----
    const params = [
      { type: 'range', name: 'gain', label: '增益', min: 0, max: 4, step: 0.5, default: 1, unit: 'x' },
      { type: 'toggle', name: 'feedback', label: '反馈', default: true },
      { type: 'choice', name: 'mode', label: '模式', options: [{ value: 'fast', label: '快' }, { value: 'slow', label: '慢' }], default: 'slow' },
    ]
    const html = '<p id="v"></p><script>var show = function (p) { document.getElementById("v").textContent = JSON.stringify(p) }; show(window.lumenParams); addEventListener("lumen:params", function (e) { show(e.detail) })</script>'
    assert.match(await call('reading_write', { itemId, title: '调参', paragraphs: [inference('拨一拨。'), { kind: 'widget', title: '增益', html, params, source: { kind: 'inference' } }] }), /"sections":2/)
    const tuned = (await read()).sections[1].paragraphs[1]
    assert.deepEqual(tuned.params, params)
    const viewedParams = await call('reading_view', { itemId })
    assert.deepEqual(JSON.parse(viewedParams).sections[1].paragraphs[1].params, params)
    assert.ok(!viewedParams.includes('lumen:params'), 'reading_view 不带 html')
    assert.match(await call('reading_write', { itemId, title: '坏参', paragraphs: [inference('先说。'), { kind: 'widget', html, params: [{ ...params[0], default: 9 }], source: { kind: 'inference' } }] }), /第 2 块小实验的第 1 个参数「gain」的 default（9）要在 0–4 之间/)
    assert.match(await call('reading_insert', { itemId, sectionId: section.id, block: { kind: 'widget', html: '<script>if (</script>', source: { kind: 'inference' } } }), /第 1 块小实验的第 1 个脚本有语法错误/)
    assert.match(await call('reading_insert', { itemId, sectionId: section.id, block: { kind: 'widget', html: '<p>静态</p>', params, source: { kind: 'inference' } } }), /声明了 params，页面却没有读/)
    assert.equal((await read()).sections.length, 2, '被拒的写入什么也不留')
    assert.match(await call('reading_widget_guide', {}), /lumen:params/)

    // ---- Invalid visual blocks and wrong-page quotes on visual blocks are refused ----
    assert.match(await call('reading_write', { itemId, title: '坏表', paragraphs: [{ kind: 'table', columns: ['a', 'b'], rows: [['only-one']], source: { kind: 'inference' } }] }), /格数要和列数一致/)
    assert.match(await call('reading_write', { itemId, title: '空图', paragraphs: [{ kind: 'diagram', mermaid: '   ', source: { kind: 'inference' } }] }), /mermaid 源码是空的/)
    assert.match(await call('reading_write', { itemId, title: '错页表', paragraphs: [{ kind: 'table', columns: ['a'], rows: [['1']], source: { kind: 'paper', page: 1, quote: 'Backward connections carry predictions' } }] }), /不在第 1 页上/)

    // ---- reading_insert: adds right after afterId without disturbing neighbours, or at end when omitted ----
    const firstId = section.paragraphs[0].id as string
    const inserted = await call('reading_insert', {
      itemId,
      sectionId: section.id,
      afterId: firstId,
      block: { kind: 'diagram', title: '追问补图', mermaid: 'flowchart TD\n  X["惊讶"] --> Y["自由能"]', source: { kind: 'inference' } },
    })
    assert.match(inserted, /"count":5/)
    reading = await read()
    assert.equal(reading.sections[0].paragraphs[1].title, '追问补图', '补图落在 firstId 正下方')
    assert.equal(reading.sections[0].paragraphs[2].kind, 'table', '后续块顺延不变')

    // Unknown afterId is refused cleanly
    assert.match(await call('reading_insert', { itemId, sectionId: section.id, afterId: 'p0000000000', block: inference('x') }), /没有 id 为 p0000000000/)

    // Append at end up to sectionMax (12), 13th is refused
    for (let i = 6; i <= 12; i++) service.application.studio.readings.insert('p', itemId, { sectionId: section.id, block: inference(`补 ${i}`) }, { threadId: null, runId: null })
    assert.match(await call('reading_insert', { itemId, sectionId: section.id, block: inference('超了') }), /最多 12 块/)
  } finally {
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})
