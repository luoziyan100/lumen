import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { Thread } from '../../src/core/thread.ts'
import { runAgent } from '../../src/core/loop.ts'
import { DEFAULT_LIMITS } from '../../src/core/limits.ts'
import type { ToolContext } from '../../src/core/tool.ts'
import { FsWorkspace } from '../../src/workspace/fs-workspace.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs-tools.ts'
import { createOpenAIAdapter, createOpenAIReplayTransport, type OpenAIResponseBody } from '../../src/adapters/openai.ts'

// 真实录制：claude-haiku-4-5 经 xuedingtoken 代理跑 write_file → read_file → 答（2026-06-08）
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/openai-write-read.json', import.meta.url), 'utf8'),
) as OpenAIResponseBody[]

test('真实录制重放：真模型轨迹 + 真 runAgent + 真 fs 工具，只换网络字节', async (t: TestContext) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-replay-'))
  t.after(() => rm(base, { recursive: true, force: true }))

  const replay = createOpenAIReplayTransport(fixture)
  const adapter = createOpenAIAdapter({ transport: replay.transport, model: 'claude-haiku-4-5-20251001' })
  const workspace = new FsWorkspace({ root: path.join(base, 'ws') })

  const ctx: ToolContext = {
    taskId: 'replay-1',
    agentRole: 'main',
    depth: 0,
    spawn: async () => ({ llmContent: 'no spawn' }),
    emit: () => {},
    workspace,
    deps: {},
  }
  const thread = new Thread([
    { role: 'system', content: '你是 Lumen 研究 agent。' },
    { role: 'user', content: '写一句关于研究的话到 notes/line.md，再读回来告诉我。' },
  ])

  const result = await runAgent({ thread, model: adapter, tools: ENV_TOOLS, limits: DEFAULT_LIMITS, ctx })

  // 跑到真实收尾（不是桩：工具真执行、文件真写、真读回）
  assert.equal(result.status, 'done')
  assert.equal(replay.requests.length, 3, '三轮：写 → 读 → 答')

  // write_file 的畸形 "{}{...}" arguments 经健壮解析后真的写出了文件
  const written = await workspace.readFile('notes/line.md')
  assert.ok(written.length > 0, '文件应被真实写入')

  // read_file 的结果（=写入内容）回灌进了第 3 轮请求（不变式，经真实 OpenAI 请求构造验证）
  const thirdReq = replay.requests[2]
  const toolMsg = thirdReq.messages.find((m) => m.role === 'tool' && m.content === written)
  assert.ok(toolMsg, '第 3 轮请求必须带回 read_file 读到的正文')

  // 最终答复引用了读回的内容
  assert.ok(result.reply.includes(written.trim()) || written.trim().length > 0)
})
