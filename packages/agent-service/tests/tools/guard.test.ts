/**
 * tool-guard 验收:超时兜底 + 遥测 + 不破坏真实工具契约。
 * AT1 挂起被兜底 / AT2 正常透传 / AT3 超时 abort 子 signal / AT3b 父取消上抛 / 遥测 / AT4 全工具契约。
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { withGuard, type ToolTelemetry } from '../../src/core/guard.ts'
import type { Tool } from '../../src/core/tool.ts'
import { FsWorkspace } from '../../src/workspace/fs-workspace.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs-tools.ts'
import { runCodeTool } from '../../src/tools/env/run-code.ts'
import { createResearchTools, type HttpClient, type HttpResponse } from '../../src/tools/research/index.ts'
import { noopCtx, fixedTool } from '../helpers/scripted-model.ts'

async function makeWs(t: TestContext): Promise<FsWorkspace> {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-guard-'))
  const root = path.join(base, 'workspace')
  await mkdir(root, { recursive: true })
  t.after(() => rm(base, { recursive: true, force: true }))
  return new FsWorkspace({ root })
}

const stubHttp: HttpClient = async (): Promise<HttpResponse> => ({
  status: 200, ok: true, text: async () => '<p>hello</p>', json: async () => ({ data: [] }), bytes: async () => new Uint8Array(),
})

function inlineTool(name: string, run: Tool['run']): Tool {
  return { spec: { name, description: name, parameters: { type: 'object', properties: {} } }, run }
}

// —— AT1: 挂起工具(忽略 signal、永不 resolve)→ 守卫在 timeoutMs 内兜底返回 error,不卡死 ——
test('AT1: 挂起工具被超时兜底,不阻塞', async () => {
  const hang = inlineTool('hang', () => new Promise<never>(() => {}))
  const t0 = Date.now()
  const r = await withGuard(hang, { timeoutMs: 60 }).run({}, noopCtx())
  const elapsed = Date.now() - t0
  assert.equal((r.data as { timedOut?: boolean }).timedOut, true)
  assert.match(r.llmContent, /超时/)
  assert.ok(elapsed < 2000, `应在超时后很快返回,实际 ${elapsed}ms`)
})

// —— AT2: 正常工具 → 透传,结果不变 ——
test('AT2: 正常工具透传', async () => {
  const r = await withGuard(fixedTool('ok', 'hi'), { timeoutMs: 1000 }).run({}, noopCtx())
  assert.equal(r.llmContent, 'hi')
})

// —— AT3: 超时时子 signal 被 abort(守约工具能收到)——
test('AT3: 超时会 abort 子 signal', async () => {
  let sawAbort = false
  const watch = inlineTool('watch', (_a, _c, signal) => new Promise<never>(() => { signal?.addEventListener('abort', () => { sawAbort = true }) }))
  await withGuard(watch, { timeoutMs: 40 }).run({}, noopCtx())
  await new Promise((res) => setTimeout(res, 20))
  assert.equal(sawAbort, true)
})

// —— AT3b: 父 signal 取消 → 上抛 AbortError(loop 认作 aborted,不当成普通 error)——
test('AT3b: 父 signal 取消上抛 AbortError', async () => {
  const ac = new AbortController()
  const watch = inlineTool('watch2', (_a, _c, signal) => new Promise((_res, rej) => { signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))) }))
  const p = withGuard(watch, { timeoutMs: 5000 }).run({}, noopCtx(), ac.signal)
  ac.abort()
  await assert.rejects(p, (e: unknown) => e instanceof DOMException && e.name === 'AbortError')
})

// —— 遥测钩子被调用,字段正确 ——
test('遥测钩子上报 name/ms/ok/bytes', async () => {
  const seen: ToolTelemetry[] = []
  await withGuard(fixedTool('m', 'abcd'), { timeoutMs: 1000, onTelemetry: (t) => seen.push(t) }).run({}, noopCtx())
  assert.equal(seen.length, 1)
  assert.equal(seen[0].name, 'm')
  assert.equal(seen[0].ok, true)
  assert.equal(seen[0].timedOut, false)
  assert.equal(seen[0].bytes, 4)
})

// —— AT4: 守卫套全部真实工具 → spec 保留、调用都回 string llmContent、无抛逃逸 ——
test('AT4: 守卫套全部真实工具不破坏契约', async (t) => {
  const ws = await makeWs(t)
  const tools = [...ENV_TOOLS, runCodeTool, ...createResearchTools({ http: stubHttp })]
  const guarded = tools.map((tl) => withGuard(tl, { timeoutMs: 3000 }))
  assert.equal(guarded.length, tools.length)
  const ctx = noopCtx({ workspace: ws })
  const argsByTool: Record<string, Record<string, unknown>> = {
    read_file: { path: 'nope.md' }, write_file: { path: 'a.md', content: 'x' }, edit_file: { path: 'nope.md', old_string: 'a', new_string: 'b' },
    list_dir: {}, grep: { pattern: 'x' }, glob: { pattern: '*' },
    run_code: { language: 'node', code: '' }, // 空 code 早退,不真起进程
    search_papers: { query: 'x' }, get_citations: { paper_id: 'x' }, fetch_url: { url: 'http://x' }, search_web: { query: 'x' }, extract_pdf: { path: 'nope.pdf' },
  }
  for (const g of guarded) {
    const r = await g.run(argsByTool[g.spec.name] ?? {}, ctx)
    assert.equal(typeof r.llmContent, 'string', `${g.spec.name} 应回 string llmContent`)
    assert.ok(tools.some((x) => x.spec.name === g.spec.name), `${g.spec.name} spec 保留`)
  }
})
