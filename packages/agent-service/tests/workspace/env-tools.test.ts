import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { Thread } from '../../src/core/thread.ts'
import { runAgent } from '../../src/core/loop.ts'
import { DEFAULT_LIMITS } from '../../src/core/limits.ts'
import { FsWorkspace } from '../../src/workspace/fs-workspace.ts'
import { ENV_TOOLS, readFileTool, writeFileTool } from '../../src/tools/env/fs-tools.ts'
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
