/**
 * [INPUT]: Node 24、显式开发根、Mastra 服务与 Vite 入口
 * [OUTPUT]: 共用独立数据根的服务/客户端开发进程，退出时成对停止
 * [POS]: 仓库开发入口；默认开发数据不触及正式研究或旧数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Lumen requires Node 24 or later')
const root = fileURLToPath(new URL('..', import.meta.url))
const dataRoot = resolve(process.env.LUMEN_MASTRA_HOME ?? join(homedir(), '.lumen-mastra-dev'))
const env = { ...process.env, LUMEN_MASTRA_HOME: dataRoot, LUMEN_DEV_ORIGIN: 'http://localhost:5180' }
const children = [
  spawn(process.execPath, ['--experimental-strip-types', 'packages/mastra-service/src/start.ts', '--data-root', dataRoot], { cwd: root, env, stdio: 'inherit' }),
  spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--host', 'localhost'], { cwd: join(root, 'packages/ui-client'), env, stdio: 'inherit' }),
]
// Vite 在根 workspace 提升安装，路径按实际仓库根指定。
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true; process.exitCode = code
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM')
}
for (const child of children) {
  child.once('error', error => { process.stderr.write(`${error.message}\n`); stop(1) })
  child.once('exit', code => stop(code ?? 0))
}
process.once('SIGINT', () => stop())
process.once('SIGTERM', () => stop())
