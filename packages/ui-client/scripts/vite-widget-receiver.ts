/**
 * Vite 插件:提供 /widget-receiver.html(开发中间件 + 构建产物)。
 * 单源 = receiver.ts 的 buildReceiverSrcdoc;iframe 必须同源导航,禁止 srcdoc。
 */
import type { Plugin, ViteDevServer } from 'vite'
import { buildReceiverSrcdoc } from '../src/components/widget/receiver'

const ROUTE = '/widget-receiver.html'

function receiverHtml(): string {
  return buildReceiverSrcdoc('/* theme via postMessage */', false)
}

export function widgetReceiverPlugin(): Plugin {
  return {
    name: 'lumen-widget-receiver',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url !== ROUTE) return next()
        try {
          const html = receiverHtml()
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(html)
        } catch (e) {
          res.statusCode = 500
          res.end(String(e))
        }
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'widget-receiver.html',
        source: receiverHtml(),
      })
    },
  }
}
