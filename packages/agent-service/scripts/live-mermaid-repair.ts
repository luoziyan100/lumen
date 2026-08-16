/**
 * [INPUT]: 运行中的 agent-service + 夹具 taskId
 * [OUTPUT]: 真模型 repair_mermaid 一次,验补 end / 闸门 / 落库未改
 * [POS]: Phase B 实网验收;不进主循环。先跑 inject-mermaid-phase-b-fixture.ts
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { homedir } from 'node:os'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { LumenClient } from '../src/client/agent-client.ts'
import { injectPhaseBFixture, PHASE_B_BAD_MEMORY } from './inject-mermaid-phase-b-fixture.ts'
import { openDatabase } from '../src/storage/db.ts'
import { prepareAndValidate } from '../../ui-client/src/mermaidSyntax.ts'

const require = createRequire(path.join(import.meta.dirname, '../../ui-client/package.json'))

const taskId = process.argv[2] ?? injectPhaseBFixture().taskId

const home = process.env.LUMEN_HOME ?? path.join(homedir(), '.lumen')
const info = JSON.parse(readFileSync(path.join(home, 'agent-service.json'), 'utf8')) as {
  port: number
  token?: string
}

const source = PHASE_B_BAD_MEMORY.trim()
const error = '可能缺少 end 或围栏/括号未闭合'

const client = new LumenClient(`ws://127.0.0.1:${info.port}`, { token: info.token })
await client.connect()

const t0 = Date.now()
let repaired: string
try {
  repaired = await client.repairMermaid(taskId, source, error)
} catch (e) {
  console.log(JSON.stringify({
    ok: false,
    stage: 'ws',
    ms: Date.now() - t0,
    error: e instanceof Error ? e.message : String(e),
  }, null, 2))
  client.close()
  process.exit(1)
}

let gated = false
try {
  await client.repairMermaid(taskId, source, error)
} catch (e) {
  gated = /已经尝试过/.test(e instanceof Error ? e.message : String(e))
}

client.close()

let parseOk = false
let parseError = ''
try {
  const mermaid = require('mermaid') as { parse: (src: string) => Promise<unknown> }
  const validated = await prepareAndValidate(repaired, (src) => mermaid.parse(src))
  parseOk = validated.ok
  if (!validated.ok) parseError = validated.error
} catch (e) {
  parseError = e instanceof Error ? e.message : String(e)
}

const db = openDatabase(path.join(home, 'lumen.sqlite'))
const row = db.prepare(
  `SELECT payload_json FROM task_events WHERE task_id = ? AND kind = 'reply' ORDER BY seq DESC LIMIT 1`,
).get(taskId) as { payload_json: string } | undefined
db.close()
const stored = row ? String((JSON.parse(row.payload_json) as { reply?: string }).reply ?? '') : ''
const storedUnchanged = stored.includes(source) && !/subgraph mem[\s\S]*\bend\b/.test(stored)

const hasEnd = /\bend\b/.test(repaired)
const keepsNodes = /WM/.test(repaired) && /LTM/.test(repaired)

const ok = hasEnd && keepsNodes && gated && storedUnchanged
console.log(JSON.stringify({
  ok,
  ms: Date.now() - t0,
  taskId,
  repaired,
  checks: { hasEnd, keepsNodes, gated, storedUnchanged, parseOk, parseError: parseError || undefined },
}, null, 2))
process.exit(ok ? 0 : 1)
