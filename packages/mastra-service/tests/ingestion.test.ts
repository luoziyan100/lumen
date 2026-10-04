/**
 * [INPUT]: 独立 ZIP 编码器产出的 DOCX/PNG、真实 Workspace 与 Mastra 模型循环
 * [OUTPUT]: DOCX/图片摄取、文件权限、体积/解压上限、取消与多模态线格式证据
 * [POS]: 摄取生产路径回归；不调用旧视觉适配器或读取正式资料
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'
import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { AgentController } from '@mastra/core/agent-controller'
import { noopObserve } from '@mastra/core/tools'
import { RequestContext } from '@mastra/core/request-context'
import { Workspace, LocalFilesystem } from '@mastra/core/workspace'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { createIngestionTools, extractDocxText, imageInfo, createImageToolResultProcessor } from '../src/ingestion/index.ts'
import { createModelGateway, modelId } from '../src/model.ts'
import { fixtureProvider, textReply, toolReply } from './provider-fixture.ts'

// Python zipfile 的不可 seek 输出，包含三个 OOXML 必需成员与 data descriptor；与本解析器独立生成。
const DOCX = Buffer.from('UEsDBBQACAAIAEZWM10AAAAAAAAAAAAAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbJWQuQ7CMAyGX6XKiqgRAwNquwArMPACVuq2EbkUuxxvT8o1sDHa//FZrk73SFzcnPVcq0EkrgFYD+SQyxDJZ6ULyaHkMfUQUZ+xJ1guFivQwQt5mcvUoZpqSx2OVordLa/ZBF+rRJZVsXkZJ1atMEZrNErW4eLbH8r8TShz8unhwUSeZYOCpjpcKCXTUnHEJHt0uQ6uIbXQBj26jCgn41+80HVG0zc/tcUUNDEb3ztbfhWHxn/ugOfbmgdQSwcIdCScU7sAAAA+AQAAUEsDBBQACAAIAEZWM10AAAAAAAAAAAAAAAALAAAAX3JlbHMvLnJlbHONzzsOAiEQBuCrEA6ws1pYGKCy2dZ4AQLDIy6PDBj19lJYrMbCcuaffH9GnHHVPZbcQqyNPdKam+Sh93oEaCZg0m0qFfNIXKGk+xjJQ9Xmqj3Cfp4PQFuDK7E12WIlp8XuOLs8K/5jF+eiwVMxt4S5/6j4uhiyJo9d8nshC/a9ngbLQQn4eFG9AFBLBwhhey9DiQAAAPIAAABQSwMEFAAIAAgARlYzXQAAAAAAAAAAAAAAABEAAAB3b3JkL2RvY3VtZW50LnhtbLMps0rJTy7NTc0rUajIzckrtiqzVcooKSmw0tcvTs5IzU0s1ssvSM0DyqXlF+UmlgC5Ren65flFKQVF+cmpxcWZeem5OfpGBgZm+rmJmXlKdjZlVkn5KZUgugBEFIGIEjufUF9XPwUXf+cIBdcwTxdXP2dXBUsbfZAUSD4xSR+izlFBLTG3wFrBSUEtp8RawVlBTbnCJNUoxRquNqkIqvT5mjVPdvW8WNgDldIHW6YPtRdMpKTmILnh6fZNTzsWvJy5BF0DqrIn++c+nzrz2drFz6a1YzFaH+ZBfUTg2QEAUEsHCA8EyzPgAAAASQEAAFBLAQIUAxQACAAIAEZWM110JJxTuwAAAD4BAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAIAAgARlYzXWF7L0OJAAAA8gAAAAsAAAAAAAAAAAAAAIAB/AAAAF9yZWxzLy5yZWxzUEsBAhQDFAAIAAgARlYzXQ8EyzPgAAAASQEAABEAAAAAAAAAAAAAAIABvgEAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAADAAMAuQAAAN0CAAAAAA==', 'base64')
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64')
const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const xml = (text: string) => `<w:document xmlns:w="${namespace}"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`

function zipXml(text: string, declaredSize?: number, badCrc = false): Buffer {
  const data = Buffer.from(text), compressed = deflateRawSync(data), name = Buffer.from('word/document.xml')
  const checksum = (crc32(data) + Number(badCrc)) >>> 0
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8)
  local.writeUInt32LE(checksum, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(declaredSize ?? data.length, 22); local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10)
  central.writeUInt32LE(checksum, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(declaredSize ?? data.length, 24); central.writeUInt16LE(name.length, 28)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + compressed.length, 16)
  return Buffer.concat([local, name, compressed, central, name, end])
}

async function environment() {
  const root = await mkdtemp(join(tmpdir(), 'lumen-ingestion-'))
  const workspace = new Workspace({ id: 'ingestion', filesystem: new LocalFilesystem({ basePath: root, contained: true }) })
  const reader = new Workspace({ id: 'reader', filesystem: new LocalFilesystem({ basePath: root, contained: true, readOnly: true }) })
  await workspace.init(); await reader.init()
  await writeFile(join(root, 'paper.docx'), DOCX); await writeFile(join(root, 'figure.png'), PNG)
  return { root, workspace, reader, context: { requestContext: new RequestContext(), observe: noopObserve, workspace },
    async close() { await reader.destroy(); await workspace.destroy(); await rm(root, { recursive: true, force: true }) },
  }
}

test('真实 DOCX 中央目录/data descriptor 与命名空间、实体和删除修订均正确解析', async () => {
  const text = await extractDocxText(DOCX)
  assert.match(text, /LUMEN DOCX EVIDENCE 9\tA & B < C 中\n第二行/)
  assert.match(text, /保留正文/)
  assert.doesNotMatch(text, /已删除/)
})

test('DOCX 拒绝损坏、DTD 和伪造大小的解压炸弹；取消能中断解压', async () => {
  await assert.rejects(extractDocxText(Buffer.from('not a ZIP')), /中央目录/)
  await assert.rejects(extractDocxText(zipXml(xml('evidence'), undefined, true)), /CRC/)
  await assert.rejects(extractDocxText(zipXml(`<!DOCTYPE x [<!ENTITY x SYSTEM "file:///private">]>${xml('&x;')}`)), /DTD/)
  await assert.rejects(extractDocxText(zipXml(xml('x'.repeat(8 * 1024 * 1024)), 1)), /实际解压内容超过上限/)
  await assert.rejects(extractDocxText(DOCX, AbortSignal.abort()), { name: 'AbortError' })
  const cancelled = new AbortController()
  const extracting = extractDocxText(zipXml(xml('x'.repeat(4 * 1024 * 1024))), cancelled.signal)
  setImmediate(() => cancelled.abort())
  await assert.rejects(extracting, { name: 'AbortError' })
})

test('真实工作区摄取和保存服从路径/只读权限，声明外的 context workspace 不能放宽 resolver', async () => {
  const env = await environment()
  const outside = await mkdtemp(join(tmpdir(), 'lumen-ingestion-outside-'))
  try {
    const tools = createIngestionTools(() => env.workspace)
    const output = await tools.extract_docx.execute!({ source: 'paper.docx', save_as: 'notes/paper.md', offset: 0, limit: 20000 }, env.context)
    assert.ok(output && typeof output === 'object' && 'content' in output && typeof output.content === 'string')
    assert.match(output.content, /LUMEN DOCX EVIDENCE 9/)
    assert.match(await readFile(join(env.root, 'notes/paper.md'), 'utf8'), /保留正文/)
    await assert.rejects(tools.extract_docx.execute!({ source: 'paper.docx', save_as: 'notes/paper.md', offset: 0, limit: 20000 }, env.context))
    await symlink(join(env.root, 'paper.docx'), join(env.root, 'alias.md'))
    await assert.rejects(tools.extract_docx.execute!({ source: 'paper.docx', save_as: 'alias.md', offset: 0, limit: 20000 }, env.context))
    assert.deepEqual(await readFile(join(env.root, 'paper.docx')), DOCX)
    await writeFile(join(outside, 'external.png'), PNG)
    await symlink(join(outside, 'external.png'), join(env.root, 'escape.png'))
    for (const path of ['../external.png', join(outside, 'external.png'), 'escape.png']) {
      await assert.rejects(tools.look_at_image.execute!({ path }, env.context))
    }
    const readonly = createIngestionTools(() => env.reader)
    const read = await readonly.look_at_image.execute!({ path: 'figure.png' }, env.context)
    assert.ok(read && 'sha256' in read && read.sha256.length === 64 && !('data' in read))
    await assert.rejects(readonly.extract_docx.execute!({ source: 'paper.docx', save_as: 'forbidden.md', offset: 0, limit: 20000 }, env.context), /只读/)
    await assert.rejects(tools.extract_docx.execute!({ source: 'paper.docx', save_as: './paper.docx', offset: 0, limit: 20000 }, env.context), /不得覆盖/)
  } finally { await env.close(); await rm(outside, { recursive: true, force: true }) }
})

test('图片读取验证真实格式、体积与像素上限；取消后不进入可信 resolver', async () => {
  const env = await environment()
  let resolved = 0
  const tools = createIngestionTools(() => { resolved++; return env.workspace })
  try {
    assert.deepEqual(imageInfo(PNG), { mediaType: 'image/png', width: 1, height: 1 })
    await writeFile(join(env.root, 'fake.png'), 'not an image')
    await assert.rejects(tools.look_at_image.execute!({ path: 'fake.png' }, env.context), /有效/)
    await writeFile(join(env.root, 'large.png'), Buffer.alloc(5 * 1024 * 1024 + 1))
    await assert.rejects(tools.look_at_image.execute!({ path: 'large.png' }, env.context), /字节上限/)
    const huge = Buffer.from(PNG); huge.writeUInt32BE(100_000, 16); huge.writeUInt32BE(100_000, 20); huge.writeUInt32BE(crc32(huge.subarray(12, 29)), 29)
    assert.throws(() => imageInfo(huge), /3200 万/)
    const prior = resolved
    await assert.rejects(tools.look_at_image.execute!({ path: 'figure.png' }, { ...env.context, abortSignal: AbortSignal.abort() }), { name: 'AbortError' })
    assert.equal(resolved, prior)
  } finally { await env.close() }
})

test('原生 DOCX 和图像工具进入当前模型；真实 SDK 请求携带 image_url，展示事件不含 base64', { timeout: 120000 }, async t => {
  const env = await environment()
  let documentSeen = false, pixelsSeen = false, changedImageSeen = false
  const fixture = fixtureProvider(request => {
    const results = request.messages.filter(message => message.role === 'tool')
    if (fixture.requests.length > 3) {
      changedImageSeen = JSON.stringify(request.messages).includes('文件已变化或无法读取') && !JSON.stringify(request.messages).includes('image_url')
      return textReply('图片已变化，需要重新读取')
    }
    if (!results.length) return toolReply('extract_docx', { source: 'paper.docx', save_as: 'notes/result.md' }, 'docx')
    if (results.length === 1) { documentSeen = JSON.stringify(results).includes('LUMEN DOCX EVIDENCE 9'); return toolReply('look_at_image', { path: 'figure.png', focus: '观察像素颜色' }, 'image') }
    pixelsSeen = request.messages.some(message => message.role === 'user' && Array.isArray(message.content) && message.content.some(part => part.type === 'image_url' && part.image_url?.url === `data:image/png;base64,${PNG.toString('base64')}`))
    assert.ok(!JSON.stringify(results).includes(PNG.toString('base64')), '图片不应被串成工具文本')
    return textReply('已读取文档和真实图像')
  })
  const settings = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch }
  const storage = new LibSQLStore({ id: 'ingestion', url: `file:${join(env.root, 'memory.sqlite')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false, workingMemory: { enabled: false } } })
  const agent = new Agent({ id: 'ingestion', name: 'Ingestion', instructions: 'Read documents and images', model: modelId(settings), memory,
    tools: createIngestionTools(() => env.workspace), inputProcessors: [createImageToolResultProcessor(() => env.workspace)], workspace: env.workspace })
  const controller = new AgentController({ id: 'ingestion', agent, memory, storage, workspace: () => env.workspace,
    modes: [{ id: 'research', name: 'Research', defaultModelId: modelId(settings), metadata: { default: true } }] })
  const mastra = new Mastra({ agents: { agent }, agentControllers: { ingestion: controller }, storage, gateways: { lumen: createModelGateway(settings) } })
  let session: Awaited<ReturnType<typeof controller.createSession>> | undefined
  try {
    await controller.init(); t.diagnostic('controller initialized'); session = await controller.createSession({ resourceId: 'test', threadId: 'test', workspace: env.workspace })
    const visible: unknown[] = []
    session.subscribe(event => {
      if (event.type === 'tool_approval_required') session!.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
      visible.push(event)
    })
    t.diagnostic('session created'); await session.sendMessage({ content: '读取文档，并查看图像' }); t.diagnostic(`model calls: ${fixture.requests.length}`)
    assert.ok(documentSeen, 'DOCX 结果没有回灌')
    assert.ok(pixelsSeen, 'SDK 未发送原生图像输入')
    assert.ok(!JSON.stringify(visible).includes(PNG.toString('base64')), '显示事件泄露了 base64')
    assert.match(await readFile(join(env.root, 'notes/result.md'), 'utf8'), /LUMEN DOCX EVIDENCE 9/)
    await writeFile(join(env.root, 'figure.png'), 'changed after reading')
    await session.sendMessage({ content: '再说说刚才的图片' })
    assert.ok(changedImageSeen, '历史图片变化后必须明确撤回像素，不能重放旧内容')
  } finally {
    if (session) await controller.deleteSession({ resourceId: session.identity.getResourceId() })
    await controller.destroy(); await mastra.shutdown(); await storage.close(); await env.close()
  }
})
