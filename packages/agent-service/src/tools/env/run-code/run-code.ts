/**
 * [INPUT]: core 的 Tool/ToolContext/ToolResult、node:child_process、sandbox.ts、net-proxy.ts
 * [OUTPUT]: createRunCodeTool({ skillReadRoots, allowedDomains }) + runCodeTool(空根单例,测/占位)
 * [POS]: §5.4 修订(owner 拍板 2026-07-05):L1 进程纪律(cwd 锁工作区/超时/输出上限/AbortSignal)
 *        + L2 Seatbelt(见 sandbox.ts)。network:true 时箱外起白名单代理,箱内只开代理口。
 *        skill 只读根与域名清单构造注入,不进 ToolContext。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 约定:同 env/fs——失败写进 llmContent 交给模型恢复,不抛出。
 */
import { spawn } from 'node:child_process'
import type { Tool, ToolContext, ToolResult } from '../../../core/tool.ts'
import { DEFAULT_ALLOWED_DOMAINS } from './net-allowlist.ts'
import { startNetProxy, type NetProxyHandle } from './net-proxy.ts'
import { sandboxedCommand } from './sandbox.ts'

const OUT_CAP = 6_000 // 回灌线程的 stdout/stderr 各自上限(超出截断,全量存 scratch)
const BUF_CAP = 400_000 // 进程输出缓冲硬上限,防刷屏撑爆内存
const DEFAULT_TIMEOUT_S = 60
const MAX_TIMEOUT_S = 120

let runSeq = 0

function clip(s: string, cap: number): { text: string; clipped: boolean } {
  return s.length <= cap ? { text: s, clipped: false } : { text: s.slice(0, cap), clipped: true }
}

