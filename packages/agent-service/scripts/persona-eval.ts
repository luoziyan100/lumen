/**
 * P4 回测:拿 Lumen 剧本当 system prompt,跑 Soul Computing 问题,看人格是否被扭转。
 * 与旧那次对照:喂相同的论文正文(约前 20K 字符),所以输出差异只来自 prompt / 模型。
 *
 * 用法(用 ! 前缀跑,key 不落盘):
 *   旧模型:  XK=<key> PROVIDER=openai BASE=https://example.com MODEL=glm-5 \
 *             node --experimental-strip-types <此文件绝对路径>
 *   新模型:  把 MODEL= 换成你切换的那个,再跑一次
 *   (走 Anthropic 原生:PROVIDER=anthropic MODEL=claude-opus-4-8,key 用 ANTHROPIC_API_KEY 或 XK)
 *
 * 把两次输出整段贴回对话,我来和旧输出三方并排、用 old_lumen 的 rubric 打分。
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import * as path from 'node:path'
import { createClaudeAdapter, createFetchTransport } from '../src/adapters/claude.ts'
import { createOpenAIAdapter, createOpenAIFetchTransport } from '../src/adapters/openai.ts'
import type { Message } from '../src/core/types.ts'

const here = import.meta.dirname

// —— system prompt:从 persona-prompt-v1.md 提取 〔L0〕起的正文(单一真相源)——
const promptDoc = readFileSync(path.join(here, '..', '..', '..', 'briefs', 'active', 'persona-prompt-v1.md'), 'utf8')
const l0 = promptDoc.indexOf('## 〔L0〕')
if (l0 < 0) { console.error('找不到 〔L0〕,检查 persona-prompt-v1.md'); process.exit(1) }
const systemPrompt = promptDoc.slice(l0).trim()

// —— user:原问题 + 相同的论文正文节选(隔离信息变量)——
const question = 'Soul Computing:提出"独立意识Agent"的理论框架,这个是什么'
let paper = ''
try {
  paper = readFileSync(path.join(homedir(), '.lumen', 'workspaces', 'default', 'soul_computing_full.txt'), 'utf8').slice(0, 20000)
} catch { console.error('警告:读不到 soul_computing_full.txt,将不附正文(只测纯人格,信息变量不再对齐)') }
const userMsg = paper
  ? `${question}\n\n[以下是该论文正文节选,约前 20000 字符,与之前那次任务工具喂给模型的量一致]\n\n${paper}`
  : question

// —— 模型:provider/base/model/key 全由 env 驱动 ——
const apiKey = process.env.XK ?? process.env.LUMEN_API_KEY ?? process.env.ANTHROPIC_API_KEY
if (!apiKey) { console.error('缺 key:用 XK=<key> 传入'); process.exit(1) }
const provider = process.env.PROVIDER ?? 'openai'
const baseUrl = process.env.BASE
if (!baseUrl) {
  console.error('缺少 BASE 环境变量（OpenAI-compatible base URL）')
  process.exit(1)
}
const modelId = process.env.MODEL ?? 'glm-5'
const maxTokens = Number(process.env.MAXTOK ?? 8192)

const port = provider === 'anthropic'
  ? createClaudeAdapter({ transport: createFetchTransport({ apiKey, baseUrl: process.env.BASE }), model: modelId, maxTokens })
  : createOpenAIAdapter({ transport: createOpenAIFetchTransport({ apiKey, baseUrl }), model: modelId, maxTokens })

const messages: Message[] = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: userMsg },
]

console.error(`[persona-eval] ${provider}/${modelId} · system ${systemPrompt.length} 字符 · 正文 ${paper.length} 字符 · 调用中…`)
const t0 = Date.now()
const resp = await port.chat(messages, [])
console.log(`\n======== ${provider}/${modelId} · Lumen 剧本 ========\n`)
console.log(resp.message.content)
console.log(`\n======== usage ========`)
console.log(JSON.stringify(resp.usage ?? {}), `· ${((Date.now() - t0) / 1000).toFixed(1)}s`)
