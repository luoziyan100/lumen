/**
 * Lumen LUI —— 主屏只有聊天：user / assistant / error 气泡 + 输入框。
 * 内部状态（route/budget/trace/evidence）后续放抽屉，不堆主流（遵循 V2 LUI 原则）。
 */
import { useState } from 'react'
import { useAgent } from './useAgent'

const SERVICE_URL = (window as { __LUMEN_WS__?: string }).__LUMEN_WS__ ?? 'ws://localhost:8787'
// token 来源：Tauri 注入 window.__LUMEN_TOKEN__；浏览器 dev 用页面 URL 的 ?token=（从 ~/.lumen/agent-service.json 拷）
const SERVICE_TOKEN =
  (window as { __LUMEN_TOKEN__?: string }).__LUMEN_TOKEN__ ??
  new URLSearchParams(window.location.search).get('token') ??
  undefined

export function App() {
  const { messages, running, send } = useAgent(SERVICE_URL, 'default', SERVICE_TOKEN)
  const [input, setInput] = useState('')

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const text = input.trim()
    if (!text || running) return
    setInput('')
    await send(text)
  }

  return (
    <div className="lumen-app">
      <header className="lumen-titlebar">Lumen · 研究</header>
      <main className="lumen-chat">
        {messages.map((m) => (
          <div key={m.id} className={`bubble bubble-${m.role}`}>
            {m.content}
          </div>
        ))}
        {running && <div className="bubble bubble-status">思考中…</div>}
      </main>
      <form className="lumen-composer" onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="问点什么，或让它去研究…"
          disabled={running}
        />
        <button type="submit" disabled={running || !input.trim()}>
          发送
        </button>
      </form>
    </div>
  )
}