function languageMismatchHint(language: string, code: string, stderr: string): string {
  if (!stderr.includes('SyntaxError')) return ''
  const line = code.replace(/^\uFEFF/, '').trimStart().split(/\r?\n/, 1)[0] ?? ''
  const looksPy = /^(def\s+\w+\s*\(|print\s*\(|from\s+\S+\s+import\b)/.test(line)
  const looksJs = /^(const|let|var|export)\b/.test(line)
  if (language === 'node' && looksPy) return '\n[检查 language 参数是否与代码语言一致]'
  if (language === 'python' && looksJs) return '\n[检查 language 参数是否与代码语言一致]'
  return ''
}

export function createRunCodeTool(opts: {
  skillReadRoots?: string[]
  allowedDomains?: readonly string[]
} = {}): Tool {
  const skillReadRoots = opts.skillReadRoots ?? []
  const allowedDomains = opts.allowedDomains ?? DEFAULT_ALLOWED_DOMAINS
  return {
  spec: {
    name: 'run_code',
    description:
      '在本会话的沙箱工作区里执行一段代码(node 或 python)。工作目录=工作区根,只能写工作区内文件;' +
      '可读已放行的 Skills 目录(跑包内 scripts);默认无网络;默认 60 秒超时。适合:数据处理、格式转换、批量读写工作区文件、验证一段算法、执行 Skill 脚本。' +
      '需要装包或拉公开数据时设 network:true,走白名单代理(尝试访问名单外域名会被拒并在输出中标注)。' +
      '一般检索/抓取仍优先用专用工具。',
    parameters: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['node', 'python'], description: '运行时:node(随应用内置)或 python(用本机 python3)' },
        code: { type: 'string', description: '要执行的完整代码(node 按 ESM .mjs 运行,可用 import)' },
        timeoutSeconds: { type: 'number', description: `超时秒数,默认 ${DEFAULT_TIMEOUT_S},上限 ${MAX_TIMEOUT_S}` },
        network: {
          type: 'boolean',
          description: 'true=经本地白名单代理联网(默认 false=全禁)。名单外主机会被拒,并在输出里标注「网络白名单拒绝」。',
        },
      },
      required: ['language', 'code'],
    },
  },
  run: async (args, ctx: ToolContext, signal?: AbortSignal): Promise<ToolResult> => {
    const ws = ctx.workspace
    if (!ws) return { llmContent: 'error: workspace 未注入' }
    if (!ws.resolvePath) return { llmContent: 'error: 当前工作区不支持 run_code(缺 resolvePath)' }

    const language = String(args.language) === 'python' ? 'python' : 'node'
    const code = String(args.code ?? '')
    if (!code.trim()) return { llmContent: 'error: code 为空' }
    const timeoutS = Math.min(MAX_TIMEOUT_S, Math.max(1, Math.floor(Number(args.timeoutSeconds ?? DEFAULT_TIMEOUT_S)) || DEFAULT_TIMEOUT_S))
    const network = args.network === true

    const n = ++runSeq
    const rel = `scratch/run-${n}.${language === 'python' ? 'py' : 'mjs'}`
    let script: string
    let cwd: string
    try {
      await ws.writeFile(rel, code)
      script = await ws.resolvePath(rel)
      cwd = await ws.resolvePath('.')
    } catch (error) {
      return { llmContent: `error: 准备执行环境失败:${error instanceof Error ? error.message : String(error)}` }
    }

    let proxy: NetProxyHandle | undefined
    if (network) {
      try {
        proxy = await startNetProxy({ allowedDomains })
      } catch (error) {
        return { llmContent: `error: 启动网络代理失败:${error instanceof Error ? error.message : String(error)}` }
      }
    }

    const runtimeCmd = language === 'python' ? 'python3' : process.execPath
    const runtimeArgs = language === 'node' && network ? ['--use-env-proxy', script] : [script]
    const { cmd, args: fullArgs, sandboxed } = sandboxedCommand(runtimeCmd, runtimeArgs, cwd, {
      skillReadRoots,
      proxyPort: proxy?.port,
    })

    const env: Record<string, string> = {
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin',
      HOME: cwd, // 脚本里的 ~ 落在工作区,不指向真实用户目录
      TMPDIR: '/private/tmp',
      LANG: 'en_US.UTF-8',
    }
    if (proxy) {
      const url = `http://127.0.0.1:${proxy.port}`
      env.HTTP_PROXY = url
      env.HTTPS_PROXY = url
      env.ALL_PROXY = url
      env.http_proxy = url
      env.https_proxy = url
      env.all_proxy = url
      env.NODE_USE_ENV_PROXY = '1'
    }

    return await new Promise<ToolResult>((resolve) => {
      const finish = async (result: ToolResult): Promise<void> => {
        const denied = proxy?.formatDenials() ?? ''
        if (proxy) {
          try { await proxy.close() } catch { /* 收尾失败不影响结果 */ }
          proxy = undefined
        }
        if (denied) result.llmContent += `\n${denied}`
        resolve(result)
      }
      const child = spawn(cmd, fullArgs, {
        cwd,
        env,
        signal,
        timeout: timeoutS * 1000,
        killSignal: 'SIGKILL',
      })
      let out = ''
      let err = ''
      child.stdout.on('data', (d: Buffer) => { if (out.length < BUF_CAP) out += d })
      child.stderr.on('data', (d: Buffer) => { if (err.length < BUF_CAP) err += d })
      child.on('error', (e: NodeJS.ErrnoException) => {
        if (e.name === 'AbortError') { void finish({ llmContent: 'run_code 已取消' }); return }
        const hint = language === 'python' && e.code === 'ENOENT' ? '(本机未检测到 python3)' : ''
        void finish({ llmContent: `error: 启动失败:${e.message}${hint}` })
      })
      child.on('close', async (exitCode, sig) => {
        const timedOut = sig === 'SIGKILL'
        const o = clip(out, OUT_CAP)
        const e = clip(err, OUT_CAP)
        let overflowNote = ''
        if (o.clipped || e.clipped) {
          const dump = `scratch/run-${n}-output.txt`
          try {
            await ws.writeFile(dump, `--- stdout ---\n${out}\n--- stderr ---\n${err}\n`)
            overflowNote = `\n[输出超长已截断,全量在 ${dump},可用 read_file/grep 查看]`
          } catch { overflowNote = '\n[输出超长已截断]' }
        }
        const status = timedOut
          ? `超时(${timeoutS}s)被终止`
          : `退出码 ${exitCode ?? `信号 ${sig}`}`
        const guard = sandboxed ? 'Seatbelt 沙箱' : '无 OS 级沙箱(非 macOS,仅进程纪律)'
        const langHint = languageMismatchHint(language, code, err)
        await finish({
          llmContent: `${status} · ${guard} · 脚本已存 ${rel}\n--- stdout ---\n${o.text || '(空)'}\n--- stderr ---\n${e.text || '(空)'}${overflowNote}${langHint}`,
          data: { exitCode, timedOut, sandboxed, script: rel, network },
        })
      })
    })
  },
  }
}

/** 空 skill 根单例:单测与静态占位。任务域走 createRunCodeTool({ skillReadRoots })。 */
export const runCodeTool: Tool = createRunCodeTool()
