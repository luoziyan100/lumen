/**
 * [INPUT]: storage / runtime / protocol / tools / adapters
 * [OUTPUT]: createService（可测工厂）+ 顶层 main（headless 启动）
 * [POS]: §4 服务入口。组装真实依赖，起 localhost WS，写 portfile；关窗口不影响它
 *
 * 运行：ANTHROPIC_API_KEY=... node --experimental-strip-types src/service.ts
 */
import { homedir } from 'node:os'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import * as path from 'node:path'
import { openDatabase } from './storage/db.ts'
import { TaskStore } from './storage/task-store.ts'
import { AgentRuntime } from './runtime/agent-runtime.ts'
import { startServer, type ServerHandle } from './protocol/server.ts'
import { ENV_TOOLS } from './tools/env/fs-tools.ts'
import { createResearchTools, createUnpdfEngine, createTavilyWebSearch } from './tools/research/index.ts'
import { buildRoles } from './agents/roles.ts'
import { createClaudeAdapter, createFetchTransport } from './adapters/claude.ts'
import { createOpenAIAdapter, createOpenAIFetchTransport } from './adapters/openai.ts'
import type { ModelPort } from './core/model-port.ts'

export interface ServiceConfig {
  home?: string
  port?: number
  apiKey?: string
  model?: string
  provider?: 'anthropic' | 'openai' // openai = OpenAI-Chat 兼容（如 xuedingtoken）
  baseUrl?: string
  host?: string // WS 监听地址；'::' = 双栈（同时收 127.0.0.1 / ::1 / localhost）
  libraryRoot?: string
  modelPort?: ModelPort // 测试可直接注入
  token?: string // 不填则每次启动生成随机 token；客户端从 portfile 读
}

export interface Service {
  runtime: AgentRuntime
  token: string
  start(): Promise<ServerHandle>
}

function errorModel(message: string): ModelPort {
  return {
    async chat() {
      throw new Error(message)
    },
  }
}

export function createService(config: ServiceConfig = {}): Service {
  const home = config.home ?? path.join(homedir(), '.lumen')
  mkdirSync(home, { recursive: true })

  const db = openDatabase(path.join(home, 'lumen.sqlite'))
  const store = new TaskStore(db)

  const apiKey = config.apiKey ?? process.env.LUMEN_API_KEY ?? process.env.ANTHROPIC_API_KEY
  const provider = config.provider ?? (process.env.LUMEN_PROVIDER as 'anthropic' | 'openai' | undefined) ?? 'anthropic'
  const baseUrl = config.baseUrl ?? process.env.LUMEN_BASE_URL
  const modelId = config.model ?? process.env.LUMEN_MODEL ?? 'claude-sonnet-4-6'
  const model: ModelPort = config.modelPort
    ?? (apiKey
      ? (provider === 'openai'
        ? createOpenAIAdapter({ transport: createOpenAIFetchTransport({ apiKey, baseUrl: baseUrl ?? 'https://api.openai.com' }), model: modelId })
        : createClaudeAdapter({ transport: createFetchTransport({ apiKey, baseUrl }), model: modelId }))
      : errorModel('未配置 LLM API key（LUMEN_API_KEY / ANTHROPIC_API_KEY）；请配置后重试。'))

  const tavilyKey = process.env.TAVILY_API_KEY
  const research = createResearchTools({
    pdfEngine: createUnpdfEngine(),
    webSearch: tavilyKey ? createTavilyWebSearch({ apiKey: tavilyKey }) : undefined,
  })
  const mainTools = [...ENV_TOOLS, ...research]
  const roles = buildRoles(mainTools)

  const runtime = new AgentRuntime({
    store,
    model,
    sessionDir: path.join(home, 'sessions'),
    workspacesDir: path.join(home, 'workspaces'),
    libraryRoot: config.libraryRoot,
    mainTools,
    roles,
  })

  runtime.sweepInterrupted() // 上次进程死亡遗留的 'running' 任务 → interrupted（可 resume）

  const token = config.token ?? randomBytes(32).toString('hex')

  return {
    runtime,
    token,
    async start() {
      const handle = await startServer(runtime, { port: config.port, host: config.host ?? process.env.LUMEN_HOST, token })
      const portfile = path.join(home, 'agent-service.json')
      rmSync(portfile, { force: true }) // 先删再写，确保 0600 生效（writeFileSync 的 mode 只在新建时应用）
      writeFileSync(
        portfile,
        JSON.stringify({ port: handle.port, pid: process.pid, token, startedAt: new Date().toISOString() }, null, 2),
        { mode: 0o600 },
      )
      return handle
    },
  }
}

// 顶层启动（仅当作为入口运行）。Tauri sidecar / supervisor 经环境变量配置。
if (import.meta.url === `file://${process.argv[1]}`) {
  const service = createService({
    home: process.env.LUMEN_HOME,
    port: process.env.LUMEN_PORT ? Number(process.env.LUMEN_PORT) : undefined,
    libraryRoot: process.env.LUMEN_LIBRARY,
  })
  service.start().then((handle) => {
    // eslint-disable-next-line no-console
    console.log(`[lumen agent-service] listening ws://127.0.0.1:${handle.port}`)
  })
}
