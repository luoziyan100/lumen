/**
 * docx 摄取解析:OOXML→文本 + saveUpload 双写。
 */
import { describe, it, test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { extractDocxText, docxExtractMarkdown } from '../../src/tools/ingest/docx.ts'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { AgentRuntime } from '../../src/runtime/agent-runtime.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs-tools.ts'
import { ScriptedModel } from '../helpers/scripted-model.ts'

/** 最小可解析 docx(单 local header + document.xml) */
function minimalDocx(paragraphs: string[]): Buffer {
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
    .join('')
  const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
  const name = Buffer.from('word/document.xml', 'utf8')
  const raw = Buffer.from(xml, 'utf8')
  const compressed = deflateRawSync(raw)
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4) // version
  header.writeUInt16LE(0, 6) // flags
  header.writeUInt16LE(8, 8) // deflate
  header.writeUInt16LE(0, 10)
  header.writeUInt16LE(0, 12)
  header.writeUInt32LE(0, 14) // crc
  header.writeUInt32LE(compressed.length, 18)
  header.writeUInt32LE(raw.length, 22)
  header.writeUInt16LE(name.length, 26)
  header.writeUInt16LE(0, 28) // extra
  return Buffer.concat([header, name, compressed])
}

describe('extractDocxText', () => {
  it('抽出段落文本', () => {
    const bytes = minimalDocx(['你好会议', '压缩涌现'])
    const text = extractDocxText(bytes)
    assert.match(text, /你好会议/)
    assert.match(text, /压缩涌现/)
  })

  it('docxExtractMarkdown 带原件提示', () => {
    const md = docxExtractMarkdown('a.docx', '正文')
    assert.match(md, /# a\.docx/)
    assert.match(md, /uploads/)
    assert.match(md, /正文/)
  })
})

test('saveUpload docx:原件 uploads/ + 抽出 docs/*.md', async (t: TestContext) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-docx-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => {
    db.close()
    return rm(base, { recursive: true, force: true })
  })
  const store = new TaskStore(db)
  const rt = new AgentRuntime({
    store,
    model: new ScriptedModel([]),
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: ENV_TOOLS,
  })
  const tid = 't-docx'
  const bytes = new Uint8Array(minimalDocx(['会议纪要一行']))
  const saved = await rt.saveUpload('p', 'yxysmeeting.docx', bytes, tid)
  assert.equal(saved, 'uploads/yxysmeeting.docx')

  const root = path.join(base, 'workspaces', 'p', 'sessions', tid)
  const md = await readFile(path.join(root, 'docs', 'yxysmeeting.md'), 'utf8')
  assert.match(md, /会议纪要一行/)
  assert.match(md, /摄取解析/)

  const assets = await rt.listAssets('p', tid)
  const names = assets.map((a) => a.name)
  assert.ok(names.includes('yxysmeeting.docx'))
  assert.ok(names.includes('yxysmeeting.md'))
})
