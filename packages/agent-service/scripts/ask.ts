/**
 * 一行发问：连上正在运行的 agent-service，发一个问题，流式打印事件，完事退出。
 * 用法：node --experimental-strip-types scripts/ask.ts "你的问题"
 * 端口从 ~/.lumen/agent-service.json 自动读取。
 */
import { homedir } from 'node:os'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { LumenClient } from '../src/client/agent-client.ts'

const prompt = process.argv.slice(2).join(' ').trim()
if (!prompt) {
  console.error('用法: ask.ts "你的问题"')
  process.exit(1)
}

const home = process.env.LUMEN_HOME ?? path.join(homedir(), '.lumen')
const info = JSON.parse(readFileSync(path.join(home, 'agent-service.json'), 'utf8')) as { port: number }

const client = new LumenClient(`ws://127.0.0.1:${info.port}`)
await client.connect()

function payload(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}

const done = new Promise<void>((resolve) => {
  client.onEvent((e) => {
    const p = payload(e.payload_json)
    switch (e.kind) {
      case 'status_change':
        if (p.to === 'running') console.log('▸ 任务开始…')
        break
      case 'model_step':
        if (p.content) console.log(`\n🤔 ${String(p.content)}`)
        break
      case 'tool_call':
        console.log(`  🔧 ${String(p.name)}(${JSON.stringify(p.args).slice(0, 160)})`)
        break
      case 'tool_result': {
        const c = String(p.llmContent ?? '')
        console.log(`  ↳ ${c.slice(0, 200)}${c.length > 200 ? ' …' : ''}`)
        break
      }
      case 'spawn':
        console.log(`  ⑂ spawn ${String(p.role)} → ${String(p.status)}`)
        break
      case 'reply':
        console.log(`\n✅ 最终答复:\n${String(p.reply)}`)
        resolve()
        break
      case 'error':
        console.log(`\n❌ 错误: ${String(p.error)}`)
        resolve()
        break
      default:
        break
    }
  })
})

console.log(`Q: ${prompt}\n`)
await client.submit('live', prompt)

const timeout = setTimeout(() => {
  console.log('\n⏱  超时（180s）未完成')
  client.close()
  process.exit(1)
}, 180_000)

await done
clearTimeout(timeout)
client.close()
process.exit(0)
