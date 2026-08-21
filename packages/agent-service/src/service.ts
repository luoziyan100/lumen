/**
 * [INPUT]: storage / runtime / protocol / tools / adapters
 * [OUTPUT]: createService（可测工厂）+ 顶层 main（headless 启动）
 * [POS]: §4 服务入口。组装真实依赖，起 localhost WS，写 portfile；关窗口不影响它。
 *        静态工具只经 tools/registry.buildStaticTools,不在本文件拼装。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 运行：ANTHROPIC_API_KEY=... node --experimental-strip-types src/service.ts
 */
import { homedir } from 'node:os'
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase } from './storage/db.ts'
import { TaskStore } from './storage/task-store.ts'
import { ProjectStore } from './storage/project-store.ts'
import { SettingsStore } from './storage/settings.ts'
import { AgentRuntime, defaultSystemPrompt } from './runtime/agent-runtime.ts'
import { startServer, type ServerHandle } from './protocol/server.ts'
import { PROTOCOL_VERSION } from './protocol/version.ts'
import {
  ImageStore,
  createLookAtImageTool,
  shouldStripImagesForModel,
  visionEnvFromProcess,
} from './tools/env/vision/index.ts'
import { createUnpdfEngine } from './tools/research/index.ts'
import { buildStaticTools } from './tools/registry.ts'
import { buildRoles } from './agents/roles.ts'
import { createClaudeAdapter, createClaudeStreamFetchTransport, createFetchTransport } from './adapters/claude.ts'
import { createOpenAIAdapter, createOpenAIFetchTransport, createOpenAIStreamFetchTransport } from './adapters/openai.ts'
import type { ModelPort } from './core/model-port.ts'
import { resolveContextWindow } from './storage/context-budget.ts'

export interface ServiceConfig {
  home?: string
  port?: number
  apiKey?: string
  model?: string
  provider?: 'anthropic' | 'openai' // openai = OpenAI-Chat 兼容接口
  baseUrl?: string
  host?: string // WS 监听地址；'::' = 双栈（同时收 127.0.0.1 / ::1 / localhost）
  libraryRoot?: string
  modelPort?: ModelPort // 测试可直接注入
  token?: string // 不填则每次启动生成随机 token；客户端从 portfile 读
  demo?: boolean // demo 模式(或 LUMEN_DEMO=1):公网多访客,剔除 run_code(云上无沙箱=RCE)
  maxUploadBytes?: number // /upload 单次上限;默认 25MB
  buildModel?: (cfg: { provider: 'anthropic' | 'openai'; model: string; apiKey: string; baseUrl?: string }) => ModelPort // demo 连接级 model 工厂(测试注入)
}

export interface Service {
  runtime: AgentRuntime
  token: string
  settings: SettingsStore
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
  const workspacesDir = path.join(home, 'workspaces')
  const projects = new ProjectStore(db, workspacesDir)
  const demo = config.demo ?? process.env.LUMEN_DEMO === '1'

  // 出厂默认 = 显式 config > env/.env;用户覆盖层在 ~/.lumen/settings.json(设置弹窗写入)
  const settings = new SettingsStore(path.join(home, 'settings.json'), {
    provider: config.provider ?? (process.env.LUMEN_PROVIDER as 'anthropic' | 'openai' | undefined) ?? 'anthropic',
    baseUrl: config.baseUrl ?? process.env.LUMEN_BASE_URL,
    apiKey: config.apiKey ?? process.env.LUMEN_API_KEY ?? process.env.ANTHROPIC_API_KEY,
    model: config.model ?? process.env.LUMEN_MODEL ?? 'claude-opus-4-8',
  })

  // 从一份模型配置构建 ModelPort(demo 连接级 key、本地 settings 共用同一条路径)
  function buildFromConfig(cfg: { provider: 'anthropic' | 'openai'; model: string; apiKey: string; baseUrl?: string }): ModelPort {
    if (!cfg.apiKey) return errorModel('未提供 API key。')
    if (cfg.provider === 'openai') {
      const baseUrl = cfg.baseUrl ?? 'https://api.openai.com'
      const fetchOpts = { apiKey: cfg.apiKey, baseUrl }
      return createOpenAIAdapter({
        transport: createOpenAIFetchTransport(fetchOpts),
        streamTransport: createOpenAIStreamFetchTransport(fetchOpts),
        model: cfg.model,
        vision: () => settings.effective().vision,
      })
    }
    const fetchOpts = { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }
    return createClaudeAdapter({
      transport: createFetchTransport(fetchOpts),
      streamTransport: createClaudeStreamFetchTransport(fetchOpts),
      model: cfg.model,
    })
  }
  const connModelFactory = config.buildModel ?? buildFromConfig
  function buildModel(): ModelPort {
    const eff = settings.effective()
    if (!eff.apiKey) return errorModel('未配置 LLM API key;请在「设置 → 模型」填入后重试。')
    return buildFromConfig({ provider: eff.provider, model: eff.model, apiKey: eff.apiKey, baseUrl: eff.baseUrl })
  }

  // 模型热切换:runtime 拿到的是代理,设置保存时替换 ref.current,下一次模型调用即生效。
  // 测试注入 modelPort 时视为固定(不随设置切换)。
  // demo 模式:全局无 key(每连接自带);本地:全局 buildModel。测试可注入 modelPort。
  const modelRef = { current: config.modelPort ?? (demo ? errorModel('demo 模式:请在右下角「设置」填入你自己的 API key。') : buildModel()) }
  const model: ModelPort = {
    chat: (messages, tools, signal, handlers) => modelRef.current.chat(messages, tools, signal, handlers),
  }
  const applySettings = (patch: Parameters<SettingsStore['update']>[0]) => {
    const pub = settings.update(patch)
    if (!config.modelPort) modelRef.current = buildModel()
    return pub
  }

