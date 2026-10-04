/**
 * [INPUT]: 显式指定的旧 Settings JSON、新应用与官方模型 SDK
 * [OUTPUT]: 实际模型读写文件/子代回传的原型结果；仅输出非敏感状态
 * [POS]: P0 真模型验证入口，数据落临时目录，凭证仅在内存中使用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readModelProfile } from '../src/config.ts'
import { createApplication } from '../src/application.ts'

const settingsPath = process.argv[2]
if (!settingsPath) throw new Error('Pass the explicit settings file path')
const model = await readModelProfile(settingsPath)
const root = await mkdtemp(join(tmpdir(), 'lumen-mastra-live-'))
const workspace = join(root, 'projects/probe/tasks/research')
await mkdir(workspace, { recursive: true })
await writeFile(join(workspace, 'source.md'), '# 实验材料\n样本为 12 篇论文，排除其中 3 篇，最终纳入 9 篇。核对码 LUMEN-P0-9。\n')
const app = await createApplication({ dataRoot: root, model })
try {
  const session = await app.session('probe', 'research')
  const seen: string[] = []
  session.subscribe(event => {
    if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    if (event.type === 'tool_start' && event.toolName === 'agent-reader') seen.push('delegated')
    if (event.type === 'error') seen.push('error')
  })
  const timer = setTimeout(() => session.abort(), 90000)
  try {
    await session.sendMessage({ content: '请先调用 reader 子代理读取 source.md，核对样本数量和核对码。然后根据子代理结果，用 write_file 写 notes/result.md，必须包含来源文件名、最终纳入数量和原核对码。不要问问题，不要省略工具调用。' })
  } finally { clearTimeout(timer) }
  const content = await readFile(join(workspace, 'notes/result.md'), 'utf8')
  if (!content.includes('LUMEN-P0-9') || !content.includes('source.md') || !seen.includes('delegated')) throw new Error('Live acceptance failed: missing source, verification code, or delegation')
  process.stdout.write(JSON.stringify({ provider: model.provider, model: model.model, delegated: true, fileCreated: true, sourceVerified: true, errors: seen.filter(x => x === 'error').length }) + '\n')
} finally {
  await app.close()
  await rm(root, { recursive: true, force: true })
}
