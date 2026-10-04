/**
 * [INPUT]: Vite、React、正式或显式 Mastra 数据目录
 * [OUTPUT]: 开发服务和桌面网页构建配置
 * [POS]: 浏览器开发入口；只注入私有 Mastra 发现身份，失败显示可重试错误，无旧 WS 回退
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { lstatSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import * as path from 'node:path'
import { widgetReceiverPlugin } from './scripts/vite-widget-receiver'

// --- 开发页面每次加载读取私有发现；生产桌面身份由原生层注入 ---
function readConnection() {
  const root = process.env.LUMEN_MASTRA_HOME ?? path.join(homedir(), '.lumen-mastra')
  let fd: number | undefined
  try {
    if (!path.isAbsolute(root)) throw new Error('Data root must be absolute')
    const directory = lstatSync(root), file = path.join(root, 'mastra-service.json'), before = lstatSync(file)
    const uid = process.getuid?.()
    if (!directory.isDirectory() || directory.isSymbolicLink() || directory.mode & 0o022 || directory.uid !== uid) throw new Error('Data root must be private')
    if (!before.isFile() || before.isSymbolicLink() || before.mode & 0o077 || before.uid !== uid) throw new Error('Discovery must be private')
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
    const opened = fstatSync(fd)
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.mode & 0o077 || opened.uid !== uid) throw new Error('Discovery changed')
    const bytes = Buffer.alloc(8193), length = readSync(fd, bytes, 0, bytes.length, null)
    if (length > 8192) throw new Error('Discovery too large')
    const value = JSON.parse(bytes.subarray(0, length).toString('utf8')), url = new URL(value.baseUrl)
    if (value.engine !== 'mastra' || value.version !== 1 || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.origin !== value.baseUrl || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/i.test(value.token)) throw new Error('Invalid discovery')
    return { baseUrl: url.origin, token: value.token }
  } catch { return { baseUrl: '', token: '', error: '无法读取本机研究服务，请确认 Mastra 服务已启动且发现文件权限正确。' } }
  finally { if (fd !== undefined) closeSync(fd) }
}

function injectMastraConnection(): Plugin {
  return { name: 'inject-mastra-connection', apply: 'serve', transformIndexHtml() {
    return [{ tag: 'script', children: `window.__LUMEN_MASTRA__=${JSON.stringify(readConnection()).replace(/</g, '\\u003c')}`, injectTo: 'head' }]
  } }
}

// 生产 web 版(公开 demo)注入严格 CSP:script-src 'self' 挡 XSS 注入外部/inline 脚本偷 key —— 根本防线。
// 只在 build 生效(apply:'build'),不影响 vite dev 的 HMR。Tauri 桌面版走 tauri.conf.json 自己的 CSP。
function injectCsp(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'", // 无 unsafe-inline/eval:内联与外部脚本都被挡,XSS 偷不到 localStorage/sessionStorage
    "connect-src 'self' http://127.0.0.1:* http://localhost:*",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net", // 字体 CDN(与 Tauri CSP 对齐);style 不能执行 JS
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-src 'self'", // widget receiver 同源页(非 srcdoc,避开父 script-src 继承)
    "frame-ancestors 'none'", // 防点击劫持(反代 HTTP header 里真正生效)
  ].join('; ')
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head' }]
    },
  }
}

// Tauri 期望固定 dev 端口
export default defineConfig({
  plugins: [react(), tailwindcss(), injectMastraConnection(), injectCsp(), widgetReceiverPlugin()],
  clearScreen: false,
  server: { port: 5180, strictPort: true },
})
