/**
 * [INPUT]: Vite、React、正式或显式 Mastra 数据目录
 * [OUTPUT]: 开发服务和桌面网页构建配置；Excalidraw 字体自托管在同源 excalidraw/fonts/，构建时删掉它的 esm.sh 字体回退源（#12609，写法变了构建失败）；Excalidraw 预先进依赖优化，开发时第一次打开白板不再整页重载
 * [POS]: 浏览器开发入口；只注入私有 Mastra 发现身份，失败显示可重试错误，无旧 WS 回退
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { fileURLToPath } from 'node:url'
import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { lstatSync, openSync, fstatSync, readSync, closeSync, constants, cpSync, createReadStream, statSync } from 'node:fs'
import { homedir } from 'node:os'
import * as path from 'node:path'
import { widgetReceiverPlugin } from './scripts/vite-widget-receiver'

// --- 开发页面每次加载读取私有发现；生产桌面身份由原生层注入 ---
function readConnection() {
  const root = process.env.LUMEN_MASTRA_HOME ?? path.join(homedir(), '.lumen-studio')
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

// Excalidraw 默认从 esm.sh 取字体；把包内字体放到同源 excalidraw/fonts/，开发时直接读包目录，构建时拷进产物
const excalidrawFonts = fileURLToPath(new URL('../prod/fonts', import.meta.resolve('@excalidraw/excalidraw')))
function serveExcalidrawFonts(): Plugin {
  let outDir = ''
  return {
    name: 'excalidraw-fonts',
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir) },
    configureServer(server) {
      server.middlewares.use('/excalidraw/fonts/', (request, response, next) => {
        const file = path.join(excalidrawFonts, decodeURIComponent((request.url ?? '').split('?')[0]))
        if (!file.startsWith(excalidrawFonts + path.sep) || !file.endsWith('.woff2')) return next()
        try { statSync(file) } catch { return next() }
        response.setHeader('Content-Type', 'font/woff2')
        createReadStream(file).pipe(response)
      })
    },
    closeBundle() { cpSync(excalidrawFonts, path.join(outDir, 'excalidraw', 'fonts'), { recursive: true }) },
  }
}

// Excalidraw 给每个字体都在自托管地址之后追加 esm.sh 回退源；CSP 拒绝它，每次挂载控制台约 460 条报错（excalidraw/excalidraw#12609）。
// 构建时只删这一处追加；写死这一种写法，匹配不到就让构建失败，上游改了能发现。上游修好（出开关）后删掉这个插件。
// 开发服务走依赖预构建，不经过这里：开发时控制台仍有这些报错。
const ESM_FALLBACK = /return (\w+)\.push\(new URL\(\w+,\w+\.ASSETS_FALLBACK_URL\)\),\1\}/g
function stripExcalidrawEsmFallback(): Plugin {
  let stripped = 0
  return {
    name: 'excalidraw-strip-esm-fallback',
    apply: 'build',
    transform(code, id) {
      if (!/[\\/]@excalidraw[\\/]excalidraw[\\/]dist[\\/]prod[\\/]/.test(id) || !code.includes('ASSETS_FALLBACK_URL')) return null
      const found = code.match(ESM_FALLBACK)?.length ?? 0
      if (found !== 1) this.error(`Excalidraw 的 esm.sh 字体回退写法变了（匹配到 ${found} 处，应为 1）：查 excalidraw/excalidraw#12609，再改或删这个插件`)
      stripped++
      return { code: code.replace(ESM_FALLBACK, 'return $1}'), map: null }
    },
    generateBundle() {
      if (stripped !== 1) this.error(`没有找到 Excalidraw 的 esm.sh 字体回退（处理了 ${stripped} 个模块，应为 1）：查 excalidraw/excalidraw#12609，再改或删这个插件`)
    },
  }
}

// Tauri 期望固定 dev 端口
// 设计系统以 file: 依赖链接在仓库外；开发服务器需显式允许读取其真实目录。
const designSystemRoot = fileURLToPath(new URL('.', import.meta.resolve('yan-design-system/tokens.css'))).replace(/\/css\/$/, '')

export default defineConfig({
  plugins: [react(), tailwindcss(), injectMastraConnection(), injectCsp(), widgetReceiverPlugin(), serveExcalidrawFonts(), stripExcalidrawEsmFallback()],
  clearScreen: false,
  server: { port: 5180, strictPort: true, fs: { allow: [searchForWorkspaceRoot(process.cwd()), designSystemRoot] } },
  // 白板按需加载 Excalidraw；不预先列入，开发服务会在第一次打开白板时发现新依赖、重新优化并整页重载
  optimizeDeps: { include: ['@excalidraw/excalidraw'] },
})
