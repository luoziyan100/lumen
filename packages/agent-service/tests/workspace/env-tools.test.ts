import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { Thread } from '../../src/core/thread.ts'
import { runAgent } from '../../src/core/loop.ts'
import { DEFAULT_LIMITS } from '../../src/core/limits.ts'
import { FsWorkspace } from '../../src/workspace/fs-workspace.ts'
import { ENV_TOOLS, readFileTool, writeFileTool, grepTool } from '../../src/tools/env/fs-tools.ts'
import { ScriptedModel, assistantToolCall, assistantReply, noopCtx } from '../helpers/scripted-model.ts'

async function makeWs(t: TestContext): Promise<FsWorkspace> {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-envtools-'))
  const root = path.join(base, 'workspace')
  await mkdir(root, { recursive: true })
  t.after(() => rm(base, { recursive: true, force: true }))
  return new FsWorkspace({ root })
}

test('工具：write 然后 read 返回同样内容', async (t) => {
  const ws = await makeWs(t)
  const ctx = noopCtx({ workspace: ws })
  const w = await writeFileTool.run({ path: 'notes/n.md', content: 'X 内容' }, ctx)
  assert.match(w.llmContent, /^ok/)
  const r = await readFileTool.run({ path: 'notes/n.md' }, ctx)
  assert.equal(r.llmContent, 'X 内容')
})

test('工具：缺 workspace 时返回 error 而非抛出', async () => {
  const r = await readFileTool.run({ path: 'x' }, noopCtx())
  assert.match(r.llmContent, /workspace 未注入/)
})

test('工具：read 不存在的文件返回 error（不抛出，留给模型恢复）', async (t) => {
  const ws = await makeWs(t)
  const r = await readFileTool.run({ path: 'missing.md' }, noopCtx({ workspace: ws }))
  assert.match(r.llmContent, /^error:/)
})

test('filesystem as context：agent 写下笔记，下一轮再读回来（跨轮累积状态）', async (t) => {
  const ws = await makeWs(t)
  const model = new ScriptedModel([
    assistantToolCall('w', 'write_file', { path: 'notes/today.md', content: '发现：扩散模型新进展 X' }),
    assistantToolCall('r', 'read_file', { path: 'notes/today.md' }),
    assistantReply('已读回笔记并综合完成'),
  ])
  const thread = new Thread([{ role: 'user', content: '记笔记再读回来' }])

  const result = await runAgent({
    thread,
    model,
    tools: ENV_TOOLS,
    limits: DEFAULT_LIMITS,
    ctx: noopCtx({ workspace: ws }),
  })

  assert.equal(result.status, 'done')
  // 第 3 次模型调用里，read_file 的 tool_result 必须是第 1 轮写入的内容
  const thirdCall = model.calls[2]
  const readResult = thirdCall.find((m) => m.role === 'tool_result' && m.toolCallId === 'r')
  assert.match(readResult?.content ?? '', /扩散模型新进展 X/)
})

test('read_file offset/limit 分段读，引导用 offset 继续读', async (t) => {
  const ws = await makeWs(t)
  const ctx = noopCtx({ workspace: ws })
  const body = 'A'.repeat(100) + 'NEEDLE' + 'B'.repeat(100)
  await ws.writeFile('big.txt', body)
  const r1 = await readFileTool.run({ path: 'big.txt', offset: 0, limit: 50 }, ctx)
  assert.match(r1.llmContent, /读取 0–50/)
  assert.match(r1.llmContent, /offset=50/, '应引导用 offset 继续读')
  assert.equal((r1.data as { nextOffset: number | null }).nextOffset, 50)
  const r2 = await readFileTool.run({ path: 'big.txt', offset: 100, limit: 20 }, ctx)
  assert.match(r2.llmContent, /NEEDLE/, 'offset 必须能跳到文件深部')
})

test('read_file offset 超出文件长度返回 error（不静默给空）', async (t) => {
  const ws = await makeWs(t)
  const r = await readFileTool.run({ path: 's.txt', offset: 999 }, noopCtx({ workspace: ws }))
  await ws.writeFile('s.txt', 'short')
  const r2 = await readFileTool.run({ path: 's.txt', offset: 999 }, noopCtx({ workspace: ws }))
  assert.match(r2.llmContent, /error.*超出/)
})

test('修复闭环：grep 在单文件里定位 @offset → read_file offset 读到旧窗口外的深部内容', async (t) => {
  const ws = await makeWs(t)
  const ctx = noopCtx({ workspace: ws })
  // 模拟长无换行 PDF：核心内容在 ~60K 字符处，超过 extract_pdf(20K) 与旧 read_file(30K) 的窗口
  const body = 'intro '.repeat(10000) + 'FIVE CORE CHALLENGES: data, algorithm, ethics' + ' tail'.repeat(100)
  await ws.writeFile('paper_full.txt', body)

  const g = await grepTool.run({ path: 'paper_full.txt', pattern: 'CORE CHALLENGES' }, ctx)
  const m = g.llmContent.match(/@(\d+)/)
  assert.ok(m, 'grep 必须给出字符偏移')
  const offset = Number(m[1])
  assert.ok(offset > 30000, '核心内容确实落在旧 30K 窗口之外')

  const r = await readFileTool.run({ path: 'paper_full.txt', offset: offset - 20, limit: 200 }, ctx)
  assert.match(r.llmContent, /FIVE CORE CHALLENGES: data, algorithm, ethics/, '深部核心内容现在读得到了')
})
