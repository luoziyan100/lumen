import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { FsWorkspace } from '../../src/workspace/fs-workspace.ts'
import { createUnpdfEngine } from '../../src/tools/research/pdf-engine.ts'
import { createResearchTools } from '../../src/tools/research/index.ts'
import { buildMinimalPdf } from '../helpers/minimal-pdf.ts'
import { noopCtx } from '../helpers/scripted-model.ts'

test('unpdf 引擎从真实 PDF 字节抽出文本', async () => {
  const engine = createUnpdfEngine()
  const text = await engine(new Uint8Array(buildMinimalPdf('Lumen extract pdf works')))
  assert.match(text, /Lumen extract pdf works/)
})

test('extract_pdf 工具：经工作区沙箱读本地 PDF + 真实引擎抽取', async (t: TestContext) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-pdf-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const root = path.join(base, 'ws')
  const ws = new FsWorkspace({ root })
  await writeFile(path.join(root, 'doc.pdf'), buildMinimalPdf('Sandbox PDF body here'))

  const extractPdf = createResearchTools({ pdfEngine: createUnpdfEngine() }).find((t2) => t2.spec.name === 'extract_pdf')!
  const result = await extractPdf.run({ source: 'doc.pdf', save_as: 'notes/doc.txt' }, noopCtx({ workspace: ws }))

  assert.match(result.llmContent, /Sandbox PDF body here/)
  // save_as 写回工作区
  assert.match(await ws.readFile('notes/doc.txt'), /Sandbox PDF body here/)
})

test('extract_pdf 工具：本地源经沙箱，越界路径被拒', async (t: TestContext) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-pdf2-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const ws = new FsWorkspace({ root: path.join(base, 'ws') })
  const extractPdf = createResearchTools({ pdfEngine: createUnpdfEngine() }).find((t2) => t2.spec.name === 'extract_pdf')!
  const result = await extractPdf.run({ source: '../../etc/passwd' }, noopCtx({ workspace: ws }))
  assert.match(result.llmContent, /^error:/)
})

test('extract_pdf 无引擎：返回清晰提示而非崩溃', async () => {
  const extractPdf = createResearchTools({}).find((t2) => t2.spec.name === 'extract_pdf')!
  const result = await extractPdf.run({ source: 'x.pdf' }, noopCtx())
  assert.match(result.llmContent, /引擎未接入/)
})
