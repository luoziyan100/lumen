/**
 * [INPUT]: core 的 Tool/ToolContext/ToolResult、node:child_process、sandbox.ts
 * [OUTPUT]: runCodeTool —— 在会话工作区内执行 node/python 代码
 * [POS]: §5.4 修订(owner 拍板 2026-07-05):L1 进程纪律(cwd 锁工作区/超时/输出上限/AbortSignal)
 *        + L2 Seatbelt(见 sandbox.ts)。命令与输出经 ToolResult 自然进入 task_events(诚实可见)。
 *
 * 约定:同 fs-tools——失败写进 llmContent 交给模型恢复,不抛出。
 */
import { spawn } from 'node:child_process'
import type { Tool, ToolContext, ToolResult } from '../../core/tool.ts'
import { sandboxedCommand } from './sandbox.ts'

const OUT_CAP = 6_000 // 回灌线程的 stdout/stderr 各自上限(超出截断,全量存 scratch)
const BUF_CAP = 400_000 // 进程输出缓冲硬上限,防刷屏撑爆内存
const DEFAULT_TIMEOUT_S = 60
const MAX_TIMEOUT_S = 120

let runSeq = 0

function clip(s: string, cap: number): { text: string; clipped: boolean } {
  return s.length <= cap ? { text: s, clipped: false } : { text: s.slice(0, cap), clipped: true }
}

export const runCodeTool: Tool = {
  spec: {
    name: 'run_code',
    description:
      '在本会话的沙箱工作区里执行一段代码(node 或 python)。工作目录=工作区根,只能读写工作区内文件;' +
      '无网络;默认 60 秒超时。适合:数据处理、格式转换、批量读写工作区文件、验证一段算法。' +
      '需要联网取数据时改用检索/抓取工具,再用 run_code 处理落盘文件。',
    parameters: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['node', 'python'], description: '运行时:node(随应用内置)或 python(用本机 python3)' },
        code: { type: 'string', description: '要执行的完整代码(node 按 ESM .mjs 运行,可用 import)' },
        timeoutSeconds: { type: 'number', description: `超时秒数,默认 ${DEFAULT_TIMEOUT_S},上限 ${MAX_TIMEOUT_S}` },
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

    const runtimeCmd = language === 'python' ? 'python3' : process.execPath
    const { cmd, args: fullArgs, sandboxed } = sandboxedCommand(runtimeCmd, [script], cwd)

    return await new Promise<ToolResult>((resolve) => {
      const child = spawn(cmd, fullArgs, {
        cwd,
        env: {
          PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin',
          HOME: cwd, // 脚本里的 ~ 落在工作区,不指向真实用户目录
          TMPDIR: '/private/tmp',
          LANG: 'en_US.UTF-8',
        },
        signal,
        timeout: timeoutS * 1000,
        killSignal: 'SIGKILL',
      })
      let out = ''
      let err = ''
      child.stdout.on('data', (d: Buffer) => { if (out.length < BUF_CAP) out += d })
      child.stderr.on('data', (d: Buffer) => { if (err.length < BUF_CAP) err += d })
      child.on('error', (e: NodeJS.ErrnoException) => {
        if (e.name === 'AbortError') { resolve({ llmContent: 'run_code 已取消' }); return }
        const hint = language === 'python' && e.code === 'ENOENT' ? '(本机未检测到 python3)' : ''
        resolve({ llmContent: `error: 启动失败:${e.message}${hint}` })
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
        resolve({
          llmContent: `${status} · ${guard} · 脚本已存 ${rel}\n--- stdout ---\n${o.text || '(空)'}\n--- stderr ---\n${e.text || '(空)'}${overflowNote}`,
          data: { exitCode, timedOut, sandboxed, script: rel },
        })
      })
    })
  },
}
