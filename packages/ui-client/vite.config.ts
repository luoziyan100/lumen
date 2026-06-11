import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import * as path from 'node:path'

// dev 模式:每次请求 index.html 时读 ~/.lumen/agent-service.json 的 token,
// 注入 window.__LUMEN_TOKEN__。这样浏览器直接开 localhost:5180 就自动带 token;
// 服务重启 token 变了,刷新页面即拿到新的。生产(Tauri)走自己的 __LUMEN_TOKEN__ 注入,不受影响。
function injectLumenToken(): Plugin {
  return {
    name: 'inject-lumen-token',
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

// Tauri 期望固定 dev 端口
export default defineConfig({
  plugins: [react(), injectLumenToken()],
  clearScreen: false,
  server: { port: 5180, strictPort: false },
})
