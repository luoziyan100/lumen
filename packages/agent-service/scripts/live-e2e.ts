/**
 * 真实模型端到端冒烟：用 OpenAI adapter 连第三方代理，跑真实 runAgent（真用工具）。
 * 不进 npm test（要网络 + key + 花钱）。录制轨迹写进 tests/replay/fixtures/openai-live.json。
 *
 * 运行：
 *   XK=sk-... BASE=https://xuedingtoken.com MODEL=claude-sonnet-4-6 \
 *   node --experimental-strip-types scripts/live-e2e.ts
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { Thread } from '../src/core/thread.ts'
import { runAgent } from '../src/core/loop.ts'
import { DEFAULT_LIMITS } from '../src/core/limits.ts'
import type { ToolContext } from '../src/core/tool.ts'
import { FsWorkspace } from '../src/workspace/fs-workspace.ts'
import { ENV_TOOLS } from '../src/tools/env/fs-tools.ts'
import {
  createOpenAIAdapter,
  createOpenAIFetchTransport,
  createOpenAIRecordingTransport,
  type OpenAIResponseBody,
} from '../src/adapters/openai.ts'

const apiKey = process.env.XK
if (!apiKey) {
  console.error('缺少 XK 环境变量（API key）')
  process.exit(1)
}
const baseUrl = process.env.BASE ?? 'https://xuedingtoken.com'
const model = process.env.MODEL ?? 'claude-opus-4-8' // 当前代理最稳的可用 Claude；sonnet 常 accounts-exhausted

const recorded: OpenAIResponseBody[] = []
const transport = createOpenAIRecordingTransport(createOpenAIFetchTransport({ apiKey, baseUrl }), recorded)
const adapter = createOpenAIAdapter({ transport, model })

const wsRoot = mkdtempSync(path.join(tmpdir(), 'lumen-live-'))
const workspace = new FsWorkspace({ root: wsRoot })

const ctx: ToolContext = {
  taskId: 'live-1',
  agentRole: 'main',
  depth: 0,
  spawn: async () => ({ llmContent: 'no spawn' }),
  emit: (e) => console.log(`  · event: ${e.kind}`),
  workspace,
  deps: {},
}

const thread = new Thread([
  { role: 'system', content: '你是 Lumen 研究 agent。你有工作区文件工具。必须真的调用工具完成任务，不要假装。' },
  {
    role: 'user',
    content: '请用 write_file 把一句关于"研究"的中文短句写进 notes/line.md，然后用 read_file 读回它，最后把读到的原文告诉我。',
  },
])

console.log(`[live-e2e] model=${model} base=${baseUrl}`)
const result = await runAgent({ thread, model: adapter, tools: ENV_TOOLS, limits: DEFAULT_LIMITS, ctx })

console.log('\n=== 结果 ===')
console.log('status:', result.status)
console.log('reply :', result.reply)
console.log('模型调用轮数:', recorded.length)
const wrote = thread.messages.some((m) => m.role === 'tool_result' && m.content.length > 0)
console.log('工作区文件:', await workspace.listDir('notes').then((e) => e.map((x) => x.name)).catch(() => []))
console.log('线程里有 tool_result:', wrote)

// 默认写临时文件，不污染 tests/replay/fixtures 里的回归基线（代理输出有损 + 隐藏注入，不可当真理）。
// 要刷新真实基线时显式传 OUT=…/tests/replay/fixtures/openai-live.json。
const outPath = process.env.OUT ?? path.join(tmpdir(), 'lumen-live-recording.json')
writeFileSync(outPath, JSON.stringify(recorded, null, 2))
console.log('\n录制已写入:', outPath)
