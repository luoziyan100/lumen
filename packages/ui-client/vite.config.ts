import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import * as path from 'node:path'

// dev 模式:每次请求 index.html 时读 ~/.lumen/agent-service.json 的 token,
// 注入 window.__LUMEN_TOKEN__。这样浏览器直接开 localhost:5180 就自动带 token;
// 服务重启 token 变了,刷新页面即拿到新的。生产(Tauri)走自己的 __LUMEN_TOKEN__ 注入,不受影响。
function injectLumenToken(): Plugin {
  return {
    name: 'inject-lumen-token',
    apply: 'serve', // 只 dev 注入 token(inline script);生产 build 保持零 inline,CSP script-src 'self' 才干净
    transformIndexHtml() {
      try {
        const pf = JSON.parse(
          readFileSync(path.join(homedir(), '.lumen', 'agent-service.json'), 'utf8'),
        ) as { token?: string }
        if (pf.token) {
          return [{ tag: 'script', children: `window.__LUMEN_TOKEN__=${JSON.stringify(pf.token)}`, injectTo: 'head' }]
        }
      } catch {
        // portfile 不在/读不了:不注入,客户端会明确提示连不上
      }
      return []
    },
  }
}

// 生产 web 版(公开 demo)注入严格 CSP:script-src 'self' 挡 XSS 注入外部/inline 脚本偷 key —— 根本防线。
// 只在 build 生效(apply:'build'),不影响 vite dev 的 HMR。Tauri 桌面版走 tauri.conf.json 自己的 CSP。
function injectCsp(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'", // 无 unsafe-inline/eval:内联与外部脚本都被挡,XSS 偷不到 localStorage/sessionStorage
    "connect-src 'self' ws: wss:", // 允许连后端 WSS;script 被挡后无法发起外泄
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net", // 字体 CDN(与 Tauri CSP 对齐);style 不能执行 JS
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
    "object-src 'none'",
    "base-uri 'self'",
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
  plugins: [react(), tailwindcss(), injectLumenToken(), injectCsp()],
  clearScreen: false,
  server: { port: 5180, strictPort: false },
})