  // search_web：Tavily。key 来自 process.env / .env / ~/.lumen/.env（见 loadDotenv）
  const tavilyKey = (process.env.TAVILY_API_KEY ?? '').trim() || undefined
  // 识图:侧车 + look_at_image;去图与否读档案 vision 声明(见 imageBridge)
  const imageStore = new ImageStore()
  const visionEnv = visionEnvFromProcess()
  const lookAtImage = createLookAtImageTool({
    store: imageStore,
    env: visionEnv,
    visionActive: () => {
      const eff = settings.effective()
      return !shouldStripImagesForModel(eff.model, process.env, eff.vision)
    },
  })
  // 工具存在性只走 registry:静态一次;ask_user / memory / skill / subagent 在 execute 按任务构造
  const staticTools = buildStaticTools({
    demo,
    lookAtImage,
    tavilyKey,
    pdfEngine: createUnpdfEngine(),
  })
  const roles = buildRoles(staticTools)

  const runtime = new AgentRuntime({
    store,
    db,
    model,
    sessionDir: path.join(home, 'sessions'),
    workspacesDir,
    projects,
    libraryRoot: config.libraryRoot,
    mainTools: staticTools,
    demo,
    roles,
    imageBridge: {
      store: imageStore,
      // 热读档案:未声明视觉则去图;换芯片即生效
      enabled: () => {
        const eff = settings.effective()
        return shouldStripImagesForModel(eff.model, process.env, eff.vision)
      },
    },
    // 人格(owner 主导,persona.ts)不动;用户自定义指令作为独立小节追加,实时读设置=保存即生效
    buildSystemPrompt: (info) => {
      const base = defaultSystemPrompt(info)
      const extra = settings.effective().userInstructions.trim()
      return extra ? `${base}\n\n# 用户自定义指令\n${extra}` : base
    },
    // 方案 B 上下文预算:窗口随激活 profile 热切换;profile.contextWindow 可覆盖模型名推断
    contextBudget: {
      window: () => {
        const eff = settings.effective()
        return resolveContextWindow(eff.model, eff.contextWindow)
      },
    },
  })

  runtime.sweepInterrupted() // 上次进程死亡遗留的 'running' 任务 → interrupted（可 resume）

  // 默认不做 token 校验(本地单用户;等同旧工作态):浏览器 WS 传 ?token= 会被服务端 4401 拒(已知 bug 待修,
  // 原始 socket 同 token 却通过——差异在浏览器请求头/URL,待查)。设环境变量 LUMEN_TOKEN 即恢复校验。
  const token = config.token ?? process.env.LUMEN_TOKEN ?? ''

  return {
    runtime,
    token,
    settings,
    async start() {
      const handle = await startServer(runtime, {
        port: config.port,
        host: config.host ?? process.env.LUMEN_HOST,
        token,
        maxUploadBytes: config.maxUploadBytes ?? (process.env.LUMEN_MAX_UPLOAD ? Number(process.env.LUMEN_MAX_UPLOAD) : undefined),
        demo,
        buildModel: demo ? connModelFactory : undefined,
        settings: { get: () => settings.toPublic(), update: applySettings },
      })
      const portfile = path.join(home, 'agent-service.json')
      rmSync(portfile, { force: true }) // 先删再写，确保 0600 生效（writeFileSync 的 mode 只在新建时应用）
      writeFileSync(
        portfile,
        JSON.stringify({
          port: handle.port,
          pid: process.pid,
          token,
          startedAt: new Date().toISOString(),
          protocolVersion: PROTOCOL_VERSION,
        }, null, 2),
        { mode: 0o600 },
      )
      return handle
    },
  }
}

/**
 * 启动前注入 .env（不覆盖已有非空环境变量）。
 * 顺序：packages/agent-service/.env → ~/.lumen/.env（后者覆盖前者空槽，便于本机密钥出仓）
 */
function loadDotenv(): void {
  const packageEnv = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')
  const homeEnv = path.join(process.env.LUMEN_HOME ?? path.join(homedir(), '.lumen'), '.env')
  for (const envPath of [packageEnv, homeEnv]) {
    if (!existsSync(envPath)) continue
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
      if (!m) continue
      const key = m[1]!
      const val = m[2]!.trim().replace(/^['"]|['"]$/g, '')
      if (!val) continue // 空值不当配置
      const cur = process.env[key]
      if (cur === undefined || cur.trim() === '') process.env[key] = val
    }
  }
}

// 顶层启动（仅当作为入口运行）。Tauri sidecar / supervisor 经环境变量配置。
if (import.meta.url === `file://${process.argv[1]}`) {
  loadDotenv()
  const service = createService({
    home: process.env.LUMEN_HOME,
    port: process.env.LUMEN_PORT ? Number(process.env.LUMEN_PORT) : undefined,
    libraryRoot: process.env.LUMEN_LIBRARY,
  })
  service.start().then((handle) => {
    const webOk = Boolean((process.env.TAVILY_API_KEY ?? '').trim())
    // eslint-disable-next-line no-console
    console.log(
      `[lumen agent-service] listening ws://127.0.0.1:${handle.port}`
        + ` · search_web=${webOk ? 'tavily' : 'off(no TAVILY_API_KEY)'}`,
    )
  })
}
